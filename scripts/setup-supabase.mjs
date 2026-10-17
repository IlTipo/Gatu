// Prepara (o aggiorna) il progetto Supabase di Morso in automatico.
// Lo lancia GitHub Actions a ogni pubblicazione: si può rieseguire quante volte si vuole.
//
//  1. trova il progetto "morso" (o quello indicato da SUPABASE_PROJECT_REF), altrimenti lo crea
//  2. applica le migrazioni SQL non ancora applicate (supabase/migrations/*.sql)
//  3. configura l'accesso: indirizzo del sito, redirect consentiti, niente email di conferma
//  4. scrive URL e chiave pubblica per la costruzione del sito (in GITHUB_OUTPUT)
//
// Serve: SUPABASE_ACCESS_TOKEN (Supabase → Account → Access Tokens).
// Facoltativi: SUPABASE_PROJECT_REF, SITE_URL (es. https://iltipo.github.io/Gatu/), SUPABASE_REGION,
// GOOGLE_OAUTH_CLIENT_ID + GOOGLE_OAUTH_CLIENT_SECRET (attivano "Accedi con Google").

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
// il nome del sito va in minuscolo (iltipo.github.io), come lo scrive il browser
const siteUrl = process.env.SITE_URL ? new URL(process.env.SITE_URL).href.replace(/\/*$/, '/') : undefined;
const region = process.env.SUPABASE_REGION || 'eu-central-1';
const googleClientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
const googleSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();

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

// Il database mostra agli altri solo le foto di QUESTO progetto (non di altri progetti Supabase).
async function saveProjectRef(ref) {
  if (!/^[a-z0-9]+$/.test(ref)) throw new Error('Codice del progetto Supabase non valido.');
  await sql(
    ref,
    `insert into public.app_settings (key, value) values ('project_ref', '${ref}') on conflict (key) do update set value = excluded.value`,
  );
}

// Notifiche push: chiavi VAPID e segreto creati una volta sola (restano nel database, mai nel sito),
// poi una "sveglia" ogni minuto (pg_cron) che chiama la funzione push.
async function setupPush(ref) {
  const [{ n }] = await sql(ref, "select count(*)::int as n from public.app_settings where key in ('vapid_public', 'vapid_private_jwk', 'cron_secret')");
  if (n < 3) {
    const { subtle } = globalThis.crypto;
    const pair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const pub = Buffer.from(await subtle.exportKey('raw', pair.publicKey)).toString('base64url');
    const jwk = JSON.stringify(await subtle.exportKey('jwk', pair.privateKey));
    const secret = Buffer.from(globalThis.crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
    const values = [
      ['vapid_public', pub],
      ['vapid_private_jwk', jwk],
      ['cron_secret', secret],
    ];
    // valori generati qui (base64url e JSON senza apici): niente da sfuggire
    if (values.some(([, v]) => v.includes("'"))) throw new Error('valore inatteso');
    await sql(
      ref,
      `insert into public.app_settings (key, value) values ${values.map(([k, v]) => `('${k}', '${v}')`).join(', ')}
       on conflict (key) do nothing`,
    );
    console.log('✔ Chiavi per le notifiche create');
  }
  if (siteUrl && /^https:\/\/[a-z0-9.-]+(\/[A-Za-z0-9._-]*)*\/?$/.test(siteUrl)) {
    await sql(
      ref,
      `insert into public.app_settings (key, value) values ('vapid_subject', '${siteUrl}') on conflict (key) do update set value = excluded.value`,
    );
  }
  await sql(
    ref,
    `create extension if not exists pg_cron;
     create extension if not exists pg_net with schema extensions;
     select cron.schedule('morso-push', '* * * * *', $cron$
       select net.http_post(
         url := 'https://${ref}.supabase.co/functions/v1/push',
         headers := jsonb_build_object('content-type', 'application/json',
                                       'x-cron-secret', (select value from public.app_settings where key = 'cron_secret')),
         body := '{}'::jsonb,
         timeout_milliseconds := 25000
       );
     $cron$);
     select cron.schedule('morso-cron-cleanup', '17 3 * * *', $cron$
       delete from cron.job_run_details where end_time < now() - interval '2 days';
     $cron$);`,
  );
  console.log('✔ Notifiche push attive (controllo ogni minuto)');
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
  // niente indirizzi localhost nel sito pubblicato: dopo l'accesso si torna solo sul sito vero
  allowed.delete('http://localhost:8081/**');
  // "Accedi con Google": solo se ci sono entrambe le chiavi di Google (i secret non finiscono nel sito)
  const google =
    googleClientId && googleSecret
      ? { external_google_enabled: true, external_google_client_id: googleClientId, external_google_secret: googleSecret }
      : {};
  await api('PATCH', `/projects/${ref}/config/auth`, {
    site_url: siteUrl,
    uri_allow_list: [...allowed].join(','),
    // Niente email di conferma: ci si registra e si entra subito
    // (l'email gratuita di Supabase ha limiti molto bassi).
    mailer_autoconfirm: true,
    ...google,
  });
  console.log(`✔ Accesso configurato per ${siteUrl}`);
  if (googleClientId && googleSecret) {
    console.log('✔ Accesso con Google attivo');
  } else if (googleClientId || googleSecret) {
    console.log('⚠ Per Google servono entrambi i secret GOOGLE_OAUTH_CLIENT_ID e GOOGLE_OAUTH_CLIENT_SECRET.');
  } else {
    console.log(`ℹ Accesso con Google spento. Per attivarlo vedi il README; indirizzo di ritorno: https://${ref}.supabase.co/auth/v1/callback`);
  }
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
await saveProjectRef(ref);
await setupPush(ref);
await configureAuth(ref);
const url = `https://${ref}.supabase.co`;
const key = await publicKey(ref);

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `project_ref=${ref}\nsupabase_url=${url}\nsupabase_key=${key}\n`);
}
console.log(`\n✔ Supabase pronto: ${url}`);
