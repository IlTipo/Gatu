-- Statistiche: storico di ogni volta che una ricetta viene cucinata.
-- Si riempie da solo quando l'app segna la ricetta come cucinata (last_cooked_at).

create table public.cook_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  recipe_id uuid not null,
  cooked_at timestamptz not null default now(),
  foreign key (recipe_id, user_id) references public.recipes (id, user_id) on delete cascade
);
create index cook_log_user_time_idx on public.cook_log (user_id, cooked_at desc);
create index cook_log_recipe_idx on public.cook_log (recipe_id);

alter table public.cook_log enable row level security;
-- si legge solo il proprio; si scrive solo tramite il trigger qui sotto
create policy cook_log_select_own on public.cook_log
  for select to authenticated using (user_id = (select auth.uid()));

create function public.log_cooking()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- solo quando la data "cucinata" avanza (non quando la si toglie) e al massimo una volta all'ora
  if new.last_cooked_at is not null
     and (old.last_cooked_at is null or new.last_cooked_at > old.last_cooked_at + interval '1 hour') then
    insert into public.cook_log (user_id, recipe_id, cooked_at)
    values (new.user_id, new.id, least(new.last_cooked_at, now()));
  end if;
  return new;
end;
$$;
revoke execute on function public.log_cooking() from public, anon, authenticated;

create trigger recipes_log_cooking after update of last_cooked_at on public.recipes
  for each row execute function public.log_cooking();
