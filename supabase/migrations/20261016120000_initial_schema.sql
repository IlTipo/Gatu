-- =====================================================================
-- Morso — schema iniziale
-- Tabelle, indici, sicurezza (RLS) e storage per le immagini.
--
-- Regola d'oro: ogni riga ha un proprietario (user_id) e ognuno vede
-- e modifica SOLO le proprie righe. Lo impone il database stesso.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tipi
-- ---------------------------------------------------------------------
create type public.platform as enum ('tiktok', 'instagram', 'youtube', 'pinterest', 'web', 'manual');
create type public.import_status as enum ('pending', 'processing', 'done', 'needs_review', 'error');
create type public.item_status as enum ('to_try', 'tried');
create type public.meal_slot as enum ('lunch', 'dinner');

-- Aggiorna automaticamente la colonna updated_at a ogni modifica.
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Profili (uno per utente, creato in automatico alla registrazione)
-- ---------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  locale text not null default 'it',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(new.email, '@', 1)
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Origini: ogni link salvato
-- ---------------------------------------------------------------------
create table public.sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  url text not null,
  platform public.platform not null default 'web',
  title text,
  description text,
  author_name text,
  thumbnail_url text,
  shared_text text,
  status public.import_status not null default 'pending',
  error_message text,
  ai_result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, url),
  -- serve alle chiavi esterne "composte" più sotto (stesso proprietario garantito)
  unique (id, user_id)
);

-- ---------------------------------------------------------------------
-- Ricette
-- ---------------------------------------------------------------------
create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  source_id uuid,
  title text not null check (length(trim(title)) > 0),
  description text,
  image_url text,
  servings smallint check (servings between 1 and 100),
  prep_minutes smallint check (prep_minutes >= 0),
  cook_minutes smallint check (cook_minutes >= 0),
  total_minutes smallint check (total_minutes >= 0),
  tags text[] not null default '{}',
  status public.item_status not null default 'to_try',
  rating smallint check (rating between 1 and 5),
  notes text,
  last_cooked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  -- se cancelli l'origine, la ricetta resta (si azzera solo source_id)
  foreign key (source_id, user_id) references public.sources (id, user_id) on delete set null (source_id)
);

create table public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  recipe_id uuid not null,
  position smallint not null default 0,
  quantity numeric check (quantity >= 0),
  unit text,
  name text not null check (length(trim(name)) > 0),
  note text,
  aisle text not null default 'altro'
    check (aisle in ('frutta_verdura', 'latticini', 'carne_pesce', 'dispensa', 'surgelati', 'panetteria', 'bevande', 'altro')),
  foreign key (recipe_id, user_id) references public.recipes (id, user_id) on delete cascade
);

create table public.recipe_steps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  recipe_id uuid not null,
  position smallint not null default 0,
  text text not null check (length(trim(text)) > 0),
  timer_seconds integer check (timer_seconds > 0),
  foreign key (recipe_id, user_id) references public.recipes (id, user_id) on delete cascade
);

-- ---------------------------------------------------------------------
-- Posti (ristoranti, bar, pasticcerie...)
-- ---------------------------------------------------------------------
create table public.places (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  source_id uuid,
  name text not null check (length(trim(name)) > 0),
  city text,
  address text,
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  google_place_id text,
  verified boolean not null default false,
  cuisine text,
  price_level smallint check (price_level between 1 and 4),
  recommended_dishes text[] not null default '{}',
  image_url text,
  status public.item_status not null default 'to_try',
  rating smallint check (rating between 1 and 5),
  notes text,
  visited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (source_id, user_id) references public.sources (id, user_id) on delete set null (source_id)
);

-- ---------------------------------------------------------------------
-- Collezioni (possono contenere sia ricette sia posti)
-- ---------------------------------------------------------------------
create table public.collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  emoji text,
  position smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.collection_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  collection_id uuid not null,
  recipe_id uuid,
  place_id uuid,
  added_at timestamptz not null default now(),
  check (num_nonnulls(recipe_id, place_id) = 1),
  foreign key (collection_id, user_id) references public.collections (id, user_id) on delete cascade,
  foreign key (recipe_id, user_id) references public.recipes (id, user_id) on delete cascade,
  foreign key (place_id, user_id) references public.places (id, user_id) on delete cascade
);

-- lo stesso elemento non può comparire due volte nella stessa collezione
create unique index collection_items_unique_recipe on public.collection_items (collection_id, recipe_id) where recipe_id is not null;
create unique index collection_items_unique_place on public.collection_items (collection_id, place_id) where place_id is not null;

-- ---------------------------------------------------------------------
-- Meal planner
-- ---------------------------------------------------------------------
create table public.meal_plan_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  slot public.meal_slot not null,
  recipe_id uuid not null,
  servings smallint check (servings between 1 and 100),
  position smallint not null default 0,
  created_at timestamptz not null default now(),
  foreign key (recipe_id, user_id) references public.recipes (id, user_id) on delete cascade
);

-- ---------------------------------------------------------------------
-- Lista della spesa
-- ---------------------------------------------------------------------
create table public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  week_start date not null check (extract(isodow from week_start) = 1), -- sempre un lunedì
  name text not null check (length(trim(name)) > 0),
  quantity numeric check (quantity >= 0),
  unit text,
  aisle text not null default 'altro',
  checked boolean not null default false,
  is_manual boolean not null default false,
  recipe_ids uuid[] not null default '{}',
  position smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Limite giornaliero di estrazioni AI (per evitare costi a sorpresa)
-- ---------------------------------------------------------------------
create table public.usage_counters (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null default current_date,
  extractions integer not null default 0,
  primary key (user_id, day)
);

-- Consuma un'estrazione: restituisce true se l'utente è ancora sotto il limite.
-- L'utente non può modificare il contatore direttamente, solo tramite questa funzione.
create function public.consume_extraction_quota(daily_limit integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  used integer;
begin
  if uid is null then
    return false;
  end if;

  insert into public.usage_counters (user_id, day, extractions)
  values (uid, current_date, 1)
  on conflict (user_id, day)
  do update set extractions = public.usage_counters.extractions + 1
  returning extractions into used;

  if used > daily_limit then
    -- oltre il limite: annulla l'incremento appena fatto
    update public.usage_counters set extractions = extractions - 1
    where user_id = uid and day = current_date;
    return false;
  end if;
  return true;
end;
$$;

revoke execute on function public.consume_extraction_quota(integer) from public, anon;
grant execute on function public.consume_extraction_quota(integer) to authenticated;

-- ---------------------------------------------------------------------
-- updated_at automatico
-- ---------------------------------------------------------------------
create trigger set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.sources for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.recipes for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.places for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.collections for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.shopping_items for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Indici (ricerche veloci)
-- ---------------------------------------------------------------------
create index sources_user_created_idx on public.sources (user_id, created_at desc);
create index recipes_user_created_idx on public.recipes (user_id, created_at desc);
create index recipes_tags_idx on public.recipes using gin (tags);
create index recipes_source_idx on public.recipes (source_id);
create index recipe_ingredients_recipe_idx on public.recipe_ingredients (recipe_id, position);
create index recipe_steps_recipe_idx on public.recipe_steps (recipe_id, position);
create index places_user_created_idx on public.places (user_id, created_at desc);
create index places_user_city_idx on public.places (user_id, city);
create index places_source_idx on public.places (source_id);
create index collections_user_idx on public.collections (user_id, position);
create index collection_items_collection_idx on public.collection_items (collection_id);
create index collection_items_recipe_idx on public.collection_items (recipe_id);
create index collection_items_place_idx on public.collection_items (place_id);
create index meal_plan_user_date_idx on public.meal_plan_entries (user_id, date);
create index meal_plan_recipe_idx on public.meal_plan_entries (recipe_id);
create index shopping_items_user_week_idx on public.shopping_items (user_id, week_start);

-- ---------------------------------------------------------------------
-- Sicurezza: Row Level Security
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.sources enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.recipe_steps enable row level security;
alter table public.places enable row level security;
alter table public.collections enable row level security;
alter table public.collection_items enable row level security;
alter table public.meal_plan_entries enable row level security;
alter table public.shopping_items enable row level security;
alter table public.usage_counters enable row level security;

-- Profili: si leggono e modificano solo il proprio (la creazione la fa il trigger).
create policy "profiles_select_own" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Contatori: solo lettura del proprio (le scritture passano da consume_extraction_quota).
create policy "usage_counters_select_own" on public.usage_counters
  for select to authenticated using (user_id = (select auth.uid()));

-- Tutte le altre tabelle: stesso schema "solo il proprietario può tutto".
do $$
declare
  t text;
begin
  foreach t in array array[
    'sources', 'recipes', 'recipe_ingredients', 'recipe_steps', 'places',
    'collections', 'collection_items', 'meal_plan_entries', 'shopping_items'
  ]
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))',
      t || '_select_own', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))',
      t || '_insert_own', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      t || '_update_own', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))',
      t || '_delete_own', t);
  end loop;
end;
$$;

-- Nota: le tabelle "figlie" (ingredienti, passaggi, elementi di collezione, planner)
-- usano chiavi esterne composte (id, user_id): il database rifiuta di collegare
-- un ingrediente alla ricetta di un altro utente, anche se qualcuno ci provasse.

-- ---------------------------------------------------------------------
-- Storage: immagini (miniature e foto)
-- Ogni utente scrive solo nella cartella images/<proprio id>/...
-- Il bucket è "pubblico in lettura" così le immagini si mostrano con un semplice link;
-- i nomi dei file sono casuali e impossibili da indovinare.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('images', 'images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "images_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'images' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "images_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'images' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "images_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'images' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'images' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "images_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'images' and (storage.foldername(name))[1] = (select auth.uid())::text);
