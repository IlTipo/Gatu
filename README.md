# Morso

Il posto dove salvare tutto il cibo che trovi online (ricette e ristoranti da TikTok, Instagram, YouTube, Pinterest e siti web) e trasformarlo in pasti e uscite vere.

**Morso è un sito web** che si usa come un'app: lo apri dal telefono e lo aggiungi alla schermata Home. Niente App Store, niente installazioni.

- Indirizzo (dopo la configurazione qui sotto): **https://iltipo.github.io/Gatu/**
- Proposta tecnica e piano a fasi: [`docs/PROPOSTA.md`](docs/PROPOSTA.md)
- Stato: **Fase 0 — Fondamenta** completata (accesso, tab, tema chiaro/scuro, database)

Tecnologia: Expo (React Native per il web) + TypeScript + Expo Router, Supabase per accesso e database, GitHub Pages per pubblicare il sito.

---

## Mettere il sito online (una volta sola, tutto dal browser)

### 1. Supabase: crea il progetto e le tabelle

1. Su [supabase.com/dashboard](https://supabase.com/dashboard) premi **New project**.
   Nome: `morso`. Regione: **Central EU (Frankfurt)**. Scegli una password per il database e salvala.
2. Quando il progetto è pronto, apri **SQL Editor → New query**.
3. Apri il file [`supabase/migrations/20261016120000_initial_schema.sql`](supabase/migrations/20261016120000_initial_schema.sql), premi l'icona **Copy raw file**, incolla nell'editor e premi **Run**. Deve comparire "Success. No rows returned".

### 2. Supabase: copia le due chiavi pubbliche

- **Project Settings → Data API** → copia il **Project URL** (tipo `https://xxxx.supabase.co`)
- **Project Settings → API Keys** → copia la **Publishable key** (inizia con `sb_publishable_`; va bene anche la vecchia chiave `anon`)

> Queste chiavi sono pubbliche: i dati sono protetti dalle regole del database. **Non** usare mai la chiave `secret`/`service_role`.

### 3. GitHub: incolla le chiavi

Nel repository su GitHub: **Settings → Secrets and variables → Actions → scheda "Variables" → New repository variable**. Creane due:

| Name | Value |
|---|---|
| `SUPABASE_URL` | il Project URL |
| `SUPABASE_KEY` | la Publishable key |

### 4. GitHub: costruisci il sito

Scheda **Actions** → a sinistra **"Pubblica il sito"** → **Run workflow** → scegli il branch `claude/morso-food-app-3op2rx` → **Run workflow**.
Dopo 2–3 minuti compare la spunta verde ✅. (Il sito si ricostruisce da solo a ogni aggiornamento del codice.)

### 5. GitHub: accendi GitHub Pages

**Settings → Pages** → in "Build and deployment":
- **Source**: *Deploy from a branch*
- **Branch**: `gh-pages`, cartella `/ (root)` → **Save**

Dopo un minuto il sito è su **https://iltipo.github.io/Gatu/**.

### 6. Supabase: autorizza l'indirizzo del sito

**Authentication → URL Configuration**:
- **Site URL**: `https://iltipo.github.io/Gatu/`
- **Redirect URLs** → Add URL: `https://iltipo.github.io/Gatu/**`

Per provare in fretta puoi spegnere la conferma email: **Authentication → Sign In / Providers → Email → "Confirm email"**. Se la lasci accesa, dopo la registrazione ti arriva un'email con un link che riporta su Morso.

### 7. Aggiungilo alla schermata Home del telefono

- **iPhone (Safari)**: apri il sito → pulsante **Condividi** → **Aggiungi alla schermata Home**
- **Android (Chrome)**: apri il sito → menu **⋮** → **Installa app** (o "Aggiungi a schermata Home")

Si apre a schermo intero con l'icona di Morso, come un'app.

---

## Cosa provare nella Fase 0

1. Apri il sito: vedi la schermata di accesso di Morso (chiara o scura, come il telefono).
2. Tocca **Accedi** con i campi vuoti: compaiono gli errori in rosso.
3. **Registrati** con email e password (almeno 8 caratteri).
4. Entri con 5 tab: **Libreria, Planner, Spesa, Mappa, Profilo** (per ora dicono "arriva presto").
5. Chiudi e riapri: sei ancora dentro.
6. **Profilo → Esci** e riaccedi. Prova anche una password sbagliata.
7. In Supabase → **Table Editor → profiles** c'è una riga per il tuo utente, creata da sola.

### Accesso con Google (facoltativo)

1. Su [console.cloud.google.com](https://console.cloud.google.com): **APIs & Services → Credentials → Create credentials → OAuth client ID**, tipo **Web application**.
2. **Authorized redirect URIs**: `https://<il-tuo-progetto>.supabase.co/auth/v1/callback`
3. Copia **Client ID** e **Client secret** in Supabase → **Authentication → Sign In / Providers → Google** e attivalo.

---

## Per chi sviluppa

```bash
npm install
cp .env.example .env      # inserisci le chiavi di Supabase
npm start                 # apre il sito in locale (http://localhost:8081)
```

| Comando | A cosa serve |
|---|---|
| `npm start` | Sito in locale, si aggiorna mentre modifichi il codice |
| `npm run build:web` | Costruisce il sito in `dist/` (come fa GitHub) |
| `npm test` | Test automatici |
| `npm run test:db` | Test di sicurezza del database (nessun utente vede i dati di un altro) |
| `npm run typecheck` / `npm run lint` | Controlli sul codice |
| `npm run start:phone` | (facoltativo) prova come app nativa con Expo Go |

Struttura:

```
src/app/          pagine (ogni file = una pagina, grazie a Expo Router)
src/components/   pezzi di interfaccia riutilizzabili
src/features/     logica per funzionalità (auth, import, ricette…)
src/lib/          Supabase, gestione errori, cache dati
src/theme/        colori, spazi, tipografia (chiaro/scuro)
src/i18n/         testi (italiano; pronto per altre lingue)
public/           pagina HTML e icone per "Aggiungi a schermata Home"
scripts/          costruzione del sito
supabase/         migrazioni SQL, test del database, Edge Functions (dalla Fase 1)
.github/workflows pubblicazione automatica su GitHub Pages
```
