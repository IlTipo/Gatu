// Costruisce il sito di Morso nella cartella dist/, pronto per GitHub Pages (o qualsiasi hosting statico).
//
// Uso:  EXPO_BASE_URL=/Gatu node scripts/build-web.mjs
//   EXPO_BASE_URL  percorso del sito (vuoto se sta alla radice del dominio)
//   EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_KEY  chiavi pubbliche di Supabase
import { execFileSync } from 'node:child_process';
import { copyFileSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const out = 'dist';
const baseUrl = (process.env.EXPO_BASE_URL ?? '').replace(/\/+$/, '');
if (baseUrl && !baseUrl.startsWith('/')) throw new Error('EXPO_BASE_URL deve iniziare con "/" (es. /Gatu)');

rmSync(out, { recursive: true, force: true });
execFileSync('npx', ['expo', 'export', '--platform', 'web', '--output-dir', out], { stdio: 'inherit' });

// 1. Sostituisce %BASE_URL% nella pagina.
const indexPath = join(out, 'index.html');
const html = readFileSync(indexPath, 'utf8').replaceAll('%BASE_URL%', baseUrl);
writeFileSync(indexPath, html);

// 2. GitHub Pages non conosce le pagine dell'app (/planner, /recipe/123…):
//    con 404.html uguale a index.html, ogni indirizzo apre comunque l'app.
copyFileSync(indexPath, join(out, '404.html'));

// 3. Senza questo file GitHub Pages ignorerebbe la cartella _expo (inizia con "_").
writeFileSync(join(out, '.nojekyll'), '');

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
  icons: [
    { src: `${baseUrl}/icons/icon-192.png`, sizes: '192x192', type: 'image/png' },
    { src: `${baseUrl}/icons/icon-512.png`, sizes: '512x512', type: 'image/png' },
    { src: `${baseUrl}/icons/maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};
writeFileSync(join(out, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2));

console.log(`\n✔ Sito pronto in ${out}/ (percorso: "${baseUrl || '/'}")`);
