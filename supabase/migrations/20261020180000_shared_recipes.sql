-- Ricette inventate da me, visibili ai miei amici (solo amici accettati, solo quelle che scelgo).

alter table public.recipes
  add column homemade boolean not null default false,
  add column shared_with_friends boolean not null default false;

create index recipes_shared_idx on public.recipes (user_id, created_at desc) where shared_with_friends;

-- Cosa condivide un amico: come prima, più "creations" (le sue ricette condivise, sempre visibili agli amici).
create or replace function public.friend_feed(p_user uuid, p_day date)
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
    'creations', coalesce((
      select jsonb_agg(x order by x.created_at desc) from (
        select r.id, r.title, public.safe_image(r.image_url) as image_url, r.total_minutes, r.kcal_per_serving, r.homemade, r.created_at
        from public.recipes r
        where r.user_id = p_user and r.shared_with_friends
        order by r.created_at desc
        limit 30
      ) x), '[]'),
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

-- Una ricetta di un amico: ora anche se l'ha condivisa apposta.
create or replace function public.friend_recipe(p_recipe uuid)
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
  select r.user_id, (r.shared_with_friends or p.share_cooking or p.share_planner) into v_owner, v_shares
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
      'homemade', r.homemade,
      'author', (select p.display_name from public.profiles p where p.id = r.user_id),
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

-- Libreria → "Amici": le ultime ricette condivise da tutti i miei amici.
create function public.friends_recipes(p_limit integer default 60)
returns table (
  id uuid, title text, image_url text, total_minutes smallint, kcal_per_serving smallint, homemade boolean,
  created_at timestamptz, author_id uuid, author_name text, author_avatar text
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.title, public.safe_image(r.image_url), r.total_minutes, r.kcal_per_serving, r.homemade,
         r.created_at, p.id, p.display_name, p.avatar_url
  from public.friendships f
  join public.recipes r
    on r.user_id = case when f.requester = auth.uid() then f.addressee else f.requester end
   and r.shared_with_friends
  join public.profiles p on p.id = r.user_id
  where f.status = 'accepted' and (f.requester = auth.uid() or f.addressee = auth.uid())
  order by r.created_at desc
  limit least(greatest(coalesce(p_limit, 60), 1), 200);
$$;

revoke execute on function public.friends_recipes(integer) from public, anon;
grant execute on function public.friends_recipes(integer) to authenticated;
