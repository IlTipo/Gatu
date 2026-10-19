-- Il mio piano alimentare (es. quello del nutrizionista): letto da foto, PDF o testo, oppure scritto a mano.
-- Uno per persona, privato (non si condivide con nessuno).
--
-- days: [{ label: "Lunedì", weekday: 1..7 | null, meals: [{ slot, options: [{ text, items: [{ name, quantity, unit }] }] }] }]
--   slot: colazione | spuntino | pranzo | merenda | cena | altro
--   options: le alternative ("oppure") di quel pasto

create table public.diet_plans (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  title text check (char_length(title) <= 100),
  days jsonb not null default '[]' check (jsonb_typeof(days) = 'array' and jsonb_array_length(days) <= 14 and pg_column_size(days) <= 200000),
  notes text[] not null default '{}' check (cardinality(notes) <= 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.diet_plans enable row level security;
create policy diet_plans_select_own on public.diet_plans
  for select to authenticated using (user_id = (select auth.uid()));
create policy diet_plans_insert_own on public.diet_plans
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy diet_plans_update_own on public.diet_plans
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy diet_plans_delete_own on public.diet_plans
  for delete to authenticated using (user_id = (select auth.uid()));

create function public.diet_plans_touch()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger diet_plans_touch before update on public.diet_plans
  for each row execute function public.diet_plans_touch();
