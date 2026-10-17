-- Fase 8: voti e note. Le colonne esistono già (status, rating, notes, last_cooked_at, visited_at):
-- qui solo un limite di lunghezza alle note, per non salvare testi enormi per errore.
alter table public.recipes add constraint recipes_notes_length check (char_length(notes) <= 5000);
alter table public.places add constraint places_notes_length check (char_length(notes) <= 5000);
