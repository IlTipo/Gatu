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
ok((await as(B, `select * from public.collections`)).rows.length === 0, 'Bruno NON vede le collezioni di Anna');
ok((await as(B, `select * from public.collection_items`)).rows.length === 0, 'Bruno NON vede cosa c\'è nelle collezioni di Anna');
const recB = (await as(B, `insert into public.recipes (title) values ('Pasta di Bruno') returning id`)).rows[0].id;
await fails(() => as(B, `insert into public.collection_items (collection_id, recipe_id) values ('${col}', '${recB}')`), 'Bruno NON può aggiungere elementi alla collezione di Anna');
const colB = (await as(B, `insert into public.collections (name) values ('Mie') returning id`)).rows[0].id;
await fails(() => as(B, `insert into public.collection_items (collection_id, recipe_id) values ('${colB}', '${rec.id}')`), 'Bruno NON può mettere la ricetta di Anna nella sua collezione');
ok(((await as(B, `delete from public.collections where id = '${col}'`)).affectedRows ?? 0) === 0, 'Bruno NON può cancellare la collezione di Anna');
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


// --- Fase 2: save_extraction ---
const src2 = (await as(A, `insert into public.sources (url, platform, thumbnail_url) values ('https://www.tiktok.com/@x/video/2','tiktok','https://img/x.jpg') returning id`)).rows[0].id;
const recipeResult = JSON.stringify({ kind: 'recipe', recipe: { title: 'Pasta al limone', description: null, servings: 2, prep_minutes: 5, cook_minutes: 10, total_minutes: 15, tags: ['veloce', 'primo'],
  ingredients: [{ quantity: 160, unit: 'g', name: 'spaghetti', note: null, aisle: 'dispensa' }, { quantity: null, unit: null, name: 'pepe', note: 'q.b.', aisle: 'dispensa' }],
  steps: [{ text: 'Cuoci la pasta', timer_seconds: 600 }, { text: 'Manteca con il limone', timer_seconds: null }] } }).replace(/'/g, "''");
const saved = (await as(A, `select public.save_extraction('${src2}', '${recipeResult}'::jsonb, 'done', '{"model":"x"}'::jsonb) as r`)).rows[0].r;
ok(!!saved.recipe_id, 'save_extraction crea la ricetta');
const rec2 = (await as(A, `select title, servings, tags, image_url from public.recipes where id = '${saved.recipe_id}'`)).rows[0];
ok(rec2.title === 'Pasta al limone' && rec2.servings === 2 && rec2.tags.join() === 'veloce,primo' && rec2.image_url === 'https://img/x.jpg', 'dati della ricetta e foto salvati');
const ings = (await as(A, `select name, quantity, position from public.recipe_ingredients where recipe_id = '${saved.recipe_id}' order by position`)).rows;
ok(ings.length === 2 && ings[0].name === 'spaghetti' && ings[1].quantity === null, 'ingredienti in ordine, "q.b." senza quantità');
ok((await as(A, `select count(*)::int n from public.recipe_steps where recipe_id = '${saved.recipe_id}'`)).rows[0].n === 2, 'passaggi salvati');
ok((await as(A, `select status from public.sources where id = '${src2}'`)).rows[0].status === 'done', 'stato del link aggiornato');

const placesResult = JSON.stringify({ kind: 'places', places: [
  { name: 'Trattoria Anna Maria', city: 'Bologna', address: 'Via Belle Arti 17/A', latitude: 44.49, longitude: 11.35, verified: true, cuisine: 'emiliana', price_level: 2, recommended_dishes: ['tortellini in brodo'] },
  { name: "Osteria dell'Orsa", city: 'Bologna', address: null, latitude: null, longitude: null, verified: false, cuisine: null, price_level: null, recommended_dishes: [] }] }).replace(/'/g, "''");
const saved2 = (await as(A, `select public.save_extraction('${src2}', '${placesResult}'::jsonb, 'needs_review', '{}'::jsonb) as r`)).rows[0].r;
ok(saved2.place_ids.length === 2 && saved2.recipe_id === null, 'una nuova analisi salva i locali...');
ok((await as(A, `select count(*)::int n from public.recipes where source_id = '${src2}'`)).rows[0].n === 0, '...e sostituisce la ricetta precedente');
ok((await as(A, `select count(*)::int n from public.recipe_ingredients where recipe_id = '${saved.recipe_id}'`)).rows[0].n === 0, 'gli ingredienti vecchi spariscono con la ricetta');
await fails(() => as(B, `select public.save_extraction('${src2}', '${placesResult}'::jsonb, 'done', '{}'::jsonb)`), 'Bruno NON può salvare risultati sul link di Anna');
ok((await as(A, `select count(*)::int n from public.places where source_id = '${src2}'`)).rows[0].n === 2, 'i locali di Anna restano intatti');

// --- update_recipe ---
const src3 = (await as(A, `insert into public.sources (url) values ('https://example.com/r3') returning id`)).rows[0].id;
const r3 = (await as(A, `select public.save_extraction('${src3}', '${recipeResult}'::jsonb, 'done', '{}'::jsonb) as r`)).rows[0].r.recipe_id;
const edited = JSON.stringify({ title: 'Pasta al limone (mia versione)', description: null, servings: 3, prep_minutes: 5, cook_minutes: 12, total_minutes: 17, tags: ['primo'],
  ingredients: [{ quantity: 240, unit: 'g', name: 'spaghetti', note: '', aisle: 'dispensa' }, { quantity: 1, unit: '', name: 'limone', note: null, aisle: 'frutta_verdura' }, { quantity: 30, unit: 'g', name: 'burro', note: null, aisle: 'latticini' }],
  steps: [{ text: 'Cuoci', timer_seconds: 720 }] }).replace(/'/g, "''");
await as(A, `select public.update_recipe('${r3}', '${edited}'::jsonb)`);
const after3 = (await as(A, `select title, servings, (select count(*)::int from public.recipe_ingredients where recipe_id = '${r3}') ni, (select count(*)::int from public.recipe_steps where recipe_id = '${r3}') ns, (select unit from public.recipe_ingredients where recipe_id = '${r3}' and name = 'limone') lu from public.recipes where id = '${r3}'`)).rows[0];
ok(after3.title === 'Pasta al limone (mia versione)' && after3.servings === 3 && after3.ni === 3 && after3.ns === 1 && after3.lu === null, 'update_recipe salva le correzioni (campi vuoti → null)');
await fails(() => as(B, `select public.update_recipe('${r3}', '${edited}'::jsonb)`), 'Bruno NON può modificare la ricetta di Anna');

// --- dosi stimate ---
const src4 = (await as(A, `insert into public.sources (url) values ('https://example.com/r4') returning id`)).rows[0].id;
const estimatedResult = JSON.stringify({ kind: 'recipe', recipe: { title: 'Frittata', servings: 2, servings_estimated: true, tags: [],
  ingredients: [{ quantity: 4, unit: null, name: 'uova', aisle: 'latticini', estimated: true }, { quantity: null, unit: null, name: 'sale', note: 'q.b.', aisle: 'dispensa' }],
  steps: [{ text: 'Sbatti le uova', timer_seconds: null }] } }).replace(/'/g, "''");
const r4 = (await as(A, `select public.save_extraction('${src4}', '${estimatedResult}'::jsonb, 'done', '{}'::jsonb) as r`)).rows[0].r.recipe_id;
const est = (await as(A, `select r.servings_estimated, array_agg(i.estimated order by i.position) e from public.recipes r join public.recipe_ingredients i on i.recipe_id = r.id where r.id = '${r4}' group by r.servings_estimated`)).rows[0];
ok(est.servings_estimated === true && est.e.join() === 'true,false', 'dosi e porzioni stimate salvate (q.b. non stimato)');

// --- dettagli in più: valori, varianti, info locali ---
const src5 = (await as(A, `insert into public.sources (url, thumbnail_url) values ('https://example.com/r5', 'https://img/5.jpg') returning id`)).rows[0].id;
const withInsights = JSON.stringify({ kind: 'recipe', recipe: { title: 'Lasagne', servings: 6, tags: [], ingredients: [{ quantity: 500, unit: 'g', name: 'sfoglia', aisle: 'latticini' }], steps: [{ text: 'Inforna' }],
  insights: { kcal_per_serving: 620, protein_g: 31.5, carbs_g: 55, fat_g: 28, difficulty: 'media', cost_level: 2 } } }).replace(/'/g, "''");
const r5 = (await as(A, `select public.save_extraction('${src5}', '${withInsights}'::jsonb, 'done', '{}'::jsonb) as r`)).rows[0].r.recipe_id;
const ins = (await as(A, `select kcal_per_serving, protein_g::float p, difficulty, cost_level, insights_at is not null has_at from public.recipes where id = '${r5}'`)).rows[0];
ok(ins.kcal_per_serving === 620 && ins.p === 31.5 && ins.difficulty === 'media' && ins.cost_level === 2 && ins.has_at, 'calorie, difficoltà e costo salvati');
await fails(() => as(A, `update public.recipes set difficulty = 'impossibile' where id = '${r5}'`), 'difficoltà solo facile/media/difficile');
const variant = JSON.stringify({ title: 'Lasagne (vegana)', servings: 6, tags: ['vegano'], ingredients: [{ quantity: 500, unit: 'g', name: 'sfoglia senza uova', aisle: 'dispensa' }], steps: [{ text: 'Inforna', timer_seconds: 2400 }] }).replace(/'/g, "''");
const v1 = (await as(A, `select public.create_recipe('${variant}'::jsonb) as id`)).rows[0].id;
const vrow = (await as(A, `select user_id, source_id, title, (select count(*)::int from public.recipe_steps where recipe_id = '${v1}') ns from public.recipes where id = '${v1}'`)).rows[0];
ok(vrow.user_id === A && vrow.source_id === null && vrow.title === 'Lasagne (vegana)' && vrow.ns === 1, 'create_recipe crea la variante come ricetta nuova');
ok((await as(B, `select * from public.recipes where id = '${v1}'`)).rows.length === 0, 'Bruno NON vede la variante di Anna');
const placeInfo = JSON.stringify({ kind: 'places', places: [{ name: 'Da Gino', city: 'Genova', phone: '+39 010 123456', website: 'https://dagino.it', opening_hours: 'Mo-Sa 12:00-15:00' }] }).replace(/'/g, "''");
await as(A, `select public.save_extraction('${src5}', '${placeInfo}'::jsonb, 'done', '{}'::jsonb)`);
const pinfo = (await as(A, `select phone, website, opening_hours, wishlist from public.places where source_id = '${src5}'`)).rows[0];
ok(pinfo.phone === '+39 010 123456' && pinfo.website === 'https://dagino.it' && pinfo.opening_hours === 'Mo-Sa 12:00-15:00' && pinfo.wishlist === false, 'telefono, sito e orari del locale salvati');

// --- Fase 3+: collezioni automatiche e ordine ---
const mk = async (uid, name, pos) => (await as(uid, `insert into public.collections (name, position) values ('${name}', ${pos}) returning id`)).rows[0].id;
const a1 = await mk(A, 'Uno', 0), a2 = await mk(A, 'Due', 1), b1 = await mk(B, 'DiBruno', 0);
await as(A, `update public.collections set rules = '{"tags":["vegetariano"],"max_minutes":30}' where id = '${a1}'`);
ok((await as(A, `select rules->>'max_minutes' m from public.collections where id = '${a1}'`)).rows[0].m === '30', 'regole della collezione automatica salvate');
await fails(() => as(A, `update public.collections set rules = '[1,2]' where id = '${a1}'`), 'le regole devono essere un oggetto');
await fails(() => as(A, `update public.collections set rules = jsonb_build_object('x', repeat('a', 5000)) where id = '${a1}'`), 'regole troppo grandi rifiutate');
await as(A, `select public.reorder_collections(array['${a2}', '${a1}', '${b1}']::uuid[])`);
const order = (await as(A, `select id, position from public.collections where id in ('${a1}', '${a2}')`)).rows;
ok(order.find((r) => r.id === a2).position === 0 && order.find((r) => r.id === a1).position === 1, 'riordino delle collezioni');
ok((await as(B, `select position from public.collections where id = '${b1}'`)).rows[0].position === 0, 'il riordino di Anna NON tocca le collezioni di Bruno');

// --- Fase 5: planner ---
const recA = (await as(A, `insert into public.recipes (title, servings) values ('Risotto', 2) returning id`)).rows[0].id;
const recB2 = (await as(B, `insert into public.recipes (title) values ('Pizza di Bruno') returning id`)).rows[0].id;
const meal = (await as(A, `insert into public.meal_plan_entries (date, slot, recipe_id, servings) values ('2026-10-19', 'dinner', '${recA}', 4) returning id`)).rows[0].id;
ok((await as(B, `select * from public.meal_plan_entries`)).rows.length === 0, 'Bruno NON vede il planner di Anna');
ok(((await as(B, `update public.meal_plan_entries set servings = 9 where id = '${meal}'`)).affectedRows ?? 0) === 0, 'Bruno NON può modificare i pasti di Anna');
await fails(() => as(A, `update public.meal_plan_entries set recipe_id = '${recB2}' where id = '${meal}'`), 'Anna NON può collegare un suo pasto alla ricetta di Bruno');
await fails(() => as(A, `insert into public.meal_plan_entries (date, slot, recipe_id) values ('2026-10-20', 'colazione', '${recA}')`), 'solo pranzo o cena');
await as(A, `update public.meal_plan_entries set date = '2026-10-21', slot = 'lunch' where id = '${meal}'`);
ok((await as(A, `select slot from public.meal_plan_entries where id = '${meal}'`)).rows[0].slot === 'lunch', 'spostare un pasto');
await as(A, `delete from public.recipes where id = '${recA}'`);
ok((await as(A, `select * from public.meal_plan_entries where id = '${meal}'`)).rows.length === 0, 'cancellando la ricetta spariscono i suoi pasti');

// --- Fase 6: lista della spesa ---
await as(A, `insert into public.shopping_items (week_start, name, is_manual) values ('2026-10-26', 'detersivo', true)`);
const list1 = JSON.stringify([{ name: 'spaghetti', quantity: 320, unit: 'g', aisle: 'dispensa', checked: true, recipe_ids: [] }, { name: 'sale', quantity: null, unit: null, aisle: 'dispensa' }]);
await as(A, `select public.replace_shopping_list('2026-10-26', '${list1}'::jsonb)`);
const list2 = JSON.stringify([{ name: 'spaghetti', quantity: 480, unit: 'g', aisle: 'dispensa', checked: true }]);
await as(A, `select public.replace_shopping_list('2026-10-26', '${list2}'::jsonb)`);
const shop = (await as(A, `select name, quantity::float q, checked, is_manual from public.shopping_items where week_start = '2026-10-26' order by is_manual, name`)).rows;
ok(shop.length === 2 && shop[0].name === 'spaghetti' && shop[0].q === 480 && shop[0].checked && shop[1].name === 'detersivo' && shop[1].is_manual, 'lista rigenerata: voci automatiche sostituite, quelle a mano restano');
await as(B, `select public.replace_shopping_list('2026-10-26', '[]'::jsonb)`);
ok((await as(A, `select count(*)::int n from public.shopping_items where week_start = '2026-10-26'`)).rows[0].n === 2, 'la lista di Bruno NON tocca quella di Anna');
ok((await as(B, `select * from public.shopping_items`)).rows.length === 0, 'Bruno NON vede la spesa di Anna');
await fails(() => as(A, `select public.replace_shopping_list('2026-10-26', '{"a":1}'::jsonb)`), 'la lista deve essere un elenco');
await fails(() => as(A, `select public.replace_shopping_list('2026-10-27', '[]'::jsonb)`).then(() => as(A, `select public.replace_shopping_list('2026-10-27', '[{"name":"x"}]'::jsonb)`)), 'la settimana deve iniziare di lunedì');

// --- Fase 8: voti e note ---
const recN = (await as(A, `insert into public.recipes (title) values ('Tiramisù') returning id`)).rows[0].id;
await as(A, `update public.recipes set status = 'tried', rating = 5, notes = 'perfetto con poco zucchero', last_cooked_at = now() where id = '${recN}'`);
const rn = (await as(A, `select status, rating, notes from public.recipes where id = '${recN}'`)).rows[0];
ok(rn.status === 'tried' && rn.rating === 5 && rn.notes === 'perfetto con poco zucchero', 'voto, stato e note salvati');
await fails(() => as(A, `update public.recipes set rating = 0 where id = '${recN}'`), 'voto minimo 1');
await fails(() => as(A, `update public.recipes set notes = repeat('a', 5001) where id = '${recN}'`), 'note troppo lunghe rifiutate');
ok(((await as(B, `update public.recipes set rating = 1 where id = '${recN}'`)).affectedRows ?? 0) === 0, 'Bruno NON può votare la ricetta di Anna');

// --- Video (procedimento dal video) ---
await db.exec(`reset role`);
ok((await db.query(`select public from storage.buckets where id = 'videos'`)).rows[0]?.public === false, 'la cartella dei video è privata (niente link pubblici)');
await as(A, `insert into storage.objects (bucket_id, name) values ('videos', '${A}/v1.mp4')`);
ok(true, 'Anna carica un video nella sua cartella');
await fails(() => as(A, `insert into storage.objects (bucket_id, name) values ('videos', '${B}/v1.mp4')`), 'Anna NON può caricare video nella cartella di Bruno');
ok((await as(B, `select * from storage.objects where bucket_id = 'videos'`)).rows.length === 0, 'Bruno NON vede i video di Anna');
ok(((await as(B, `delete from storage.objects where bucket_id = 'videos' and name = '${A}/v1.mp4'`)).affectedRows ?? 0) === 0, 'Bruno NON può cancellare i video di Anna');

// --- Rinforzi di sicurezza ---
ok((await as(A, `select public.consume_extraction_quota(null) as ok`)).rows[0].ok === false, 'limite giornaliero assente → negato (non illimitato)');
ok((await as(A, `select public.consume_extraction_quota(0) as ok`)).rows[0].ok === false, 'limite zero → negato');
await fails(() => as(A, `insert into public.recipes (title) values (repeat('a', 301))`), 'titolo troppo lungo rifiutato');
await fails(() => as(A, `insert into public.places (name, website) values ('x', repeat('a', 2001))`), 'sito troppo lungo rifiutato');
const many = JSON.stringify({ title: 'Tanti ingredienti', ingredients: Array.from({ length: 201 }, (_, i) => ({ name: `ing ${i}` })), steps: [] });
await fails(() => as(A, `select public.create_recipe('${many}'::jsonb)`), 'oltre 200 ingredienti rifiutati');
const ok200 = JSON.stringify({ title: 'Ricetta lunga', ingredients: Array.from({ length: 200 }, (_, i) => ({ name: `ing ${i}` })), steps: [{ text: 'ok' }] });
ok(!!(await as(A, `select public.create_recipe('${ok200}'::jsonb) as id`)).rows[0].id, '200 ingredienti vanno bene');

await fails(() => as(A, `insert into public.recipes (title, image_url) values ('x', 'javascript:alert(1)')`), 'foto con link javascript: rifiutata');
await fails(() => as(A, `insert into public.places (name, website) values ('x', 'data:text/html,ciao')`), 'sito con link data: rifiutato');
await fails(() => as(A, `insert into storage.objects (bucket_id, name) values ('images', '${A}/../${B}/x.jpg')`), 'nomi file con ../ rifiutati');

// --- Porzioni, obiettivi e diario calorie ---
await as(A, `update public.profiles set portions = '{"pasta": 100}', kcal_goal = 2200, protein_goal = 140 where id = '${A}'`);
const prefA = (await as(A, `select portions, kcal_goal from public.profiles`)).rows[0];
ok(prefA.portions.pasta === 100 && prefA.kcal_goal === 2200, 'Anna salva porzioni e obiettivi');
ok(((await as(B, `update public.profiles set kcal_goal = 900 where id = '${A}'`)).affectedRows ?? 0) === 0, 'Bruno NON può cambiare gli obiettivi di Anna');
await fails(() => as(A, `update public.profiles set portions = '[1,2]' where id = '${A}'`), 'porzioni: deve essere un oggetto');
await fails(() => as(A, `update public.profiles set kcal_goal = 100 where id = '${A}'`), 'obiettivo calorie assurdo rifiutato');
const recL = (await as(A, `insert into public.recipes (title) values ('Pasta e ceci') returning id`)).rows[0].id;
const logA = (await as(A, `insert into public.food_log (eaten_on, slot, name, kcal, protein_g, source, recipe_id, servings) values ('2026-10-20', 'lunch', 'Pasta e ceci', 650, 24, 'recipe', '${recL}', 1) returning id`)).rows[0].id;
await as(A, `insert into public.food_log (eaten_on, name, kcal, source) values ('2026-10-20', 'Barretta proteica', 200, 'manual')`);
ok((await as(A, `select sum(kcal)::int k from public.food_log where eaten_on = '2026-10-20'`)).rows[0].k === 850, 'il diario somma le calorie del giorno');
ok((await as(B, `select * from public.food_log`)).rows.length === 0, 'Bruno NON vede il diario di Anna');
ok(((await as(B, `delete from public.food_log where id = '${logA}'`)).affectedRows ?? 0) === 0, 'Bruno NON può cancellare il diario di Anna');
await fails(() => as(B, `insert into public.food_log (eaten_on, name, kcal, recipe_id) values ('2026-10-20', 'x', 1, '${recL}')`), 'Bruno NON può collegare il suo diario alla ricetta di Anna');
await fails(() => as(B, `insert into public.food_log (user_id, eaten_on, name, kcal) values ('${A}', '2026-10-20', 'x', 1)`), 'Bruno NON può scrivere nel diario di Anna');
await fails(() => as(A, `insert into public.food_log (eaten_on, name, kcal) values ('2026-10-20', 'x', -5)`), 'calorie negative rifiutate');
await fails(() => as(A, `insert into public.food_log (eaten_on, name, kcal, slot) values ('2026-10-20', 'x', 5, 'merenda')`), 'momento della giornata non valido');
await as(A, `delete from public.recipes where id = '${recL}'`);
const kept = (await as(A, `select recipe_id, kcal from public.food_log where id = '${logA}'`)).rows[0];
ok(kept && kept.recipe_id === null && kept.kcal === 650, 'cancellando la ricetta la voce del diario resta (senza collegamento)');
await fails(() => as(A, `insert into public.food_log (eaten_on, name, kcal) select '2026-10-22', 'x', 1 from generate_series(1, 101)`), 'al massimo 100 voci al giorno');

// --- Profilo, consigli e amici ---
const C = '33333333-3333-3333-3333-333333333333';
await db.exec(`reset role; insert into auth.users (id, email) values ('${C}', 'carla@example.com')`);
const codeA = (await as(A, `select friend_code from public.profiles`)).rows[0].friend_code;
const codeB = (await as(B, `select friend_code from public.profiles`)).rows[0].friend_code;
ok(/^[0-9A-F]{8}$/.test(codeA) && codeA !== codeB, 'ognuno ha il suo codice amico');
await fails(() => as(A, `update public.profiles set friend_code = '${codeB}' where id = '${A}'`), 'il codice amico NON si cambia a mano');
await as(A, `update public.profiles set display_name = 'Anna R.' where id = '${A}'`);
ok((await as(A, `select display_name from public.profiles`)).rows[0].display_name === 'Anna R.', 'Anna cambia il suo nome');
await fails(() => as(A, `update public.profiles set display_name = repeat('a', 51) where id = '${A}'`), 'nome troppo lungo rifiutato');
await fails(() => as(A, `update public.profiles set avatar_url = 'https://evil.example.com/pixel.png' where id = '${A}'`), 'foto profilo da siti esterni rifiutata');
await fails(() => as(A, `update public.profiles set avatar_url = 'https://abc.supabase.co/storage/v1/object/public/images/${B}/a.jpg' where id = '${A}'`), 'foto profilo dalla cartella di un altro rifiutata');
await as(A, `update public.profiles set avatar_url = 'https://abc.supabase.co/storage/v1/object/public/images/${A}/avatar-1.jpg' where id = '${A}'`);
ok(true, 'foto profilo dalla propria cartella accettata');

await as(A, `insert into public.feedback (message) values ('Aggiungete la modalità vegana')`);
ok((await as(B, `select * from public.feedback`)).rows.length === 0, 'Bruno NON legge i consigli di Anna');
await fails(() => as(A, `insert into public.feedback (message) select 'idea ' || g from generate_series(1, 5) g`), 'al massimo 5 consigli al giorno');

ok((await as(A, `select public.send_friend_request('nessuno') as r`)).rows[0].r === 'not_found', 'codice sbagliato');
ok((await as(A, `select public.send_friend_request('${codeA}') as r`)).rows[0].r === 'self', 'non puoi aggiungere te stesso');
ok((await as(A, `select public.send_friend_request(' ${codeB.toLowerCase()} ') as r`)).rows[0].r === 'sent', 'Anna manda la richiesta a Bruno (codice anche minuscolo)');
ok((await as(A, `select public.send_friend_request('${codeB}') as r`)).rows[0].r === 'already', 'richiesta doppia non creata');
await fails(() => as(B, `select public.friend_feed('${A}', '2026-10-20')`), 'prima di accettare Bruno NON vede niente di Anna');
await fails(() => as(A, `insert into public.friendships (requester, addressee, status) values ('${A}', '${C}', 'accepted')`), 'NON si può creare un\'amicizia "già accettata" a mano');
const reqB = (await as(B, `select * from public.list_friends()`)).rows[0];
ok(reqB.incoming === true && reqB.status === 'pending' && reqB.display_name === 'Anna R.', 'Bruno vede la richiesta di Anna');
await as(A, `select public.respond_friend_request('${reqB.id}', true)`);
ok((await as(B, `select status from public.list_friends()`)).rows[0].status === 'pending', 'Anna NON può accettare da sola la propria richiesta');
await as(B, `select public.respond_friend_request('${reqB.id}', true)`);
ok((await as(A, `select status from public.list_friends()`)).rows[0].status === 'accepted', 'Bruno accetta: ora sono amici');

const recF = (await as(A, `insert into public.recipes (title, last_cooked_at, image_url) values ('Lasagne', now(), 'https://evil.example.com/x.jpg') returning id`)).rows[0].id;
await as(A, `insert into public.recipe_ingredients (recipe_id, position, name) values ('${recF}', 0, 'sfoglia')`);
await as(A, `insert into public.meal_plan_entries (date, slot, recipe_id) values ('2026-10-21', 'dinner', '${recF}')`);
await as(A, `insert into public.food_log (eaten_on, name, kcal) values ('2026-10-20', 'Mela', 80)`);
let feed = (await as(B, `select public.friend_feed('${A}', '2026-10-20') as f`)).rows[0].f;
ok(feed.cooked.some((r) => r.title === 'Lasagne' && r.image_url === null), 'Bruno vede cosa ha cucinato Anna (foto esterne tolte)');
ok(feed.planner.some((m) => m.title === 'Lasagne'), 'Bruno vede il planner di Anna');
ok(feed.diary === null, 'il diario di Anna resta privato (non condiviso)');
await as(A, `update public.profiles set share_diary = true, share_planner = false where id = '${A}'`);
feed = (await as(B, `select public.friend_feed('${A}', '2026-10-20') as f`)).rows[0].f;
ok(feed.diary.some((d) => d.name === 'Mela') && feed.planner === null, 'Anna sceglie cosa condividere');
const copied = (await as(B, `select public.friend_recipe('${recF}') as r`)).rows[0].r;
ok(copied.title === 'Lasagne' && copied.ingredients[0].name === 'sfoglia', 'Bruno può vedere e salvare una ricetta di Anna');
await fails(() => as(C, `select public.friend_feed('${A}', '2026-10-20')`), 'Carla (non amica) NON vede niente di Anna');
await fails(() => as(C, `select public.friend_recipe('${recF}')`), 'Carla NON può copiare le ricette di Anna');
ok((await as(C, `select * from public.list_friends()`)).rows.length === 0, 'Carla NON vede le amicizie degli altri');
ok((await as(C, `select * from public.profiles`)).rows.length <= 1, 'Carla NON vede i profili degli altri');
ok((await as(C, `select * from public.recipes where id = '${recF}'`)).rows.length === 0, 'le tabelle restano private anche tra amici');
await as(B, `select public.remove_friend('${reqB.id}')`);
await fails(() => as(B, `select public.friend_feed('${A}', '2026-10-20')`), 'dopo aver tolto l\'amicizia non si vede più niente');

console.log(failures ? `\n${failures} controlli FALLITI` : '\nTutti i controlli superati');
process.exit(failures ? 1 : 0);
