-- Profilo (foto, nome), consigli "Cosa aggiungeresti?" e amici.
--
-- Privacy: gli amici NON leggono le tabelle degli altri. Vedono solo quello che passa dalle
-- funzioni qui sotto, che controllano ogni volta che l'amicizia sia stata ACCETTATA e che
-- l'altro abbia scelto di condividere quella cosa (ricette cucinate, planner, diario).

-- ---------------------------------------------------------------------------- profilo
alter table public.profiles
  add column avatar_url text,
  add column friend_code text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 8)),
  add column share_cooking boolean not null default true,
  add column share_planner boolean not null default true,
  add column share_diary boolean not null default false,
  add constraint profiles_display_name_len check (display_name is null or char_length(display_name) <= 50),
  -- la foto può stare solo nella propria cartella di Supabase Storage (niente link esterni che traccino gli amici)
  add constraint profiles_avatar_own check (
    avatar_url is null
    or avatar_url ~ ('^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/images/' || id::text || '/[A-Za-z0-9._-]+$')
  );

-- il codice amico non si può cambiare a mano: si possono modificare solo queste colonne
revoke update on public.profiles from authenticated, anon;
grant update (
  display_name, locale, avatar_url, portions, kcal_goal, protein_goal, carbs_goal, fat_goal,
  share_cooking, share_planner, share_diary
) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------- consigli
create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  message text not null check (char_length(trim(message)) between 3 and 1000),
  created_at timestamptz not null default now()
);
alter table public.feedback enable row level security;
create policy feedback_select_own on public.feedback
  for select to authenticated using (user_id = (select auth.uid()));
create policy feedback_insert_own on public.feedback
  for insert to authenticated with check (user_id = (select auth.uid()));

-- al massimo 5 consigli al giorno a testa (niente email a raffica)
create function public.feedback_limit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select count(*) from public.feedback where user_id = new.user_id and created_at > now() - interval '1 day') >= 5 then
    raise exception 'too many feedback messages';
  end if;
  return new;
end;
$$;
create trigger feedback_limit before insert on public.feedback for each row execute function public.feedback_limit();

-- ---------------------------------------------------------------------------- amici
create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester uuid not null references auth.users (id) on delete cascade,
  addressee uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  check (requester <> addressee)
);
create unique index friendships_pair_idx on public.friendships (least(requester, addressee), greatest(requester, addressee));
create index friendships_addressee_idx on public.friendships (addressee);
alter table public.friendships enable row level security;
-- si vedono solo le proprie richieste/amicizie; si creano e cambiano solo con le funzioni qui sotto
create policy friendships_select_own on public.friendships
  for select to authenticated using (requester = (select auth.uid()) or addressee = (select auth.uid()));

-- true se io e p_user siamo amici (richiesta accettata)
create function public.is_friend(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester = auth.uid() and f.addressee = p_user) or (f.addressee = auth.uid() and f.requester = p_user))
  );
$$;

-- Manda una richiesta con il codice amico. Se l'altro me l'aveva già mandata, diventiamo amici.
-- Risposte: sent, accepted, already, not_found, self, limit
create function public.send_friend_request(p_code text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_other uuid;
  v_row public.friendships;
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  select id into v_other from public.profiles where friend_code = upper(trim(coalesce(p_code, '')));
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

-- Accetta o rifiuta una richiesta arrivata a me.
create function public.respond_friend_request(p_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_accept then
    update public.friendships set status = 'accepted' where id = p_id and addressee = auth.uid() and status = 'pending';
  else
    delete from public.friendships where id = p_id and addressee = auth.uid() and status = 'pending';
  end if;
end;
$$;

-- Toglie un amico (o annulla una richiesta mandata): vale per entrambi.
create function public.remove_friend(p_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.friendships where id = p_id and (requester = auth.uid() or addressee = auth.uid());
$$;

-- I miei amici e le richieste (con nome e foto dell'altro).
create function public.list_friends()
returns table (id uuid, user_id uuid, display_name text, avatar_url text, status text, incoming boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select f.id,
         p.id,
         p.display_name,
         p.avatar_url,
         f.status,
         f.addressee = auth.uid()
  from public.friendships f
  join public.profiles p on p.id = case when f.requester = auth.uid() then f.addressee else f.requester end
  where f.requester = auth.uid() or f.addressee = auth.uid()
  order by f.status desc, p.display_name;
$$;

-- solo foto salvate su Supabase Storage (le altre potrebbero tracciare chi le apre)
create function public.safe_image(p_url text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_url ~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/images/' then p_url end;
$$;

-- Cosa condivide un amico: ricette cucinate, planner della settimana da p_day, diario di p_day.
-- Ogni parte c'è solo se l'amico ha scelto di condividerla.
create function public.friend_feed(p_user uuid, p_day date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
begin
  if not public.is_friend(p_user) then raise exception 'not a friend'; end if;
  select * into v_profile from public.profiles where id = p_user;

  return jsonb_build_object(
    'display_name', v_profile.display_name,
    'avatar_url', v_profile.avatar_url,
    'share_cooking', v_profile.share_cooking,
    'share_planner', v_profile.share_planner,
    'share_diary', v_profile.share_diary,
    'cooked', case when v_profile.share_cooking then coalesce((
      select jsonb_agg(x order by x.last_cooked_at desc) from (
        select r.id, r.title, public.safe_image(r.image_url) as image_url, r.rating, r.last_cooked_at, r.kcal_per_serving
        from public.recipes r
        where r.user_id = p_user and r.last_cooked_at is not null
        order by r.last_cooked_at desc
        limit 20
      ) x), '[]') end,
    'planner', case when v_profile.share_planner then coalesce((
      select jsonb_agg(x order by x.date, x.slot) from (
        select m.date, m.slot, r.id as recipe_id, r.title, public.safe_image(r.image_url) as image_url
        from public.meal_plan_entries m
        join public.recipes r on r.id = m.recipe_id
        where m.user_id = p_user and m.date between p_day and p_day + 6
      ) x), '[]') end,
    'diary', case when v_profile.share_diary then coalesce((
      select jsonb_agg(x order by x.created_at) from (
        select l.slot, l.name, l.kcal, l.protein_g, l.created_at
        from public.food_log l
        where l.user_id = p_user and l.eaten_on = p_day
      ) x), '[]') end
  );
end;
$$;

-- Una ricetta di un amico (per vederla e salvarla nella propria libreria), se la condivide.
create function public.friend_recipe(p_recipe uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_shares boolean;
begin
  select r.user_id, (p.share_cooking or p.share_planner) into v_owner, v_shares
  from public.recipes r join public.profiles p on p.id = r.user_id
  where r.id = p_recipe;
  if v_owner is null or not coalesce(v_shares, false) or not public.is_friend(v_owner) then
    raise exception 'not shared';
  end if;

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
      'ingredients', coalesce((
        select jsonb_agg(jsonb_build_object('quantity', i.quantity, 'unit', i.unit, 'name', i.name, 'note', i.note,
                                            'aisle', i.aisle, 'estimated', i.estimated) order by i.position)
        from public.recipe_ingredients i where i.recipe_id = r.id), '[]'),
      'steps', coalesce((
        select jsonb_agg(jsonb_build_object('text', s.text, 'timer_seconds', s.timer_seconds) order by s.position)
        from public.recipe_steps s where s.recipe_id = r.id), '[]')
    )
    from public.recipes r where r.id = p_recipe
  );
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.is_friend(uuid)', 'public.send_friend_request(text)', 'public.respond_friend_request(uuid, boolean)',
    'public.remove_friend(uuid)', 'public.list_friends()', 'public.friend_feed(uuid, date)', 'public.friend_recipe(uuid)'
  ]
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;
