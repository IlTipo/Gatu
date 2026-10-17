// Costruisce il sito di Morso nella cartella dist/, pronto per GitHub Pages (o qualsiasi hosting statico).
//
// Uso:  EXPO_BASE_URL=/Gatu node scripts/build-web.mjs
//   EXPO_BASE_URL  percorso del sito (vuoto se sta alla radice del dominio)
//   EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_KEY  chiavi pubbliche di Supabase
//   CUSTOM_DOMAIN  facoltativo, es. morso.app: scrive il file CNAME per GitHub Pages
//   HOSTING        "cloudflare" per Cloudflare Pages (senza 404.html: lì ogni pagina apre l'app da sola)
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const out = 'dist';
const baseUrl = (process.env.EXPO_BASE_URL ?? '').replace(/\/+$/, '');
if (baseUrl && !baseUrl.startsWith('/')) throw new Error('EXPO_BASE_URL deve iniziare con "/" (es. /Gatu)');
const customDomain = (process.env.CUSTOM_DOMAIN ?? '').trim().toLowerCase();
if (customDomain && !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(customDomain)) {
  throw new Error(`CUSTOM_DOMAIN non valido: "${customDomain}" (es. morso.app, senza https://)`);
}

rmSync(out, { recursive: true, force: true });
execFileSync('npx', ['expo', 'export', '--platform', 'web', '--output-dir', out], { stdio: 'inherit' });

// 1. Sostituisce %BASE_URL% nella pagina.
const indexPath = join(out, 'index.html');
const html = readFileSync(indexPath, 'utf8').replaceAll('%BASE_URL%', baseUrl);
writeFileSync(indexPath, html);

// 1b. Cloudflare Pages non pubblica le cartelle "node_modules", dove Expo mette i font delle icone:
//     senza questo passo le icone sparirebbero. Le spostiamo in assets/vendor e aggiorniamo i percorsi.
const vendorFrom = join(out, 'assets', 'node_modules');
if (existsSync(vendorFrom)) {
  renameSync(vendorFrom, join(out, 'assets', 'vendor'));
  for (const file of readdirSync(out, { recursive: true, withFileTypes: true })) {
    if (!file.isFile() || !/\.(js|html|css|json)$/.test(file.name)) continue;
    const path = join(file.parentPath, file.name);
    const text = readFileSync(path, 'utf8');
    if (text.includes('assets/node_modules/')) writeFileSync(path, text.replaceAll('assets/node_modules/', 'assets/vendor/'));
  }
}

// 2. GitHub Pages non conosce le pagine dell'app (/planner, /recipe/123…):
//    con 404.html uguale a index.html, ogni indirizzo apre comunque l'app.
//    Cloudflare Pages invece, SENZA 404.html, apre già index.html per ogni pagina.
const hosting = (process.env.HOSTING ?? '').trim().toLowerCase();
if (hosting !== 'cloudflare') copyFileSync(indexPath, join(out, '404.html'));

// 3. Senza questo file GitHub Pages ignorerebbe la cartella _expo (inizia con "_").
writeFileSync(join(out, '.nojekyll'), '');

// 3b. Dominio personale (es. morso.app): GitHub Pages lo legge dal file CNAME.
//     Va ripubblicato ogni volta, altrimenti GitHub dimenticherebbe il dominio.
if (customDomain) writeFileSync(join(out, 'CNAME'), `${customDomain}\n`);

// 4. Manifest: rende il sito installabile sulla schermata Home del telefono.
const manifest = {
  name: 'Morso',
  short_name: 'Morso',
  description: 'Salva ricette e ristoranti dai social e trasformali in pasti e uscite vere.',
  lang: 'it',
  start_url: `${baseUrl}/`,
  scope: `${baseUrl}/`,
  display: 'standalone',
  orientation: 'portrait',
  background_color: '#FBF7F2',
  theme_color: '#E0592A',
  // Android: il sito installato compare nel menu "Condividi" delle altre app (TikTok, Instagram, Chrome…)
  share_target: {
    action: `${baseUrl}/add`,
    method: 'GET',
    params: { title: 'title', text: 'text', url: 'url' },
  },
  icons: [
    { src: `${baseUrl}/icons/icon-192.png`, sizes: '192x192', type: 'image/png' },
    { src: `${baseUrl}/icons/icon-512.png`, sizes: '512x512', type: 'image/png' },
    { src: `${baseUrl}/icons/maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};
writeFileSync(join(out, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2));

console.log(`\n✔ Sito pronto in ${out}/ (percorso: "${baseUrl || '/'}"${customDomain ? `, dominio: ${customDomain}` : ''})`);
