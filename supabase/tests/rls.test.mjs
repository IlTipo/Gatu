// Test di sicurezza del database: applica le migrazioni su un Postgres "finto" (PGlite)
// che imita Supabase, poi controlla che un utente non possa leggere o toccare i dati di un altro.
// Si lancia con: npm run test:db

import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
const dir = new URL('../migrations/', import.meta.url);
const migration = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort().map((f) => readFileSync(new URL(f, dir), 'utf8')).join('\n');
const db = new PGlite();
// --- finto ambiente Supabase ---
await db.exec(`
create role anon nologin; create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'),1)-1] $$;
grant usage on schema storage to authenticated; grant all on storage.objects to authenticated; grant execute on function storage.foldername(text) to authenticated;
grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
`);
await db.exec(migration);
console.log('✔ migrazione applicata');

const A = '11111111-1111-1111-1111-111111111111', B = '22222222-2222-2222-2222-222222222222';
await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values ('${A}','anna@example.com','{"full_name":"Anna Rossi"}'), ('${B}','bruno@example.com','{}')`);

let failures = 0;
const as = async (uid, sql) => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
  return db.query(sql);
};
const ok = (cond, msg) => { console.log((cond ? '✔ ' : '✘ ') + msg); if (!cond) failures++; };
const fails = async (fn, msg) => { try { await fn(); ok(false, msg + ' (NON è fallito!)'); } catch (e) { ok(true, msg + ' → ' + e.message.split('\n')[0]); } };

const profiles = (await as(A, `select display_name from public.profiles`)).rows;
ok(profiles.length === 1 && profiles[0].display_name === 'Anna Rossi', 'il profilo si crea da solo e Anna vede solo il suo');
ok((await as(B, `select display_name from public.profiles`)).rows[0].display_name === 'bruno', 'nome di riserva dalla email');

const src = (await as(A, `insert into public.sources (url, platform) values ('https://www.tiktok.com/@x/video/1','tiktok') returning id`)).rows[0].id;
const rec = (await as(A, `insert into public.recipes (title, source_id, servings, tags) values ('Carbonara', '${src}', 2, '{veloce}') returning id, user_id`)).rows[0];
ok(rec.user_id === A, 'user_id compilato in automatico');
await as(A, `insert into public.recipe_ingredients (recipe_id, position, quantity, unit, name, aisle) values ('${rec.id}', 0, 200, 'g', 'spaghetti', 'dispensa')`);
await as(A, `insert into public.recipe_steps (recipe_id, position, text, timer_seconds) values ('${rec.id}', 0, 'Cuoci la pasta', 600)`);

ok((await as(B, `select * from public.recipes`)).rows.length === 0, 'Bruno NON vede le ricette di Anna');
ok((await as(B, `select * from public.recipe_ingredients`)).rows.length === 0, 'Bruno NON vede gli ingredienti di Anna');
ok((await as(B, `select * from public.sources`)).rows.length === 0, 'Bruno NON vede i link di Anna');
const upd = await as(B, `update public.recipes set title = 'hackerata' where id = '${rec.id}'`);
ok((upd.affectedRows ?? 0) === 0, 'Bruno NON può modificare la ricetta di Anna');
const del = await as(B, `delete from public.recipes where id = '${rec.id}'`);
ok((del.affectedRows ?? 0) === 0, 'Bruno NON può cancellare la ricetta di Anna');
await fails(() => as(B, `insert into public.recipes (user_id, title) values ('${A}', 'finta')`), 'Bruno NON può creare righe a nome di Anna');
await fails(() => as(B, `insert into public.recipe_ingredients (recipe_id, name) values ('${rec.id}', 'veleno')`), 'Bruno NON può aggiungere ingredienti alla ricetta di Anna');
await fails(() => as(B, `insert into public.meal_plan_entries (date, slot, recipe_id) values ('2026-10-19','dinner','${rec.id}')`), 'Bruno NON può mettere la ricetta di Anna nel suo planner');
await fails(() => as(B, `update public.recipes set user_id = '${B}' where id = '${rec.id}'`).then(r => { if ((r.affectedRows ?? 0) === 0) throw new Error('0 righe'); }), 'Bruno NON può "rubare" la ricetta cambiando user_id');
await fails(() => as(A, `update public.recipes set user_id = '${B}' where id = '${rec.id}'`), 'Anna NON può regalare righe a Bruno cambiando user_id');

await as(A, `delete from public.sources where id = '${src}'`);
const after = (await as(A, `select source_id, user_id from public.recipes where id = '${rec.id}'`)).rows[0];
ok(after && after.source_id === null && after.user_id === A, 'cancellando il link la ricetta resta (source_id = null)');

const col = (await as(A, `insert into public.collections (name) values ('Cene veloci') returning id`)).rows[0].id;
await as(A, `insert into public.collection_items (collection_id, recipe_id) values ('${col}', '${rec.id}')`);
await fails(() => as(A, `insert into public.collection_items (collection_id, recipe_id) values ('${col}', '${rec.id}')`), 'la stessa ricetta non entra due volte nella collezione');
await fails(() => as(A, `insert into public.collection_items (collection_id) values ('${col}')`), 'un elemento di collezione deve essere ricetta O posto');
await fails(() => as(A, `insert into public.recipes (title, rating) values ('x', 6)`), 'voto oltre 5 rifiutato');
await fails(() => as(A, `insert into public.shopping_items (week_start, name) values ('2026-10-21', 'uova')`), 'week_start deve essere un lunedì');
await as(A, `insert into public.shopping_items (week_start, name) values ('2026-10-19', 'uova')`);
ok(true, 'lista spesa con lunedì accettata');
await as(A, `insert into public.places (name, city, recommended_dishes) values ('Trattoria da Maria', 'Genova', '{trofie al pesto}')`);
ok((await as(B, `select * from public.places`)).rows.length === 0, 'Bruno NON vede i posti di Anna');

const q = async (uid) => (await as(uid, `select public.consume_extraction_quota(2) as ok`)).rows[0].ok;
ok((await q(A)) && (await q(A)) && !(await q(A)), 'limite estrazioni: 2 sì, la terza no');
ok(await q(B), 'il limite di Anna non tocca Bruno');
ok((await as(A, `select extractions from public.usage_counters`)).rows[0].extractions === 2, 'il contatore resta a 2 dopo il rifiuto');
await fails(() => as(A, `update public.usage_counters set extractions = 0`).then(r => { if ((r.affectedRows ?? 0) === 0) throw new Error('0 righe'); }), 'Anna NON può azzerarsi il contatore da sola');
await fails(() => as(A, `insert into public.usage_counters (user_id, extractions) values ('${A}', -100)`), 'Anna NON può inserire contatori finti');

await as(A, `insert into storage.objects (bucket_id, name) values ('images', '${A}/thumb.jpg')`);
ok(true, 'Anna carica immagini nella sua cartella');
await fails(() => as(A, `insert into storage.objects (bucket_id, name) values ('images', '${B}/thumb.jpg')`), 'Anna NON può caricare nella cartella di Bruno');
ok((await as(B, `select * from storage.objects`)).rows.length === 0, 'Bruno NON elenca i file di Anna');

await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false); set role anon;`);
await fails(() => db.query(`select public.consume_extraction_quota(5)`), 'un utente non collegato non può usare la funzione quota');
ok((await db.query(`select * from public.recipes`)).rows.length === 0, 'un utente non collegato non vede nulla');

console.log(failures ? `\n${failures} controlli FALLITI` : '\nTutti i controlli superati');
process.exit(failures ? 1 : 0);
