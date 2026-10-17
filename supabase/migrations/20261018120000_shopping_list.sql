-- Fase 6: lista della spesa.

-- Rigenera la parte "automatica" della lista di una settimana in un colpo solo:
-- toglie le voci generate dal planner e inserisce quelle nuove (le spunte le decide l'app).
-- Le voci aggiunte a mano (is_manual) non si toccano.
create function public.replace_shopping_list(p_week_start date, p_items jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 500 then
    raise exception 'invalid items';
  end if;

  delete from public.shopping_items where week_start = p_week_start and not is_manual;

  insert into public.shopping_items (week_start, name, quantity, unit, aisle, checked, is_manual, recipe_ids, position)
  select
    p_week_start,
    left(trim(t.e ->> 'name'), 200),
    (t.e ->> 'quantity')::numeric,
    nullif(left(t.e ->> 'unit', 30), ''),
    coalesce(nullif(t.e ->> 'aisle', ''), 'altro'),
    coalesce((t.e ->> 'checked')::boolean, false),
    false,
    coalesce(array(select jsonb_array_elements_text(coalesce(t.e -> 'recipe_ids', '[]')))::uuid[], '{}'),
    (t.ord - 1)::smallint
  from jsonb_array_elements(p_items) with ordinality as t(e, ord)
  where length(trim(coalesce(t.e ->> 'name', ''))) > 0;
end;
$$;

revoke execute on function public.replace_shopping_list(date, jsonb) from public, anon;
grant execute on function public.replace_shopping_list(date, jsonb) to authenticated;
