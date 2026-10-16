-- Fase 3+: collezioni automatiche e ordine delle collezioni.

-- Una collezione con "rules" si riempie da sola (es. {"tags":["vegetariano"],"max_minutes":30}).
-- Le regole le applica l'app: qui controlliamo solo che siano un oggetto piccolo.
alter table public.collections
  add column rules jsonb
    check (rules is null or (jsonb_typeof(rules) = 'object' and pg_column_size(rules) <= 2000));

-- Nuovo ordine delle collezioni: la prima dell'elenco va in cima.
-- "security invoker": le regole RLS valgono come sempre, si toccano solo le proprie collezioni.
create function public.reorder_collections(p_ids uuid[])
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.collections c
  set position = (t.ord - 1)::smallint
  from unnest(p_ids) with ordinality as t(id, ord)
  where c.id = t.id and t.ord <= 32000;
$$;

revoke execute on function public.reorder_collections(uuid[]) from public, anon;
grant execute on function public.reorder_collections(uuid[]) to authenticated;
