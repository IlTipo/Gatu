-- Lista fissa: copiarla quando vuoi nella settimana che stai guardando (senza doppioni),
-- anche se in quella settimana era già stata aggiunta o non c'era ancora.
create function public.add_shopping_template(p_week date)
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
  insert into public.shopping_items (user_id, week_start, name, quantity, unit, aisle, is_manual, position)
  select v_me, p_week, t.name, t.quantity, t.unit, t.aisle, true, 2000 + t.position
  from public.shopping_template_items t
  where t.user_id = v_me
    and not exists (
      select 1 from public.shopping_items s
      where s.user_id = v_me and s.week_start = p_week and lower(trim(s.name)) = lower(trim(t.name))
    );
  get diagnostics v_count = row_count;
  -- così non si riaggiunge da sola alla prossima apertura
  insert into public.shopping_template_weeks (user_id, week_start) values (v_me, p_week) on conflict do nothing;
  return v_count;
end;
$$;
revoke execute on function public.add_shopping_template(date) from public, anon;
grant execute on function public.add_shopping_template(date) to authenticated;
