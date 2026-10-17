-- Parte social: username, bio, profilo pubblico/privato, follower, mi piace, commenti, notifiche, segnalazioni.
--
-- Chi vede le ricette CONDIVISE di una persona (shared_with_friends): lei stessa, i suoi amici,
-- chi la segue (seguito accettato) e, se il profilo è pubblico, tutti gli utenti di Morso.
-- Diario, planner e ricette cucinate restano solo per gli amici (friend_feed).
-- Le tabelle non si leggono tra utenti: tutto passa da funzioni che controllano questi permessi.

-- ---------------------------------------------------------------------------- profilo
alter table public.profiles
  add column username text,
  add column bio text,
  add column is_public boolean not null default false,
  add constraint profiles_username_format check (
    username is null or (username ~ '^[a-z0-9._]{3,30}$' and username !~ '^[.]' and username !~ '[.]$' and username !~ '[.][.]')
  ),
  add constraint profiles_bio_len check (bio is null or char_length(bio) <= 160);
create unique index profiles_username_idx on public.profiles (username);

grant update (username, bio, is_public) on public.profiles to authenticated;

-- lo username è libero? (per il controllo mentre lo scrivi)
create function public.username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (select 1 from public.profiles where username = lower(trim(p_username)) and id <> auth.uid());
$$;

-- ---------------------------------------------------------------------------- seguire
create table public.follows (
  follower uuid not null references auth.users (id) on delete cascade,
  followee uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (follower, followee),
  check (follower <> followee)
);
create index follows_followee_idx on public.follows (followee, status);
alter table public.follows enable row level security;
create policy follows_select_own on public.follows
  for select to authenticated using (follower = (select auth.uid()) or followee = (select auth.uid()));

-- io posso vedere le ricette condivise di p_owner?
create function public.can_view_shared(p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and (
    p_owner = auth.uid()
    or exists (select 1 from public.profiles p where p.id = p_owner and p.is_public)
    or exists (select 1 from public.follows f where f.follower = auth.uid() and f.followee = p_owner and f.status = 'accepted')
    or public.is_friend(p_owner)
  );
$$;

-- ---------------------------------------------------------------------------- mi piace, commenti
create table public.recipe_likes (
  user_id uuid not null references auth.users (id) on delete cascade,
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, recipe_id)
);
create index recipe_likes_recipe_idx on public.recipe_likes (recipe_id);
alter table public.recipe_likes enable row level security;
create policy recipe_likes_select_own on public.recipe_likes for select to authenticated using (user_id = (select auth.uid()));

create table public.recipe_comments (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);
create index recipe_comments_recipe_idx on public.recipe_comments (recipe_id, created_at);
alter table public.recipe_comments enable row level security;
create policy recipe_comments_select_own on public.recipe_comments for select to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------- notifiche e segnalazioni
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  actor_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('like', 'comment', 'follow', 'follow_request', 'follow_accepted', 'friend_request')),
  recipe_id uuid references public.recipes (id) on delete cascade,
  comment_id uuid references public.recipe_comments (id) on delete cascade,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;
create policy notifications_select_own on public.notifications for select to authenticated using (user_id = (select auth.uid()));

create table public.comment_reports (
  id uuid primary key default gen_random_uuid(),
  reporter uuid not null references auth.users (id) on delete cascade,
  comment_id uuid not null references public.recipe_comments (id) on delete cascade,
  reason text check (char_length(reason) <= 300),
  created_at timestamptz not null default now(),
  unique (reporter, comment_id)
);
alter table public.comment_reports enable row level security;
create policy comment_reports_select_own on public.comment_reports for select to authenticated using (reporter = (select auth.uid()));

create function public.notify(p_user uuid, p_kind text, p_recipe uuid default null, p_comment uuid default null)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (user_id, actor_id, kind, recipe_id, comment_id)
  select p_user, auth.uid(), p_kind, p_recipe, p_comment
  where p_user is not null and auth.uid() is not null and p_user <> auth.uid();
$$;
revoke execute on function public.notify(uuid, text, uuid, uuid) from public, anon, authenticated;

-- richiesta di amicizia → notifica a chi la riceve
create function public.notify_friend_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (user_id, actor_id, kind) values (new.addressee, new.requester, 'friend_request');
  return new;
end;
$$;
revoke execute on function public.notify_friend_request() from public, anon, authenticated;
create trigger friendships_notify after insert on public.friendships for each row execute function public.notify_friend_request();

-- ---------------------------------------------------------------------------- funzioni: persone
-- breve scheda di una persona (vista da me)
create function public.person_card(p public.profiles)
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
    'is_friend', public.is_friend(p.id)
  );
$$;
revoke execute on function public.person_card(public.profiles) from public, anon, authenticated;

-- cerca persone per @username o nome (almeno 2 lettere)
create function public.search_people(p_query text)
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
        and (p.username like q || '%' or lower(coalesce(p.display_name, '')) like '%' || q || '%')
      order by (p.username like q || '%') desc, p.username
      limit 20
    ) p
  ), '[]'::jsonb);
end;
$$;

-- profilo completo di una persona: scheda, bio, numeri e (se posso vederle) le ricette condivise
create function public.get_person(p_user uuid)
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

-- segui: subito se il profilo è pubblico, altrimenti richiesta. Risposte: following, requested, already, self
create function public.follow_user(p_user uuid)
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
  if not found then raise exception 'not found'; end if;
  if exists (select 1 from public.follows where follower = auth.uid() and followee = p_user) then return 'already'; end if;
  if (select count(*) from public.follows where follower = auth.uid() and status = 'pending') >= 100 then return 'limit'; end if;
  insert into public.follows (follower, followee, status) values (auth.uid(), p_user, case when v_public then 'accepted' else 'pending' end);
  perform public.notify(p_user, case when v_public then 'follow' else 'follow_request' end);
  return case when v_public then 'following' else 'requested' end;
end;
$$;

-- smetti di seguire (o annulla la richiesta)
create function public.unfollow_user(p_user uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.follows where follower = auth.uid() and followee = p_user;
$$;

-- accetta o rifiuta chi vuole seguirmi; togli un follower
create function public.respond_follow(p_follower uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_accept then
    update public.follows set status = 'accepted' where follower = p_follower and followee = auth.uid() and status = 'pending';
    if found then perform public.notify(p_follower, 'follow_accepted'); end if;
  else
    delete from public.follows where follower = p_follower and followee = auth.uid();
  end if;
end;
$$;

create function public.remove_follower(p_follower uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.follows where follower = p_follower and followee = auth.uid();
$$;

-- chi vuole seguirmi (in attesa)
create function public.follow_requests()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(public.person_card(p) order by f.created_at desc), '[]'::jsonb)
  from public.follows f join public.profiles p on p.id = f.follower
  where f.followee = auth.uid() and f.status = 'pending';
$$;

-- se il profilo diventa pubblico, le richieste in attesa vengono accettate
create function public.accept_pending_when_public()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_public and not old.is_public then
    update public.follows set status = 'accepted' where followee = new.id and status = 'pending';
  end if;
  return new;
end;
$$;
revoke execute on function public.accept_pending_when_public() from public, anon, authenticated;
create trigger profiles_public_accepts after update of is_public on public.profiles
  for each row execute function public.accept_pending_when_public();

-- ---------------------------------------------------------------------------- funzioni: ricette condivise
-- il proprietario di una ricetta condivisa che posso vedere (altrimenti null)
create function public.visible_shared_owner(p_recipe uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select r.user_id from public.recipes r
  where r.id = p_recipe and r.shared_with_friends and public.can_view_shared(r.user_id);
$$;
revoke execute on function public.visible_shared_owner(uuid) from public, anon, authenticated;

-- ricetta di un'altra persona: condivisa e visibile a me, oppure di un amico che condivide cucina/planner
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
         or (public.is_friend(r.user_id) and (p.share_cooking or p.share_planner))
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
      'ingredients', coalesce((
        select jsonb_agg(jsonb_build_object('quantity', i.quantity, 'unit', i.unit, 'name', i.name, 'note', i.note,
                                            'aisle', i.aisle, 'estimated', i.estimated) order by i.position)
        from public.recipe_ingredients i where i.recipe_id = r.id), '[]'),
      'steps', coalesce((
        select jsonb_agg(jsonb_build_object('text', s.text, 'timer_seconds', s.timer_seconds) order by s.position)
        from public.recipe_steps s where s.recipe_id = r.id), '[]')
    )
    from public.recipes r join public.profiles p on p.id = r.user_id
    where r.id = p_recipe
  );
end;
$$;

-- mi piace e commenti di una ricetta condivisa (o mia)
create function public.recipe_social(p_recipe uuid)
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
      where c.recipe_id = p_recipe), '[]')
  );
end;
$$;

create function public.toggle_like(p_recipe uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := public.visible_shared_owner(p_recipe);
begin
  if v_owner is null then raise exception 'not shared'; end if;
  delete from public.recipe_likes where recipe_id = p_recipe and user_id = auth.uid();
  if found then return false; end if;
  insert into public.recipe_likes (user_id, recipe_id) values (auth.uid(), p_recipe);
  -- una sola notifica di "mi piace" per persona e ricetta
  if not exists (select 1 from public.notifications where user_id = v_owner and actor_id = auth.uid() and kind = 'like' and recipe_id = p_recipe) then
    perform public.notify(v_owner, 'like', p_recipe);
  end if;
  return true;
end;
$$;

create function public.add_comment(p_recipe uuid, p_body text)
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
  if (select count(*) from public.recipe_comments where user_id = auth.uid() and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'too many comments';
  end if;
  insert into public.recipe_comments (recipe_id, user_id, body) values (p_recipe, auth.uid(), trim(p_body)) returning id into v_id;
  perform public.notify(v_owner, 'comment', p_recipe, v_id);
  return v_id;
end;
$$;

-- cancella: chi l'ha scritto o il proprietario della ricetta
create function public.delete_comment(p_comment uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.recipe_comments c
  using public.recipes r
  where c.id = p_comment and r.id = c.recipe_id and (c.user_id = auth.uid() or r.user_id = auth.uid());
$$;

-- segnala un commento (lo vede chi gestisce Morso); restituisce i dati per l'email
create function public.report_comment(p_comment uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_body text;
  v_author text;
  v_recipe uuid;
begin
  select c.body, p.username, c.recipe_id into v_body, v_author, v_recipe
  from public.recipe_comments c join public.profiles p on p.id = c.user_id
  where c.id = p_comment;
  if v_body is null or public.visible_shared_owner(v_recipe) is null then raise exception 'not found'; end if;
  if (select count(*) from public.comment_reports where reporter = auth.uid() and created_at > now() - interval '1 day') >= 10 then
    raise exception 'too many reports';
  end if;
  insert into public.comment_reports (reporter, comment_id, reason) values (auth.uid(), p_comment, left(p_reason, 300))
  on conflict (reporter, comment_id) do nothing;
  return jsonb_build_object('body', v_body, 'author', v_author, 'reporter', (select username from public.profiles where id = auth.uid()));
end;
$$;

-- "Novità": le ultime ricette condivise da chi seguo e dai miei amici
create function public.social_feed(p_before timestamptz default null, p_limit integer default 30)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(x order by x.created_at desc), '[]'::jsonb) from (
    select r.id, r.title, public.safe_image(r.image_url) as image_url, r.total_minutes, r.kcal_per_serving, r.homemade, r.created_at,
           p.id as author_id, p.username, p.display_name, p.avatar_url,
           (select count(*) from public.recipe_likes l where l.recipe_id = r.id) as likes,
           (select count(*) from public.recipe_comments c where c.recipe_id = r.id) as comments,
           exists (select 1 from public.recipe_likes l where l.recipe_id = r.id and l.user_id = auth.uid()) as liked
    from public.recipes r join public.profiles p on p.id = r.user_id
    where r.shared_with_friends
      and r.user_id <> auth.uid()
      and (p_before is null or r.created_at < p_before)
      and (
        exists (select 1 from public.follows f where f.follower = auth.uid() and f.followee = r.user_id and f.status = 'accepted')
        or public.is_friend(r.user_id)
      )
    order by r.created_at desc
    limit least(greatest(coalesce(p_limit, 30), 1), 60)
  ) x;
$$;

-- ---------------------------------------------------------------------------- funzioni: notifiche
create function public.my_notifications()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(x order by x.created_at desc), '[]'::jsonb) from (
    select n.id, n.kind, n.read, n.created_at, n.recipe_id,
           (select r.title from public.recipes r where r.id = n.recipe_id) as recipe_title,
           (select left(c.body, 120) from public.recipe_comments c where c.id = n.comment_id) as comment,
           p.id as actor_id, p.username, p.display_name, p.avatar_url
    from public.notifications n join public.profiles p on p.id = n.actor_id
    where n.user_id = auth.uid()
    order by n.created_at desc
    limit 100
  ) x;
$$;

create function public.unread_notifications()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.notifications where user_id = auth.uid() and not read;
$$;

create function public.mark_notifications_read()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notifications set read = true where user_id = auth.uid() and not read;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.username_available(text)', 'public.can_view_shared(uuid)', 'public.search_people(text)', 'public.get_person(uuid)',
    'public.follow_user(uuid)', 'public.unfollow_user(uuid)', 'public.respond_follow(uuid, boolean)', 'public.remove_follower(uuid)',
    'public.follow_requests()', 'public.recipe_social(uuid)', 'public.toggle_like(uuid)', 'public.add_comment(uuid, text)',
    'public.delete_comment(uuid)', 'public.report_comment(uuid, text)', 'public.social_feed(timestamptz, integer)',
    'public.my_notifications()', 'public.unread_notifications()', 'public.mark_notifications_read()'
  ]
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;

-- Richiesta di amicizia anche con lo @username (oltre al codice amico).
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
  if v_other is null then return 'not_found'; end if;
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
  insert into public.friendships (requester, addressee) values (v_me, v_other);
  return 'sent';
end;
$$;
