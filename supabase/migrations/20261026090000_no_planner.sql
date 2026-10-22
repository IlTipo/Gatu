-- Il Planner non c'è più: i promemoria dei pasti arrivano dal Piano alimentare
-- e quello della spesa ricorda cosa resta da comprare nella lista della settimana.
-- Si tolgono anche planner e "ricette cucinate dal planner" condivisi con gli amici.

create or replace function public.push_due()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_out jsonb := '[]'::jsonb;
begin
  -- chi ha almeno un dispositivo, con le sue scelte (o quelle di base): pausa, silenzio, ora locale
  create temporary table if not exists _push_state (
    user_id uuid, muted boolean, quiet boolean, social boolean, meals boolean, shopping boolean, updates boolean,
    local_now timestamp, lunch_time time, dinner_time time, shopping_time time
  ) on commit drop;
  truncate pg_temp._push_state;
  insert into pg_temp._push_state
    select u.user_id,
           coalesce(s.muted_until > now(), false),
           coalesce(s.quiet_enabled, true) and (
             case when coalesce(s.quiet_start, '22:00') > coalesce(s.quiet_end, '08:00')
               then l.t >= coalesce(s.quiet_start, '22:00') or l.t < coalesce(s.quiet_end, '08:00')
               else l.t >= coalesce(s.quiet_start, '22:00') and l.t < coalesce(s.quiet_end, '08:00')
             end),
           coalesce(s.social, true), coalesce(s.meals, true), coalesce(s.shopping, true), coalesce(s.updates, true),
           l.local_now, coalesce(s.lunch_time, '11:30'), coalesce(s.dinner_time, '18:30'), coalesce(s.shopping_time, '17:00')
    from (select distinct user_id from public.push_subscriptions) u
    left join public.notification_settings s on s.user_id = u.user_id
    cross join lateral (
      select now() at time zone coalesce(s.timezone, 'Europe/Rome') as local_now,
             (now() at time zone coalesce(s.timezone, 'Europe/Rome'))::time as t
    ) l;

  -- 1. social: quelle vecchie (oltre 12 ore), di chi è in pausa o le ha spente non partono più
  update public.notifications n set pushed_at = now()
  where n.pushed_at is null and (
    n.created_at < now() - interval '12 hours'
    or not exists (select 1 from pg_temp._push_state s where s.user_id = n.user_id)
    or exists (select 1 from pg_temp._push_state s where s.user_id = n.user_id and (s.muted or not s.social))
  );

  with pending as (
    update public.notifications n set pushed_at = now()
    from pg_temp._push_state s
    where n.pushed_at is null and s.user_id = n.user_id and not s.quiet
    returning n.user_id, n.actor_id, n.kind, n.recipe_id, n.comment_id, n.created_at
  ), named as (
    select p.*, coalesce('@' || a.username, a.display_name, 'Qualcuno') as actor,
           (select r.title from public.recipes r where r.id = p.recipe_id) as recipe,
           (select left(c.body, 100) from public.recipe_comments c where c.id = p.comment_id) as comment
    from pending p join public.profiles a on a.id = p.actor_id
  ), likes as (
    -- i mi piace della stessa ricetta diventano una notifica sola
    select user_id, recipe_id, recipe, count(*) as n, (array_agg(actor order by created_at desc))[1] as last_actor
    from named where kind = 'like' group by user_id, recipe_id, recipe
  ), msgs as (
    select user_id, '❤️ Mi piace' as title,
           case when n > 1 then last_actor || ' e altre ' || (n - 1) || ' persone hanno messo mi piace a «' || coalesce(recipe, 'una ricetta') || '»'
                else last_actor || ' ha messo mi piace a «' || coalesce(recipe, 'una ricetta') || '»' end as body,
           '/recipe/' || recipe_id as url, 'like-' || recipe_id as tag
    from likes
    union all
    select user_id,
           case kind when 'comment' then '💬 Nuovo commento' when 'friend_request' then '👥 Richiesta di amicizia' else '👤 Social' end,
           case kind
             when 'comment' then actor || ' ha commentato «' || coalesce(recipe, 'una ricetta') || '»: ' || coalesce(comment, '')
             when 'follow' then actor || ' ha iniziato a seguirti'
             when 'follow_request' then actor || ' vuole seguirti'
             when 'follow_accepted' then actor || ' ha accettato la tua richiesta'
             when 'friend_request' then actor || ' ti ha mandato una richiesta di amicizia'
             else actor
           end,
           case kind when 'comment' then '/recipe/' || recipe_id when 'friend_request' then '/friends' else '/notifications' end,
           kind || '-' || actor_id
    from named where kind <> 'like'
  )
  select v_out || coalesce(jsonb_agg(jsonb_build_object('user_id', user_id, 'title', title, 'body', left(body, 200), 'url', url, 'tag', tag)), '[]')
    into v_out from msgs;

  -- 2. promemoria dei pasti dal piano alimentare (pranzo e cena all'ora scelta, finestra di 20 minuti, una volta al giorno)
  with slots as (
    select s.user_id, x.slot, x.label, s.local_now
    from pg_temp._push_state s
    cross join lateral (values ('pranzo', 'lunch', s.lunch_time), ('cena', 'dinner', s.dinner_time)) as x(slot, label, at)
    where s.meals and not s.muted and not s.quiet
      and s.local_now::time >= x.at and s.local_now::time < x.at + interval '20 minutes'
  ), fresh as (
    insert into public.push_log (user_id, key)
    select user_id, 'meal:' || label || ':' || local_now::date from slots
    on conflict do nothing
    returning user_id, key
  ), today as (
    -- il giorno del piano per oggi: stesso giorno della settimana, altrimenti in ordine (giorno 1, 2…)
    select f.user_id, s.slot, s.label, p.days,
           extract(isodow from s.local_now)::int as dow
    from fresh f
    join slots s on s.user_id = f.user_id and f.key = 'meal:' || s.label || ':' || s.local_now::date
    join public.diet_plans p on p.user_id = f.user_id
    where jsonb_array_length(p.days) > 0
  ), chosen as (
    select t.user_id, t.slot, t.label,
           coalesce(
             (select d from jsonb_array_elements(t.days) d where (d ->> 'weekday')::int = t.dow limit 1),
             t.days -> ((t.dow - 1) % jsonb_array_length(t.days))
           ) as day
    from today t
  ), msgs as (
    select c.user_id, c.label,
           (select m -> 'options' from jsonb_array_elements(c.day -> 'meals') m where m ->> 'slot' = c.slot limit 1) as options
    from chosen c
  )
  select v_out || coalesce(jsonb_agg(jsonb_build_object(
    'user_id', user_id,
    'title', case label when 'lunch' then '🍝 Oggi a pranzo' else '🌙 Stasera a cena' end,
    'body', left(
      (options -> 0 ->> 'text')
      || case when jsonb_array_length(options) > 1
           then ' (oppure ' || (jsonb_array_length(options) - 1) || case when jsonb_array_length(options) = 2 then ' alternativa)' else ' alternative)' end
           else '' end,
      200),
    'url', '/diet', 'tag', 'meal-' || label)), '[]')
    into v_out from msgs where options is not null and jsonb_array_length(options) > 0;

  -- 3. spesa: all'ora scelta, quello che resta da comprare nella lista di questa settimana
  with due as (
    select s.user_id, s.local_now
    from pg_temp._push_state s
    where s.shopping and not s.muted and not s.quiet
      and s.local_now::time >= s.shopping_time and s.local_now::time < s.shopping_time + interval '20 minutes'
  ), fresh as (
    insert into public.push_log (user_id, key)
    select user_id, 'shop:' || local_now::date from due
    on conflict do nothing
    returning user_id
  ), msgs as (
    select f.user_id,
           (select count(*) from public.shopping_items i
            where i.user_id = f.user_id and not i.checked
              and i.week_start = (d.local_now::date - (extract(isodow from d.local_now)::int - 1))) as n
    from fresh f join due d on d.user_id = f.user_id
  )
  select v_out || coalesce(jsonb_agg(jsonb_build_object(
    'user_id', user_id, 'title', '🛒 Lista della spesa',
    'body', 'Hai ' || n || case when n = 1 then ' cosa' else ' cose' end || ' da comprare questa settimana',
    'url', '/shopping', 'tag', 'shopping')), '[]')
    into v_out from msgs where n > 0;

  -- 4. versioni nuove (nelle 24 ore dopo l'uscita, appena non è più ora di silenzio)
  with fresh as (
    insert into public.push_log (user_id, key)
    select s.user_id, 'release:' || r.version
    from pg_temp._push_state s cross join public.app_releases r
    where s.updates and not s.muted and not s.quiet and r.created_at > now() - interval '24 hours'
    on conflict do nothing
    returning user_id, key
  )
  select v_out || coalesce(jsonb_agg(jsonb_build_object(
    'user_id', f.user_id, 'title', '🎉 È disponibile Morso ' || r.version,
    'body', coalesce(r.notes[1], 'Apri Morso per scoprire le novità'), 'url', '/profile', 'tag', 'release')), '[]')
    into v_out from fresh f join public.app_releases r on f.key = 'release:' || r.version;

  delete from public.push_log where created_at < now() - interval '40 days';
  return v_out;
end;
$$;
revoke execute on function public.push_due() from public, anon, authenticated;

-- gli amici non vedono più il planner (le righe restano, ma non si mostrano a nessuno)
update public.profiles set share_planner = false where share_planner;
