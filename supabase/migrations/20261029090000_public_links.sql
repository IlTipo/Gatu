-- Link pubblico di una ricetta (…/r/<codice>): chi lo apre vede la ricetta anche senza Morso.
-- Lo crea e lo toglie solo il proprietario; il codice è casuale e non si indovina.

alter table public.recipes
  add column public_token text unique check (public_token is null or public_token ~ '^[a-f0-9]{32}$');

-- crea (o riprende) il link della mia ricetta
create function public.share_recipe_link(p_recipe uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  update public.recipes
  set public_token = coalesce(public_token, replace(gen_random_uuid()::text, '-', ''))
  where id = p_recipe and user_id = auth.uid()
  returning public_token into v_token;
  if v_token is null then raise exception 'not found'; end if;
  return v_token;
end;
$$;

-- il link smette di funzionare
create function public.unshare_recipe_link(p_recipe uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.recipes set public_token = null where id = p_recipe and user_id = auth.uid();
$$;

-- la ricetta di un link (anche per chi non ha l'account): solo quello che serve per cucinarla
create function public.public_recipe(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
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
    'source', case when s.id is not null and s.url ~ '^https?://' and s.platform <> 'manual' then
      jsonb_build_object('platform', s.platform, 'url', s.url, 'author_name', left(s.author_name, 100)) end,
    'ingredients', coalesce((
      select jsonb_agg(jsonb_build_object('quantity', i.quantity, 'unit', i.unit, 'name', i.name, 'note', i.note) order by i.position)
      from public.recipe_ingredients i where i.recipe_id = r.id), '[]'),
    'steps', coalesce((
      select jsonb_agg(jsonb_build_object('text', st.text, 'timer_seconds', st.timer_seconds) order by st.position)
      from public.recipe_steps st where st.recipe_id = r.id), '[]')
  )
  from public.recipes r
  left join public.sources s on s.id = r.source_id
  where p_token ~ '^[a-f0-9]{32}$' and r.public_token = p_token;
$$;

revoke execute on function public.share_recipe_link(uuid) from public, anon;
grant execute on function public.share_recipe_link(uuid) to authenticated;
revoke execute on function public.unshare_recipe_link(uuid) from public, anon;
grant execute on function public.unshare_recipe_link(uuid) to authenticated;
revoke execute on function public.public_recipe(text) from public;
grant execute on function public.public_recipe(text) to anon, authenticated;
