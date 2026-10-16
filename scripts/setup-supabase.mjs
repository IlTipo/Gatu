// Prepara (o aggiorna) il progetto Supabase di Morso in automatico.
// Lo lancia GitHub Actions a ogni pubblicazione: si può rieseguire quante volte si vuole.
//
//  1. trova il progetto "morso" (o quello indicato da SUPABASE_PROJECT_REF), altrimenti lo crea
//  2. applica le migrazioni SQL non ancora applicate (supabase/migrations/*.sql)
//  3. configura l'accesso: indirizzo del sito, redirect consentiti, niente email di conferma
//  4. scrive URL e chiave pubblica per la costruzione del sito (in GITHUB_OUTPUT)
//
// Serve: SUPABASE_ACCESS_TOKEN (Supabase → Account → Access Tokens).
// Facoltativi: SUPABASE_PROJECT_REF, SITE_URL (es. https://iltipo.github.io/Gatu/), SUPABASE_REGION.

import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { appendFileSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const API = process.env.SUPABASE_API_URL || 'https://api.supabase.com/v1'; // sovrascrivibile solo nei test
const CLI = ['--yes', 'supabase@2.121.0'];
const PROJECT_NAME = 'morso';
const MIGRATIONS_DIR = 'supabase/migrations';

const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error('Manca SUPABASE_ACCESS_TOKEN.');
  process.exit(1);
}
const siteUrl = process.env.SITE_URL?.replace(/\/*$/, '/');
const region = process.env.SUPABASE_REGION || 'eu-central-1';

async function api(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const refOf = (p) => p.ref ?? p.id;

async function sql(ref, query) {
  return api('POST', `/projects/${ref}/database/query`, { query });
}

// ---------------------------------------------------------------- 1. progetto
async function findOrCreateProject() {
  const projects = await api('GET', '/projects');
  const wanted = process.env.SUPABASE_PROJECT_REF;
  const existing = wanted
    ? projects.find((p) => refOf(p) === wanted)
    : projects.find((p) => p.name?.toLowerCase() === PROJECT_NAME);
  if (wanted && !existing) throw new Error(`Progetto ${wanted} non trovato tra quelli del tuo account.`);
  if (existing) {
    console.log(`✔ Progetto trovato: ${existing.name} (${refOf(existing)})`);
    return refOf(existing);
  }

  const orgs = await api('GET', '/organizations');
  if (!orgs.length) throw new Error("Nessuna organizzazione su Supabase: apri supabase.com/dashboard una volta per crearla.");
  const org = orgs[0];
  console.log(`… Creo il progetto "${PROJECT_NAME}" (${region}) nell'organizzazione "${org.name}"`);
  // La password del database non serve a Morso (usiamo le API): la generiamo a caso e non la stampiamo.
  // Se un giorno ti servisse, puoi reimpostarla da Supabase → Project Settings → Database.
  const dbPassword = randomBytes(24).toString('base64url');
  execFileSync(
    'npx',
    [...CLI, 'projects', 'create', PROJECT_NAME, '--org-id', org.id ?? org.slug, '--db-password', dbPassword, '--region', region],
    { stdio: ['ignore', 'inherit', 'inherit'], env: process.env },
  );
  const created = (await api('GET', '/projects')).find((p) => p.name?.toLowerCase() === PROJECT_NAME);
  if (!created) throw new Error('Progetto creato ma non trovato: riprova tra un minuto.');
  return refOf(created);
}

async function waitUntilReady(ref) {
  for (let i = 0; i < 60; i++) {
    const project = await api('GET', `/projects/${ref}`);
    if (project.status === 'ACTIVE_HEALTHY') return;
    if (i === 0) console.log(`… Attendo che il progetto sia pronto (stato: ${project.status})`);
    await sleep(10_000);
  }
  throw new Error('Il progetto non è diventato pronto entro 10 minuti.');
}

// ---------------------------------------------------------------- 2. migrazioni
async function applyMigrations(ref) {
  // Stessa tabella che usa la Supabase CLI, così restano compatibili.
  await sql(
    ref,
    `create schema if not exists supabase_migrations;
     create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);`,
  );
  const applied = new Set((await sql(ref, 'select version from supabase_migrations.schema_migrations')).map((r) => r.version));

  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const [version, ...rest] = file.replace(/\.sql$/, '').split('_');
    const name = rest.join('_');
    if (applied.has(version)) continue;

    // Prima migrazione già eseguita a mano dall'SQL Editor? Allora la segniamo come fatta.
    if (file === files[0]) {
      const [{ exists }] = await sql(ref, "select to_regclass('public.sources') is not null as exists");
      if (exists) {
        console.log(`✔ ${file} era già stata applicata a mano`);
        await sql(ref, `insert into supabase_migrations.schema_migrations (version, name) values ('${version}', '${name}')`);
        continue;
      }
    }

    console.log(`… Applico ${file}`);
    const body = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    await sql(
      ref,
      `begin;\n${body}\n;insert into supabase_migrations.schema_migrations (version, name) values ('${version}', '${name}');\ncommit;`,
    );
    console.log(`✔ ${file}`);
  }
}

// ---------------------------------------------------------------- 3. accesso
async function configureAuth(ref) {
  if (!siteUrl) return;
  const current = await api('GET', `/projects/${ref}/config/auth`);
  const allowed = new Set(
    String(current.uri_allow_list ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
  allowed.add(`${siteUrl}**`);
  allowed.add('http://localhost:8081/**'); // sviluppo in locale
  await api('PATCH', `/projects/${ref}/config/auth`, {
    site_url: siteUrl,
    uri_allow_list: [...allowed].join(','),
    // Niente email di conferma: ci si registra e si entra subito
    // (l'email gratuita di Supabase ha limiti molto bassi).
    mailer_autoconfirm: true,
  });
  console.log(`✔ Accesso configurato per ${siteUrl}`);
}

// ---------------------------------------------------------------- 4. chiavi pubbliche
async function publicKey(ref) {
  const keys = await api('GET', `/projects/${ref}/api-keys`);
  const publishable = keys.find((k) => k.type === 'publishable' && k.api_key);
  const anon = keys.find((k) => k.name === 'anon' && k.api_key);
  const key = publishable?.api_key ?? anon?.api_key;
  if (!key) throw new Error('Chiave pubblica del progetto non trovata.');
  return key;
}

const ref = await findOrCreateProject();
await waitUntilReady(ref);
await applyMigrations(ref);
await configureAuth(ref);
const url = `https://${ref}.supabase.co`;
const key = await publicKey(ref);

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `project_ref=${ref}\nsupabase_url=${url}\nsupabase_key=${key}\n`);
}
console.log(`\n✔ Supabase pronto: ${url}`);
