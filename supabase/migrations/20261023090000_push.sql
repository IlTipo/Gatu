-- Notifiche push (anche ad app chiusa): social, promemoria dei pasti, spesa, versioni nuove.
-- Ognuno sceglie quali ricevere, a che ora, le ore di silenzio e la pausa.
-- Ogni minuto il server chiama push_due(), che prepara i messaggi da mandare e li segna come mandati.

-- ---------------------------------------------------------------------------- dispositivi
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) between 40 and 200),
  auth text not null check (char_length(auth) between 10 and 100),
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
create policy push_subscriptions_select_own on public.push_subscriptions
  for select to authenticated using (user_id = (select auth.uid()));
create policy push_subscriptions_insert_own on public.push_subscriptions
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy push_subscriptions_delete_own on public.push_subscriptions
  for delete to authenticated using (user_id = (select auth.uid()));

-- al massimo 10 dispositivi a testa
create function public.push_subscriptions_limit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select count(*) from public.push_subscriptions where user_id = new.user_id) >= 10 then
    raise exception 'too many devices';
  end if;
  return new;
end;
$$;
create trigger push_subscriptions_limit before insert on public.push_subscriptions
  for each row execute function public.push_subscriptions_limit();

-- ---------------------------------------------------------------------------- scelte
create table public.notification_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  social boolean not null default true,
  meals boolean not null default true,
  shopping boolean not null default true,
  updates boolean not null default true,
  lunch_time time not null default '11:30',
  dinner_time time not null default '18:30',
  shopping_time time not null default '17:00',
  quiet_enabled boolean not null default true,
  quiet_start time not null default '22:00',
  quiet_end time not null default '08:00',
  muted_until timestamptz,
  timezone text not null default 'Europe/Rome' check (char_length(timezone) <= 60),
  updated_at timestamptz not null default now()
);
alter table public.notification_settings enable row level security;
create policy notification_settings_select_own on public.notification_settings
  for select to authenticated using (user_id = (select auth.uid()));
create policy notification_settings_insert_own on public.notification_settings
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy notification_settings_update_own on public.notification_settings
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- fuso orario sconosciuto → quello italiano (così i promemoria arrivano sempre)
create function public.notification_settings_check()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  begin
    perform now() at time zone new.timezone;
  exception when others then
    new.timezone := 'Europe/Rome';
  end;
  new.updated_at := now();
  return new;
end;
$$;
create trigger notification_settings_check before insert or update on public.notification_settings
  for each row execute function public.notification_settings_check();

-- ---------------------------------------------------------------------------- server
-- notifiche social già mandate (quelle vecchie non partono tutte insieme alla prima accensione)
alter table public.notifications add column pushed_at timestamptz;
update public.notifications set pushed_at = now();
create index notifications_unpushed_idx on public.notifications (created_at) where pushed_at is null;

-- versioni nuove di Morso (le scrive la pubblicazione del sito)
create table public.app_releases (
  version text primary key,
  notes text[] not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.app_releases enable row level security;
revoke all on public.app_releases from public, anon, authenticated;

-- promemoria e annunci già mandati (uno per giorno/versione)
create table public.push_log (
  user_id uuid not null references auth.users (id) on delete cascade,
  key text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.push_log enable row level security;
revoke all on public.push_log from public, anon, authenticated;

-- chiave pubblica per iscriversi alle notifiche (quella privata resta solo sul server)
create function public.push_public_key()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select value from public.app_settings where key = 'vapid_public';
$$;
revoke execute on function public.push_public_key() from public, anon;
grant execute on function public.push_public_key() to authenticated;

-- Messaggi da mandare adesso: [{user_id, title, body, url, tag}]. Li segna come mandati.
create function public.push_due()
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

  -- 2. promemoria dei pasti (pranzo e cena all'ora scelta, finestra di 20 minuti, una volta al giorno)
  with slots as (
    select s.user_id, x.slot, x.at, s.local_now
    from pg_temp._push_state s
    cross join lateral (values ('lunch', s.lunch_time), ('dinner', s.dinner_time)) as x(slot, at)
    where s.meals and not s.muted and not s.quiet
      and s.local_now::time >= x.at and s.local_now::time < x.at + interval '20 minutes'
  ), fresh as (
    insert into public.push_log (user_id, key)
    select user_id, 'meal:' || slot || ':' || local_now::date from slots
    on conflict do nothing
    returning user_id, key
  ), msgs as (
    select f.user_id, s.slot,
           (select string_agg(r.title, ', ' order by m.position) from public.meal_plan_entries m join public.recipes r on r.id = m.recipe_id
            where m.user_id = f.user_id and m.date = s.local_now::date and m.slot::text = s.slot) as titles
    from fresh f join slots s on s.user_id = f.user_id and f.key = 'meal:' || s.slot || ':' || s.local_now::date
  )
  select v_out || coalesce(jsonb_agg(jsonb_build_object(
    'user_id', user_id,
    'title', case slot when 'lunch' then '🍝 Oggi a pranzo' else '🌙 Stasera a cena' end,
    'body', left(titles, 200), 'url', '/planner', 'tag', 'meal-' || slot)), '[]')
    into v_out from msgs where titles is not null;

  -- 3. spesa: il giorno prima dei pasti in programma
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
    select f.user_id, (select count(*) from public.meal_plan_entries m where m.user_id = f.user_id and m.date = d.local_now::date + 1) as n
    from fresh f join due d on d.user_id = f.user_id
  )
  select v_out || coalesce(jsonb_agg(jsonb_build_object(
    'user_id', user_id, 'title', '🛒 Lista della spesa',
    'body', 'Domani hai ' || n || case when n = 1 then ' pasto' else ' pasti' end || ' in programma: controlla cosa comprare',
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

-- Iscrive questo dispositivo per l'utente collegato. Se il dispositivo era di un altro account
-- (stesso telefono, account diverso) passa al nuovo: le notifiche del vecchio non arrivano più qui.
create function public.register_push(p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  delete from public.push_subscriptions where endpoint = p_endpoint;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values (auth.uid(), p_endpoint, p_p256dh, p_auth);
end;
$$;
revoke execute on function public.register_push(text, text, text) from public, anon;
grant execute on function public.register_push(text, text, text) to authenticated;
