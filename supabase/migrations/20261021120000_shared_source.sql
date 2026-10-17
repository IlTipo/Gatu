-- Ricette salvate dai social e condivise: chi le vede trova anche la fonte originale
-- (piattaforma, autore e link pubblici), così il merito resta a chi l'ha pubblicata.
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
      'source', case when s.id is not null and s.url ~ '^https?://' then
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
