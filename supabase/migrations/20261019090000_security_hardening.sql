-- Rinforzi dopo il controllo di sicurezza.

-- 1. Limite giornaliero: se arriva un valore assente o strano, si nega (prima si permetteva tutto).
--    Il limite inoltre non può superare 500 analisi al giorno per persona.
create or replace function public.consume_extraction_quota(daily_limit integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  used integer;
begin
  if uid is null or daily_limit is null or daily_limit < 1 then
    return false;
  end if;

  insert into public.usage_counters (user_id, day, extractions)
  values (uid, current_date, 1)
  on conflict (user_id, day)
  do update set extractions = public.usage_counters.extractions + 1
  returning extractions into used;

  if used > least(daily_limit, 500) then
    -- oltre il limite: annulla l'incremento appena fatto
    update public.usage_counters set extractions = extractions - 1
    where user_id = uid and day = current_date;
    return false;
  end if;
  return true;
end;
$$;

-- 2. Lunghezze massime dei testi (evita righe enormi salvate per errore o di proposito).
--    "not valid": valgono per tutto ciò che si scrive da ora, senza bloccare dati già presenti.
alter table public.recipes
  add constraint recipes_title_len check (char_length(title) <= 300) not valid,
  add constraint recipes_description_len check (char_length(description) <= 2000) not valid,
  add constraint recipes_image_url_len check (char_length(image_url) <= 2000) not valid,
  add constraint recipes_tags_len check (cardinality(tags) <= 30) not valid;
alter table public.recipe_ingredients
  add constraint recipe_ingredients_name_len check (char_length(name) <= 200) not valid,
  add constraint recipe_ingredients_unit_len check (char_length(unit) <= 40) not valid,
  add constraint recipe_ingredients_note_len check (char_length(note) <= 300) not valid;
alter table public.recipe_steps
  add constraint recipe_steps_text_len check (char_length(text) <= 3000) not valid;
alter table public.places
  add constraint places_name_len check (char_length(name) <= 300) not valid,
  add constraint places_text_len check (
    coalesce(char_length(city), 0) <= 200 and coalesce(char_length(address), 0) <= 500
    and coalesce(char_length(cuisine), 0) <= 200 and coalesce(char_length(phone), 0) <= 60
    and coalesce(char_length(website), 0) <= 2000 and coalesce(char_length(opening_hours), 0) <= 2000
  ) not valid,
  add constraint places_dishes_len check (cardinality(recommended_dishes) <= 30) not valid;
alter table public.sources
  add constraint sources_text_len check (
    char_length(url) <= 2000 and coalesce(char_length(title), 0) <= 2000
    and coalesce(char_length(description), 0) <= 20000 and coalesce(char_length(shared_text), 0) <= 20000
  ) not valid;
alter table public.collections
  add constraint collections_name_len check (char_length(name) <= 100) not valid;
alter table public.shopping_items
  add constraint shopping_items_text_len check (
    char_length(name) <= 200 and coalesce(char_length(unit), 0) <= 40 and char_length(aisle) <= 40
  ) not valid,
  add constraint shopping_items_recipes_len check (cardinality(recipe_ids) <= 50) not valid;

-- 3. Al massimo 200 ingredienti e 100 passaggi per ricetta.
create function public.check_recipe_children_limit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_table_name = 'recipe_ingredients'
     and (select count(*) from public.recipe_ingredients where recipe_id = new.recipe_id) > 200 then
    raise exception 'too many ingredients';
  end if;
  if tg_table_name = 'recipe_steps'
     and (select count(*) from public.recipe_steps where recipe_id = new.recipe_id) > 100 then
    raise exception 'too many steps';
  end if;
  return null;
end;
$$;

create trigger recipe_ingredients_limit after insert on public.recipe_ingredients
  for each row execute function public.check_recipe_children_limit();
create trigger recipe_steps_limit after insert on public.recipe_steps
  for each row execute function public.check_recipe_children_limit();

-- 4. Link salvati: solo pagine web (mai "javascript:" o "data:").
alter table public.recipes
  add constraint recipes_image_url_web check (image_url ~* '^https?://') not valid;
alter table public.places
  add constraint places_website_web check (website ~* '^https?://') not valid,
  add constraint places_image_url_web check (image_url ~* '^https?://') not valid;
alter table public.sources
  add constraint sources_thumbnail_web check (thumbnail_url ~* '^https?://') not valid;

-- 5. Nomi dei file caricati: niente "../" (resterebbero comunque nella propria cartella, ma meglio puliti).
drop policy "images_insert_own" on storage.objects;
create policy "images_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'images' and (storage.foldername(name))[1] = (select auth.uid())::text and name not like '%..%'
  );
drop policy "videos_insert_own" on storage.objects;
create policy "videos_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'videos' and (storage.foldername(name))[1] = (select auth.uid())::text and name not like '%..%'
  );
