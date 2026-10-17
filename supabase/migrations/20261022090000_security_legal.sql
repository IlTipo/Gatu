-- Sicurezza e privacy (controllo di ottobre 2026):
--  1. il nome iniziale non viene più preso dalla email (era visibile e cercabile da tutti)
--  2. "Blocca utente": chi è bloccato non vede, non segue, non commenta e non manda richieste
--  3. limiti anti-spam che non si aggirano cancellando e rifacendo (segui/smetti, commenta/cancella…)
--  4. foto mostrate agli altri solo dal NOSTRO progetto Supabase, senza "../", e niente copertine
--     copiate dai social altrui (diritti d'autore): si vede il link alla fonte
--  5. ricette degli amici: solo quelle davvero nel loro "cucinate" o planner
--  6. privacy di base per chi si registra da ora: planner e ricette cucinate NON condivisi
--  7. accettazione di Termini e Privacy (con età minima 14 anni) salvata con data e versione
--  8. limite giornaliero di analisi AI anche per tutto il progetto (account finti a raffica)

-- ---------------------------------------------------------------------------- impostazioni
-- Valori del progetto scritti dallo script di installazione (es. il codice del progetto Supabase).
create table public.app_settings (
  key text primary key,
  value text not null
);
alter table public.app_settings enable row level security;
revoke all on public.app_settings from public, anon, authenticated;

-- ---------------------------------------------------------------------------- 1. nome dalla email
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    nullif(left(trim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')), 50), '')
  );
  return new;
end;
$$;

-- chi aveva ancora il nome preso dalla email lo perde (resta lo @username)
update public.profiles p set display_name = null
from auth.users u
where u.id = p.id and p.display_name is not null and p.display_name = split_part(u.email, '@', 1);

-- ---------------------------------------------------------------------------- 6. privacy di base
alter table public.profiles
  alter column share_cooking set default false,
  alter column share_planner set default false,
  add column terms_accepted_at timestamptz,
  add column terms_version text;

-- ---------------------------------------------------------------------------- 7. termini accettati
create function public.accept_terms(p_version text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_version is null or p_version !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'invalid version'; end if;
  update public.profiles set terms_accepted_at = now(), terms_version = p_version where id = auth.uid();
end;
$$;

-- ---------------------------------------------------------------------------- 3. limiti anti-spam
-- Registro delle azioni social: resta anche se l'azione viene annullata, così i limiti valgono davvero.
create table public.action_log (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  created_at timestamptz not null default now()
);
create index action_log_idx on public.action_log (user_id, kind, created_at desc);
alter table public.action_log enable row level security;
revoke all on public.action_log from public, anon, authenticated;

-- true se posso ancora fare quest'azione (e la segna); false se ho superato il limite
create function public.rate_ok(p_kind text, p_max integer, p_window interval)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then return false; end if;
  -- pulizia delle righe vecchie (servono al massimo per un giorno)
  delete from public.action_log where user_id = auth.uid() and created_at < now() - interval '2 days';
  if (select count(*) from public.action_log
      where user_id = auth.uid() and kind = p_kind and created_at > now() - p_window) >= p_max then
    return false;
  end if;
  insert into public.action_log (user_id, kind) values (auth.uid(), p_kind);
  return true;
end;
$$;
revoke execute on function public.rate_ok(text, integer, interval) from public, anon, authenticated;

-- ---------------------------------------------------------------------------- 2. blocchi
create table public.blocks (
  blocker uuid not null references auth.users (id) on delete cascade,
  blocked uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);
create index blocks_blocked_idx on public.blocks (blocked);
alter table public.blocks enable row level security;
create policy blocks_select_own on public.blocks for select to authenticated using (blocker = (select auth.uid()));

-- io e p_user ci siamo bloccati (in una delle due direzioni)?
create function public.blocked_between(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.blocks b
    where (b.blocker = auth.uid() and b.blocked = p_user) or (b.blocker = p_user and b.blocked = auth.uid())
  );
$$;

create function public.block_user(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  if p_user is null or p_user = v_me then raise exception 'invalid user'; end if;
  if not exists (select 1 from public.profiles where id = p_user) then raise exception 'not found'; end if;
  if not public.rate_ok('block', 50, interval '1 day') then raise exception 'too many actions'; end if;
  insert into public.blocks (blocker, blocked) values (v_me, p_user) on conflict do nothing;
  -- via amicizia, follow (in entrambe le direzioni) e notifiche tra i due
  delete from public.friendships
  where least(requester, addressee) = least(v_me, p_user) and greatest(requester, addressee) = greatest(v_me, p_user);
  delete from public.follows where (follower = v_me and followee = p_user) or (follower = p_user and followee = v_me);
  delete from public.notifications where (user_id = v_me and actor_id = p_user) or (user_id = p_user and actor_id = v_me);
end;
$$;

create function public.unblock_user(p_user uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.blocks where blocker = auth.uid() and blocked = p_user;
$$;

-- le persone che ho bloccato
create function public.my_blocks()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'username', p.username, 'display_name', p.display_name, 'avatar_url', p.avatar_url
  ) order by b.created_at desc), '[]'::jsonb)
  from public.blocks b join public.profiles p on p.id = b.blocked
  where b.blocker = auth.uid();
$$;

-- notifiche: mai tra persone bloccate, e una sola uguale al giorno (niente raffiche con segui/smetti)
create or replace function public.notify(p_user uuid, p_kind text, p_recipe uuid default null, p_comment uuid default null)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (user_id, actor_id, kind, recipe_id, comment_id)
  select p_user, auth.uid(), p_kind, p_recipe, p_comment
  where p_user is not null and auth.uid() is not null and p_user <> auth.uid()
    and not public.blocked_between(p_user)
    and (p_kind = 'comment' or not exists (
      select 1 from public.notifications n
      where n.user_id = p_user and n.actor_id = auth.uid() and n.kind = p_kind
        and n.recipe_id is not distinct from p_recipe and n.created_at > now() - interval '1 day'
    ));
$$;
revoke execute on function public.notify(uuid, text, uuid, uuid) from public, anon, authenticated;

create or replace function public.notify_friend_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.notifications n
    where n.user_id = new.addressee and n.actor_id = new.requester and n.kind = 'friend_request'
      and n.created_at > now() - interval '1 day'
  ) then
    insert into public.notifications (user_id, actor_id, kind) values (new.addressee, new.requester, 'friend_request');
  end if;
  return new;
end;
$$;

-- chi può vedere le ricette condivise: come prima, ma mai chi è bloccato
create or replace function public.can_view_shared(p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and (
    p_owner = auth.uid()
    or (
      not public.blocked_between(p_owner)
      and (
        exists (select 1 from public.profiles p where p.id = p_owner and p.is_public)
        or exists (select 1 from public.follows f where f.follower = auth.uid() and f.followee = p_owner and f.status = 'accepted')
        or public.is_friend(p_owner)
      )
    )
  );
$$;

-- scheda di una persona: in più dice se l'ho bloccata
create or replace function public.person_card(p public.profiles)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id,
    'username', p.username,
    'display_name', p.display_name,
    'avatar_url', p.avatar_url,
    'is_public', p.is_public,
    'following', coalesce((select f.status from public.follows f where f.follower = auth.uid() and f.followee = p.id), 'none'),
    'is_friend', public.is_friend(p.id),
    'blocked', exists (select 1 from public.blocks b where b.blocker = auth.uid() and b.blocked = p.id)
  );
$$;
revoke execute on function public.person_card(public.profiles) from public, anon, authenticated;

-- ricerca: niente persone bloccate (in nessuna direzione)
create or replace function public.search_people(p_query text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  q text := lower(trim(coalesce(p_query, '')));
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  q := ltrim(q, '@');
  if char_length(q) < 2 or char_length(q) > 40 then return '[]'::jsonb; end if;
  q := replace(replace(replace(q, '\', ''), '%', ''), '_', '\_');
  return coalesce((
    select jsonb_agg(public.person_card(p) order by (p.username like q || '%') desc, p.username)
    from (
      select * from public.profiles p
      where p.username is not null and p.id <> auth.uid()
        and not public.blocked_between(p.id)
        and (p.username like q || '%' or lower(coalesce(p.display_name, '')) like '%' || q || '%')
      order by (p.username like q || '%') desc, p.username
      limit 20
    ) p
  ), '[]'::jsonb);
end;
$$;

-- profilo di una persona: chi mi ha bloccato per me "non esiste"
create or replace function public.get_person(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v public.profiles;
  v_can boolean;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into v from public.profiles where id = coalesce(p_user, auth.uid());
  if not found then raise exception 'not found'; end if;
  if exists (select 1 from public.blocks b where b.blocker = v.id and b.blocked = auth.uid()) then
    raise exception 'not found';
  end if;
  v_can := public.can_view_shared(v.id);
  return public.person_card(v) || jsonb_build_object(
    'bio', v.bio,
    'is_me', v.id = auth.uid(),
    'follows_me', exists (select 1 from public.follows f where f.follower = v.id and f.followee = auth.uid() and f.status = 'accepted'),
    'can_view', v_can,
    'recipes_count', (select count(*) from public.recipes r where r.user_id = v.id and r.shared_with_friends),
    'followers_count', (select count(*) from public.follows f where f.followee = v.id and f.status = 'accepted'),
    'following_count', (select count(*) from public.follows f where f.follower = v.id and f.status = 'accepted'),
    'recipes', case when v_can then coalesce((
      select jsonb_agg(x order by x.created_at desc) from (
        select r.id, r.title, public.safe_image(r.image_url) as image_url, r.created_at,
               (select count(*) from public.recipe_likes l where l.recipe_id = r.id) as likes
        from public.recipes r
        where r.user_id = v.id and r.shared_with_friends
        order by r.created_at desc
        limit 60
      ) x), '[]') else '[]'::jsonb end
  );
end;
$$;

-- segui: niente persone bloccate, al massimo 100 "segui" al giorno (anche se poi smetti)
create or replace function public.follow_user(p_user uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_public boolean;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_user = auth.uid() then return 'self'; end if;
  select is_public into v_public from public.profiles where id = p_user;
  if not found or public.blocked_between(p_user) then raise exception 'not found'; end if;
  if exists (select 1 from public.follows where follower = auth.uid() and followee = p_user) then return 'already'; end if;
  if (select count(*) from public.follows where follower = auth.uid() and status = 'pending') >= 100 then return 'limit'; end if;
  if not public.rate_ok('follow', 100, interval '1 day') then return 'limit'; end if;
  insert into public.follows (follower, followee, status) values (auth.uid(), p_user, case when v_public then 'accepted' else 'pending' end);
  perform public.notify(p_user, case when v_public then 'follow' else 'follow_request' end);
  return case when v_public then 'following' else 'requested' end;
end;
$$;

-- richiesta di amicizia: niente persone bloccate, al massimo 50 al giorno (anche annullandole)
create or replace function public.send_friend_request(p_code text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_other uuid;
  v_key text := trim(coalesce(p_code, ''));
  v_row public.friendships;
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  if v_key like '@%' then
    select id into v_other from public.profiles where username = lower(substr(v_key, 2));
  else
    select id into v_other from public.profiles where friend_code = upper(v_key);
  end if;
  if v_other is null or public.blocked_between(v_other) then return 'not_found'; end if;
  if v_other = v_me then return 'self'; end if;

  select * into v_row from public.friendships
  where least(requester, addressee) = least(v_me, v_other) and greatest(requester, addressee) = greatest(v_me, v_other);
  if found then
    if v_row.status = 'accepted' or v_row.requester = v_me then return 'already'; end if;
    update public.friendships set status = 'accepted' where id = v_row.id;
    return 'accepted';
  end if;

  if (select count(*) from public.friendships where requester = v_me and status = 'pending') >= 50 then
    return 'limit';
  end if;
  if not public.rate_ok('friend_request', 50, interval '1 day') then return 'limit'; end if;
  insert into public.friendships (requester, addressee) values (v_me, v_other);
  return 'sent';
end;
$$;

-- di chi è il codice amico / @username (per mostrarlo prima di mandare la richiesta)
create function public.invite_preview(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_key text := trim(coalesce(p_code, ''));
  v public.profiles;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if v_key like '@%' then
    select * into v from public.profiles where username = lower(substr(v_key, 2));
  else
    select * into v from public.profiles where friend_code = upper(v_key);
  end if;
  if not found or public.blocked_between(v.id) then return null; end if;
  return public.person_card(v);
end;
$$;

-- commenti: 30 all'ora e 200 al giorno, contando anche quelli poi cancellati
create or replace function public.add_comment(p_recipe uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := public.visible_shared_owner(p_recipe);
  v_id uuid;
begin
  if v_owner is null then raise exception 'not shared'; end if;
  if not public.rate_ok('comment_hour', 30, interval '1 hour') or not public.rate_ok('comment_day', 200, interval '1 day') then
    raise exception 'too many comments';
  end if;
  insert into public.recipe_comments (recipe_id, user_id, body) values (p_recipe, auth.uid(), trim(p_body)) returning id into v_id;
  perform public.notify(v_owner, 'comment', p_recipe, v_id);
  return v_id;
end;
$$;

-- mi piace: al massimo 500 tocchi al giorno
create or replace function public.toggle_like(p_recipe uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := public.visible_shared_owner(p_recipe);
begin
  if v_owner is null then raise exception 'not shared'; end if;
  if not public.rate_ok('like', 500, interval '1 day') then raise exception 'too many actions'; end if;
  delete from public.recipe_likes where recipe_id = p_recipe and user_id = auth.uid();
  if found then return false; end if;
  insert into public.recipe_likes (user_id, recipe_id) values (auth.uid(), p_recipe);
  perform public.notify(v_owner, 'like', p_recipe);
  return true;
end;
$$;

-- commenti di una ricetta: senza quelli delle persone bloccate
create or replace function public.recipe_social(p_recipe uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_owner uuid := public.visible_shared_owner(p_recipe);
begin
  if v_owner is null then raise exception 'not shared'; end if;
  return jsonb_build_object(
    'likes', (select count(*) from public.recipe_likes where recipe_id = p_recipe),
    'liked', exists (select 1 from public.recipe_likes where recipe_id = p_recipe and user_id = auth.uid()),
    'comments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'body', c.body, 'created_at', c.created_at,
        'author_id', p.id, 'username', p.username, 'display_name', p.display_name, 'avatar_url', p.avatar_url,
        'can_delete', c.user_id = auth.uid() or v_owner = auth.uid()
      ) order by c.created_at)
      from public.recipe_comments c join public.profiles p on p.id = c.user_id
      where c.recipe_id = p_recipe and not public.blocked_between(c.user_id)), '[]')
  );
end;
$$;

-- ---------------------------------------------------------------------------- 4. foto mostrate agli altri
create index sources_thumbnail_idx on public.sources (thumbnail_url);

-- Solo foto del nostro progetto Supabase, nella cartella di un utente, con un nome di file pulito.
-- Le copertine copiate dai post social/siti di altri non si mostrano a chi non le ha salvate.
create or replace function public.safe_image(p_url text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_url ~ (
      '^https://' || coalesce((select value from public.app_settings where key = 'project_ref'), '[a-z0-9]+')
      || '\.supabase\.co/storage/v1/object/public/images/[0-9a-f-]{36}/[A-Za-z0-9_-][A-Za-z0-9._-]*$'
    )
    and p_url !~ '[.][.]'
    and not exists (
      select 1 from public.sources s
      where s.thumbnail_url = p_url and s.platform <> 'manual' and s.user_id is distinct from auth.uid()
    )
    then p_url
  end;
$$;

-- foto profilo: solo dalla propria cartella del nostro progetto (vale da ora in poi)
alter table public.profiles drop constraint profiles_avatar_own;
create function public.check_avatar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.avatar_url is not null and (
    new.avatar_url !~ (
      '^https://' || coalesce((select value from public.app_settings where key = 'project_ref'), '[a-z0-9]+')
      || '\.supabase\.co/storage/v1/object/public/images/' || new.id::text || '/[A-Za-z0-9_-][A-Za-z0-9._-]*$'
    )
    or new.avatar_url ~ '[.][.]'
  ) then
    raise exception 'invalid avatar';
  end if;
  return new;
end;
$$;
revoke execute on function public.check_avatar() from public, anon, authenticated;
create trigger profiles_check_avatar before insert or update of avatar_url on public.profiles
  for each row execute function public.check_avatar();

-- caricamenti: anche la modifica di un file non può usare "../"
drop policy "images_update_own" on storage.objects;
create policy "images_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'images' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'images' and (storage.foldername(name))[1] = (select auth.uid())::text and name not like '%..%');

-- ---------------------------------------------------------------------------- 5. ricette degli amici
-- Ricetta di un'altra persona: condivisa e visibile a me, oppure di un amico che la mostra davvero
-- tra le "cucinate" (se condivide la cucina) o nel planner vicino a oggi (se condivide il planner).
create or replace function public.friend_recipe(p_recipe uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_ok boolean;
begin
  select r.user_id,
         (r.shared_with_friends and public.can_view_shared(r.user_id))
         or (
           public.is_friend(r.user_id) and not public.blocked_between(r.user_id) and (
             (p.share_cooking and r.last_cooked_at is not null)
             or (p.share_planner and exists (
               select 1 from public.meal_plan_entries m
               where m.recipe_id = r.id and m.user_id = r.user_id and m.date between current_date - 14 and current_date + 21
             ))
           )
         )
    into v_owner, v_ok
  from public.recipes r join public.profiles p on p.id = r.user_id
  where r.id = p_recipe;
  if v_owner is null or not coalesce(v_ok, false) then raise exception 'not shared'; end if;

  return (
    select jsonb_build_object(
      'title', r.title,
      'description', r.description,
      'image_url', public.safe_image(r.image_url),
      'servings', r.servings,
      'prep_minutes', r.prep_minutes,
      'cook_minutes', r.cook_minutes,
      'total_minutes', r.total_minutes,
      'tags', to_jsonb(r.tags),
      'kcal_per_serving', r.kcal_per_serving,
      'homemade', r.homemade,
      'shared', r.shared_with_friends,
      'author', p.display_name,
      'author_id', p.id,
      'author_username', p.username,
      'author_avatar', p.avatar_url,
      'is_mine', r.user_id = auth.uid(),
      'source', case when s.id is not null and s.url ~ '^https?://' and s.platform <> 'manual' then
        jsonb_build_object('platform', s.platform, 'url', s.url, 'author_name', left(s.author_name, 100)) end,
      'ingredients', coalesce((
        select jsonb_agg(jsonb_build_object('quantity', i.quantity, 'unit', i.unit, 'name', i.name, 'note', i.note,
                                            'aisle', i.aisle, 'estimated', i.estimated) order by i.position)
        from public.recipe_ingredients i where i.recipe_id = r.id), '[]'),
      'steps', coalesce((
        select jsonb_agg(jsonb_build_object('text', st.text, 'timer_seconds', st.timer_seconds) order by st.position)
        from public.recipe_steps st where st.recipe_id = r.id), '[]')
    )
    from public.recipes r
    join public.profiles p on p.id = r.user_id
    left join public.sources s on s.id = r.source_id
    where r.id = p_recipe
  );
end;
$$;

-- storico "cucinata": al massimo 30 al giorno per persona (niente righe a raffica)
create or replace function public.log_cooking()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.last_cooked_at is not null
     and (old.last_cooked_at is null or new.last_cooked_at > old.last_cooked_at + interval '1 hour')
     and (select count(*) from public.cook_log where user_id = new.user_id and cooked_at > now() - interval '1 day') < 30 then
    insert into public.cook_log (user_id, recipe_id, cooked_at)
    values (new.user_id, new.id, least(new.last_cooked_at, now()));
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------- 8. limite AI del progetto
-- Oltre al limite per persona, un tetto giornaliero per tutto il progetto (account finti a raffica).
create or replace function public.consume_extraction_quota(daily_limit integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  used integer;
  v_global integer := coalesce((select value::integer from public.app_settings where key = 'global_daily_ai_limit'), 1500);
begin
  if uid is null or daily_limit is null or daily_limit < 1 then
    return false;
  end if;
  if (select coalesce(sum(extractions), 0) from public.usage_counters where day = current_date) >= v_global then
    return false;
  end if;

  insert into public.usage_counters (user_id, day, extractions)
  values (uid, current_date, 1)
  on conflict (user_id, day)
  do update set extractions = public.usage_counters.extractions + 1
  returning extractions into used;

  if used > least(daily_limit, 500) then
    update public.usage_counters set extractions = extractions - 1
    where user_id = uid and day = current_date;
    return false;
  end if;
  return true;
end;
$$;
create index if not exists usage_counters_day_idx on public.usage_counters (day);

-- ---------------------------------------------------------------------------- permessi
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.accept_terms(text)', 'public.block_user(uuid)', 'public.unblock_user(uuid)', 'public.my_blocks()',
    'public.blocked_between(uuid)', 'public.invite_preview(text)'
  ]
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;
revoke execute on function public.safe_image(text) from public, anon;
grant execute on function public.safe_image(text) to authenticated;
