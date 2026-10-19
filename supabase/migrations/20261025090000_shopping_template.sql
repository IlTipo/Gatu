-- Spesa: copiare la lista alla settimana dopo e "lista fissa" che si aggiunge da sola ogni settimana.

-- Le voci della lista fissa (al massimo 100 a testa).
create table public.shopping_template_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 200),
  quantity numeric check (quantity > 0 and quantity < 10000),
  unit text check (char_length(unit) <= 40),
  aisle text not null default 'altro' check (char_length(aisle) <= 40),
  position smallint not null default 0,
  created_at timestamptz not null default now()
);
create index shopping_template_items_user_idx on public.shopping_template_items (user_id, position);
alter table public.shopping_template_items enable row level security;
create policy shopping_template_select_own on public.shopping_template_items
  for select to authenticated using (user_id = (select auth.uid()));
create policy shopping_template_insert_own on public.shopping_template_items
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy shopping_template_update_own on public.shopping_template_items
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy shopping_template_delete_own on public.shopping_template_items
  for delete to authenticated using (user_id = (select auth.uid()));

create function public.shopping_template_limit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select count(*) from public.shopping_template_items where user_id = new.user_id) >= 100 then
    raise exception 'too many template items';
  end if;
  return new;
end;
$$;
create trigger shopping_template_limit before insert on public.shopping_template_items
  for each row execute function public.shopping_template_limit();

-- Settimane in cui la lista fissa è già stata aggiunta (così, se togli una voce, non ritorna).
create table public.shopping_template_weeks (
  user_id uuid not null references auth.users (id) on delete cascade,
  week_start date not null,
  primary key (user_id, week_start)
);
alter table public.shopping_template_weeks enable row level security;
create policy shopping_template_weeks_select_own on public.shopping_template_weeks
  for select to authenticated using (user_id = (select auth.uid()));

-- Aggiunge la lista fissa alla settimana (una volta sola, da questa settimana in poi). Restituisce quante voci.
create function public.apply_shopping_template(p_week date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_count integer := 0;
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  if p_week is null or extract(isodow from p_week) <> 1 then raise exception 'invalid week'; end if;
  if p_week < date_trunc('week', current_date)::date or p_week > current_date + 400 then return 0; end if;
  if not exists (select 1 from public.shopping_template_items where user_id = v_me) then return 0; end if;
  insert into public.shopping_template_weeks (user_id, week_start) values (v_me, p_week) on conflict do nothing;
  if not found then return 0; end if;
  insert into public.shopping_items (user_id, week_start, name, quantity, unit, aisle, is_manual, position)
  select v_me, p_week, t.name, t.quantity, t.unit, t.aisle, true, 2000 + t.position
  from public.shopping_template_items t
  where t.user_id = v_me
    and not exists (
      select 1 from public.shopping_items s
      where s.user_id = v_me and s.week_start = p_week and lower(trim(s.name)) = lower(trim(t.name))
    );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Salva la lista di una settimana come lista fissa (sostituisce quella di prima).
create function public.save_shopping_template(p_week date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_count integer := 0;
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  delete from public.shopping_template_items where user_id = v_me;
  insert into public.shopping_template_items (user_id, name, quantity, unit, aisle, position)
  select v_me, s.name, s.quantity, s.unit, s.aisle, (row_number() over (order by s.position, s.created_at))::smallint
  from (
    select distinct on (lower(trim(name))) name, quantity, unit, aisle, position, created_at
    from public.shopping_items
    where user_id = v_me and week_start = p_week
    order by lower(trim(name)), position
  ) s
  limit 100;
  get diagnostics v_count = row_count;
  -- in questa settimana c'è già tutto: non va riaggiunta
  insert into public.shopping_template_weeks (user_id, week_start) values (v_me, p_week) on conflict do nothing;
  return v_count;
end;
$$;

-- Copia le voci di una settimana in un'altra (non spuntate, senza doppioni). Restituisce quante voci.
create function public.copy_shopping_week(p_from date, p_to date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_count integer := 0;
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  if p_to is null or extract(isodow from p_to) <> 1 or p_to = p_from then raise exception 'invalid week'; end if;
  insert into public.shopping_items (user_id, week_start, name, quantity, unit, aisle, is_manual, position)
  select v_me, p_to, s.name, s.quantity, s.unit, s.aisle, true, s.position
  from (
    select distinct on (lower(trim(name))) name, quantity, unit, aisle, position
    from public.shopping_items
    where user_id = v_me and week_start = p_from
    order by lower(trim(name)), position
  ) s
  where not exists (
    select 1 from public.shopping_items x
    where x.user_id = v_me and x.week_start = p_to and lower(trim(x.name)) = lower(trim(s.name))
  )
  limit 300;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array['public.apply_shopping_template(date)', 'public.save_shopping_template(date)', 'public.copy_shopping_week(date, date)']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;
