-- Porzioni preferite, obiettivi di calorie e diario di quello che mangi.

-- 1. Nel profilo: grammi a persona (pasta, riso, carne, pesce) e obiettivi giornalieri.
alter table public.profiles
  add column portions jsonb not null default '{}'
    check (jsonb_typeof(portions) = 'object' and pg_column_size(portions) <= 1000),
  add column kcal_goal smallint check (kcal_goal between 500 and 10000),
  add column protein_goal smallint check (protein_goal between 0 and 1000),
  add column carbs_goal smallint check (carbs_goal between 0 and 2000),
  add column fat_goal smallint check (fat_goal between 0 and 1000);

-- chi si è registrato prima del trigger potrebbe non avere ancora il profilo
insert into public.profiles (id) select id from auth.users on conflict (id) do nothing;

-- 2. Diario: una riga per ogni cosa mangiata (da una ricetta, stimata dall'AI o scritta a mano).
create table public.food_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  eaten_on date not null,
  slot text not null default 'snack' check (slot in ('breakfast', 'lunch', 'dinner', 'snack')),
  name text not null check (length(trim(name)) between 1 and 200),
  kcal smallint not null check (kcal between 0 and 10000),
  protein_g numeric(6, 1) check (protein_g between 0 and 1000),
  carbs_g numeric(6, 1) check (carbs_g between 0 and 2000),
  fat_g numeric(6, 1) check (fat_g between 0 and 1000),
  source text not null default 'manual' check (source in ('manual', 'ai', 'recipe')),
  recipe_id uuid,
  servings numeric(4, 2) check (servings > 0 and servings <= 20),
  created_at timestamptz not null default now(),
  -- solo ricette proprie; se la ricetta viene cancellata la riga del diario resta
  foreign key (recipe_id, user_id) references public.recipes (id, user_id) on delete set null (recipe_id)
);

create index food_log_user_day_idx on public.food_log (user_id, eaten_on);
create index food_log_recipe_idx on public.food_log (recipe_id);

alter table public.food_log enable row level security;

create policy food_log_select_own on public.food_log
  for select to authenticated using (user_id = (select auth.uid()));
create policy food_log_insert_own on public.food_log
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy food_log_update_own on public.food_log
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy food_log_delete_own on public.food_log
  for delete to authenticated using (user_id = (select auth.uid()));

-- al massimo 100 voci al giorno a testa (niente riempimenti per errore o per abuso)
create function public.food_log_limit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select count(*) from public.food_log where user_id = new.user_id and eaten_on = new.eaten_on) >= 100 then
    raise exception 'too many food log entries for this day';
  end if;
  return new;
end;
$$;

create trigger food_log_limit before insert on public.food_log
  for each row execute function public.food_log_limit();
