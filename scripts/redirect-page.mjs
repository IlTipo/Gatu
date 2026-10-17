// Pagina "trasloco": il vecchio indirizzo (es. iltipo.github.io/Gatu/…) rimanda al nuovo,
// conservando la pagina aperta (es. /Gatu/recipe/123 → https://morso.pages.dev/recipe/123).
//
// Uso: node scripts/redirect-page.mjs <indirizzo nuovo> <cartella di uscita> [percorso vecchio, es. /Gatu]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [target, out, oldBase = ''] = process.argv.slice(2);
if (!target || !/^https:\/\/[a-z0-9.-]+\/$/.test(target) || !out) {
  console.error('Uso: node scripts/redirect-page.mjs https://nuovo.indirizzo/ cartella [/vecchio-percorso]');
  process.exit(1);
}
const base = oldBase.replace(/\/+$/, '');
if (base && !/^\/[A-Za-z0-9._-]+$/.test(base)) {
  console.error(`Percorso vecchio non valido: ${base}`);
  process.exit(1);
}

const html = `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Morso si è spostato</title>
<meta name="robots" content="noindex" />
<link rel="canonical" href="${target}" />
<meta http-equiv="refresh" content="2; url=${target}" />
<script>
  (function () {
    var base = ${JSON.stringify(base)};
    var path = location.pathname;
    if (base && path.indexOf(base) === 0) path = path.slice(base.length);
    location.replace(${JSON.stringify(target.replace(/\/$/, ''))} + (path || '/') + location.search + location.hash);
  })();
</script>
<style>body{font-family:system-ui,sans-serif;background:#FBF7F2;color:#2B1D14;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px;text-align:center}a{color:#E0592A}</style>
</head>
<body><p>Morso ora è su <a href="${target}">${target.replace(/^https:\/\//, '').replace(/\/$/, '')}</a>…</p></body>
</html>
`;
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'index.html'), html);
writeFileSync(join(out, '404.html'), html); // ogni vecchio indirizzo, non solo la pagina principale
writeFileSync(join(out, '.nojekyll'), '');
console.log(`✔ Pagina di trasloco verso ${target} in ${out}/`);
