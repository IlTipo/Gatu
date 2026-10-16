-- =====================================================================
-- Morso — Dettagli in più
-- Ricette: calorie e valori per porzione, difficoltà, costo (stime AI).
-- Locali: telefono, sito, orari (da OpenStreetMap/Google) e lista desideri.
-- =====================================================================

alter table public.recipes
  add column kcal_per_serving smallint check (kcal_per_serving between 0 and 5000),
  add column protein_g numeric(6, 1) check (protein_g >= 0),
  add column carbs_g numeric(6, 1) check (carbs_g >= 0),
  add column fat_g numeric(6, 1) check (fat_g >= 0),
  add column difficulty text check (difficulty in ('facile', 'media', 'difficile')),
  add column cost_level smallint check (cost_level between 1 and 3),
  add column insights_at timestamptz;

alter table public.places
  add column phone text,
  add column website text,
  add column opening_hours text,
  add column wishlist boolean not null default false;

create index places_user_wishlist_idx on public.places (user_id) where wishlist;

-- save_extraction: come prima, più i nuovi campi di ricette e locali
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
  v_insights jsonb := p_result #> '{recipe,insights}';
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
      prep_minutes, cook_minutes, total_minutes, tags,
      kcal_per_serving, protein_g, carbs_g, fat_g, difficulty, cost_level, insights_at
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
      coalesce(array(select jsonb_array_elements_text(coalesce(p_result #> '{recipe,tags}', '[]'))), '{}'),
      (v_insights ->> 'kcal_per_serving')::smallint,
      (v_insights ->> 'protein_g')::numeric,
      (v_insights ->> 'carbs_g')::numeric,
      (v_insights ->> 'fat_g')::numeric,
      v_insights ->> 'difficulty',
      (v_insights ->> 'cost_level')::smallint,
      case when v_insights is null or jsonb_typeof(v_insights) = 'null' then null else now() end
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
        cuisine, price_level, recommended_dishes, image_url, phone, website, opening_hours
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
        v_source.thumbnail_url,
        v_place ->> 'phone',
        v_place ->> 'website',
        v_place ->> 'opening_hours'
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

-- Crea una ricetta nuova (es. una variante vegana) con ingredienti e passaggi, tutto insieme.
create function public.create_recipe(p_recipe jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_recipe_id uuid;
begin
  insert into public.recipes (title, description, image_url, servings, prep_minutes, cook_minutes, total_minutes, tags)
  values (
    p_recipe ->> 'title',
    p_recipe ->> 'description',
    p_recipe ->> 'image_url',
    (p_recipe ->> 'servings')::smallint,
    (p_recipe ->> 'prep_minutes')::smallint,
    (p_recipe ->> 'cook_minutes')::smallint,
    (p_recipe ->> 'total_minutes')::smallint,
    coalesce(array(select jsonb_array_elements_text(coalesce(p_recipe -> 'tags', '[]'))), '{}')
  )
  returning id into v_recipe_id;

  insert into public.recipe_ingredients (recipe_id, position, quantity, unit, name, note, aisle, estimated)
  select v_recipe_id, (t.ord - 1)::smallint, (t.e ->> 'quantity')::numeric, nullif(t.e ->> 'unit', ''), t.e ->> 'name',
         nullif(t.e ->> 'note', ''), coalesce(t.e ->> 'aisle', 'altro'), coalesce((t.e ->> 'estimated')::boolean, false)
  from jsonb_array_elements(coalesce(p_recipe -> 'ingredients', '[]')) with ordinality as t(e, ord);

  insert into public.recipe_steps (recipe_id, position, text, timer_seconds)
  select v_recipe_id, (t.ord - 1)::smallint, t.e ->> 'text', (t.e ->> 'timer_seconds')::integer
  from jsonb_array_elements(coalesce(p_recipe -> 'steps', '[]')) with ordinality as t(e, ord);

  return v_recipe_id;
end;
$$;

revoke execute on function public.create_recipe(jsonb) from public, anon;
grant execute on function public.create_recipe(jsonb) to authenticated;
