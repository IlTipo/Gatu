-- "Copia la lista fissa in questa settimana" la incolla sempre: aggiunge quello che manca
-- e rimette "da comprare" le voci uguali già spuntate (niente doppioni).
create or replace function public.add_shopping_template(p_week date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_added integer := 0;
  v_reset integer := 0;
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  if p_week is null or extract(isodow from p_week) <> 1 then raise exception 'invalid week'; end if;
  update public.shopping_items s set checked = false
  where s.user_id = v_me and s.week_start = p_week and s.checked
    and exists (
      select 1 from public.shopping_template_items t
      where t.user_id = v_me and lower(trim(t.name)) = lower(trim(s.name))
    );
  get diagnostics v_reset = row_count;
  insert into public.shopping_items (user_id, week_start, name, quantity, unit, aisle, is_manual, position)
  select v_me, p_week, t.name, t.quantity, t.unit, t.aisle, true, 2000 + t.position
  from public.shopping_template_items t
  where t.user_id = v_me
    and not exists (
      select 1 from public.shopping_items s
      where s.user_id = v_me and s.week_start = p_week and lower(trim(s.name)) = lower(trim(t.name))
    );
  get diagnostics v_added = row_count;
  insert into public.shopping_template_weeks (user_id, week_start) values (v_me, p_week) on conflict do nothing;
  return v_added + v_reset;
end;
$$;
