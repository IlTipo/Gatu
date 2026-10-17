// Dopo la pubblicazione del sito: se la versione in app.json è nuova, la scrive nel database
// e chi ha attivato le notifiche "Novità di Morso" riceve "🎉 È disponibile Morso X".
// Gli aggiornamenti semplici (stessa versione) non fanno niente.
//   SUPABASE_ACCESS_TOKEN, PROJECT_REF
import { readFileSync } from 'node:fs';

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.PROJECT_REF;
if (!token || !/^[a-z0-9]+$/.test(ref ?? '')) {
  console.log('ℹ Annuncio della versione saltato (manca Supabase)');
  process.exit(0);
}

const version = JSON.parse(readFileSync('app.json', 'utf8')).expo.version;
const entry = JSON.parse(readFileSync('src/changelog.json', 'utf8')).find((c) => c.version === version);
if (!/^\d+\.\d+\.\d+$/.test(version) || !entry) throw new Error(`Versione ${version} non trovata in src/changelog.json`);

// i testi passano come JSON dentro un blocco $tag$ che non può comparire nel testo
const payload = JSON.stringify({ version, notes: entry.notes.filter((n) => typeof n === 'string').slice(0, 10) });
const tag = `rel${Date.now()}`;
if (payload.includes(`$${tag}$`)) throw new Error('testo inatteso');
// la prima volta segna solo la versione attuale (già nota a tutti) senza mandare notifiche
const query = `insert into public.app_releases (version, notes, created_at)
  select j ->> 'version', array(select jsonb_array_elements_text(j -> 'notes')),
         case when exists (select 1 from public.app_releases) then now() else now() - interval '2 days' end
  from (select $${tag}$${payload}$${tag}$::jsonb as j) x
  on conflict (version) do nothing
  returning version`;

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST',
  headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  body: JSON.stringify({ query }),
});
if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
const rows = await res.json();
console.log(rows.length ? `✔ Versione ${version} annunciata con le notifiche` : `ℹ Versione ${version} già annunciata`);
