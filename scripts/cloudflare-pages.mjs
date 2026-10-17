// Prepara il progetto su Cloudflare Pages (lo crea la prima volta) e scrive l'indirizzo vero del sito.
// Lo lancia GitHub Actions; il caricamento dei file lo fa poi "wrangler pages deploy".
//
// Serve: CLOUDFLARE_API_TOKEN (permesso "Cloudflare Pages: Edit"), CLOUDFLARE_ACCOUNT_ID,
//        CLOUDFLARE_PROJECT (es. "morso" → https://morso.pages.dev, se il nome è libero).
// Scrive in GITHUB_OUTPUT: project=…, url=https://….pages.dev/

import { appendFileSync } from 'node:fs';

const API = process.env.CLOUDFLARE_API_URL || 'https://api.cloudflare.com/client/v4'; // sovrascrivibile solo nei test
const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
const account = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
const project = process.env.CLOUDFLARE_PROJECT?.trim().toLowerCase();

if (!token || !account) {
  console.error('Mancano i secret CLOUDFLARE_API_TOKEN e/o CLOUDFLARE_ACCOUNT_ID (vedi README).');
  process.exit(1);
}
// nomi ammessi da Cloudflare Pages: minuscole, numeri e trattini
if (!project || !/^[a-z0-9]([a-z0-9-]{0,56}[a-z0-9])?$/.test(project)) {
  console.error(`Nome del progetto non valido: "${project ?? ''}" (usa solo minuscole, numeri e trattini, es. morso).`);
  process.exit(1);
}
if (!/^[0-9a-f]{32}$/.test(account)) {
  console.error('CLOUDFLARE_ACCOUNT_ID non sembra giusto: sono 32 caratteri tra 0-9 e a-f (vedi README).');
  process.exit(1);
}

async function api(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

const explain = (data) => (data.errors ?? []).map((e) => `${e.code}: ${e.message}`).join('; ') || 'errore sconosciuto';

let found = await api('GET', `/accounts/${account}/pages/projects/${project}`);
if (found.status === 404) {
  console.log(`… Creo il progetto "${project}" su Cloudflare Pages`);
  const created = await api('POST', `/accounts/${account}/pages/projects`, { name: project, production_branch: 'main' });
  if (!created.data.success) {
    console.error(`Non riesco a creare il progetto: ${explain(created.data)}`);
    process.exit(1);
  }
  found = created;
} else if (found.status === 401 || found.status === 403) {
  console.error(`Cloudflare rifiuta la chiave: controlla che il token abbia il permesso "Cloudflare Pages: Edit". (${explain(found.data)})`);
  process.exit(1);
} else if (!found.data.success) {
  console.error(`Errore da Cloudflare: ${explain(found.data)}`);
  process.exit(1);
}

const subdomain = String(found.data.result?.subdomain ?? '').toLowerCase();
if (!/^[a-z0-9-]+\.pages\.dev$/.test(subdomain)) {
  console.error(`Indirizzo del progetto inatteso: "${subdomain}"`);
  process.exit(1);
}
const url = `https://${subdomain}/`;
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `project=${project}\nurl=${url}\n`);
console.log(`✔ Cloudflare Pages pronto: ${url}`);
