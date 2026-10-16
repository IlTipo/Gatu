-- =====================================================================
-- Morso — Dosi stimate
-- Quando un post non indica le dosi, l'AI le stima: le segniamo come
-- "stimate" così l'app può mostrarle con "~" e l'utente sa cosa è certo.
-- =====================================================================

alter table public.recipe_ingredients add column estimated boolean not null default false;
alter table public.recipes add column servings_estimated boolean not null default false;

-- save_extraction: come prima, più i campi "estimated"
create or replace function public.save_extraction(
  p_source_id uuid,
  p_result jsonb,
  p_status public.import_status,
  p_ai_result jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_source public.sources;
  v_recipe_id uuid;
  v_place_id uuid;
  v_place_ids uuid[] := '{}';
  v_place jsonb;
begin
  select * into v_source from public.sources where id = p_source_id;
  if not found then
    raise exception 'source_not_found' using errcode = 'P0002';
  end if;

  delete from public.recipes where source_id = p_source_id;
  delete from public.places where source_id = p_source_id;

  if p_result ->> 'kind' = 'recipe' then
    insert into public.recipes (
      source_id, title, description, image_url, servings, servings_estimated,
      prep_minutes, cook_minutes, total_minutes, tags
    )
    values (
      p_source_id,
      p_result #>> '{recipe,title}',
      p_result #>> '{recipe,description}',
      v_source.thumbnail_url,
      (p_result #>> '{recipe,servings}')::smallint,
      coalesce((p_result #>> '{recipe,servings_estimated}')::boolean, false),
      (p_result #>> '{recipe,prep_minutes}')::smallint,
      (p_result #>> '{recipe,cook_minutes}')::smallint,
      (p_result #>> '{recipe,total_minutes}')::smallint,
      coalesce(array(select jsonb_array_elements_text(coalesce(p_result #> '{recipe,tags}', '[]'))), '{}')
    )
    returning id into v_recipe_id;

    insert into public.recipe_ingredients (recipe_id, position, quantity, unit, name, note, aisle, estimated)
    select v_recipe_id, (t.ord - 1)::smallint, (t.e ->> 'quantity')::numeric, t.e ->> 'unit', t.e ->> 'name',
           t.e ->> 'note', coalesce(t.e ->> 'aisle', 'altro'), coalesce((t.e ->> 'estimated')::boolean, false)
    from jsonb_array_elements(coalesce(p_result #> '{recipe,ingredients}', '[]')) with ordinality as t(e, ord);

    insert into public.recipe_steps (recipe_id, position, text, timer_seconds)
    select v_recipe_id, (t.ord - 1)::smallint, t.e ->> 'text', (t.e ->> 'timer_seconds')::integer
    from jsonb_array_elements(coalesce(p_result #> '{recipe,steps}', '[]')) with ordinality as t(e, ord);

  elsif p_result ->> 'kind' = 'places' then
    for v_place in select * from jsonb_array_elements(coalesce(p_result -> 'places', '[]')) loop
      insert into public.places (
        source_id, name, city, address, latitude, longitude, google_place_id, verified,
        cuisine, price_level, recommended_dishes, image_url
      )
      values (
        p_source_id,
        v_place ->> 'name',
        v_place ->> 'city',
        v_place ->> 'address',
        (v_place ->> 'latitude')::double precision,
        (v_place ->> 'longitude')::double precision,
        v_place ->> 'google_place_id',
        coalesce((v_place ->> 'verified')::boolean, false),
        v_place ->> 'cuisine',
        (v_place ->> 'price_level')::smallint,
        coalesce(array(select jsonb_array_elements_text(coalesce(v_place -> 'recommended_dishes', '[]'))), '{}'),
        v_source.thumbnail_url
      )
      returning id into v_place_id;
      v_place_ids := v_place_ids || v_place_id;
    end loop;
  end if;

  update public.sources
  set status = p_status, ai_result = p_ai_result, error_message = null
  where id = p_source_id;

  return jsonb_build_object('recipe_id', v_recipe_id, 'place_ids', to_jsonb(v_place_ids));
end;
$$;

-- update_recipe: come prima, più i campi "estimated"
create or replace function public.update_recipe(p_recipe_id uuid, p_recipe jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.recipes set
    title = p_recipe ->> 'title',
    description = p_recipe ->> 'description',
    servings = (p_recipe ->> 'servings')::smallint,
    servings_estimated = coalesce((p_recipe ->> 'servings_estimated')::boolean, false),
    prep_minutes = (p_recipe ->> 'prep_minutes')::smallint,
    cook_minutes = (p_recipe ->> 'cook_minutes')::smallint,
    total_minutes = (p_recipe ->> 'total_minutes')::smallint,
    tags = coalesce(array(select jsonb_array_elements_text(coalesce(p_recipe -> 'tags', '[]'))), '{}')
  where id = p_recipe_id;
  if not found then
    raise exception 'recipe_not_found' using errcode = 'P0002';
  end if;

  delete from public.recipe_ingredients where recipe_id = p_recipe_id;
  insert into public.recipe_ingredients (recipe_id, position, quantity, unit, name, note, aisle, estimated)
  select p_recipe_id, (t.ord - 1)::smallint, (t.e ->> 'quantity')::numeric, nullif(t.e ->> 'unit', ''), t.e ->> 'name',
         nullif(t.e ->> 'note', ''), coalesce(t.e ->> 'aisle', 'altro'), coalesce((t.e ->> 'estimated')::boolean, false)
  from jsonb_array_elements(coalesce(p_recipe -> 'ingredients', '[]')) with ordinality as t(e, ord);

  delete from public.recipe_steps where recipe_id = p_recipe_id;
  insert into public.recipe_steps (recipe_id, position, text, timer_seconds)
  select p_recipe_id, (t.ord - 1)::smallint, t.e ->> 'text', (t.e ->> 'timer_seconds')::integer
  from jsonb_array_elements(coalesce(p_recipe -> 'steps', '[]')) with ordinality as t(e, ord);
end;
$$;
