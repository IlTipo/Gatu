# Morso

Il posto dove salvare tutto il cibo che trovi online (ricette e ristoranti da TikTok, Instagram, YouTube, Pinterest e siti web) e trasformarlo in pasti e uscite vere.

**Morso è un sito web** che si usa come un'app: lo apri dal telefono e lo aggiungi alla schermata Home. Niente App Store, niente installazioni.

- Indirizzo (dopo la configurazione qui sotto): **https://iltipo.github.io/Gatu/**
- Proposta tecnica e piano a fasi: [`docs/PROPOSTA.md`](docs/PROPOSTA.md)
- Stato: **Fase 1 — Salvataggio da link** completata (Fase 0: accesso, tab, tema, database)

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

### 3b. GitHub: permesso di pubblicare le funzioni del server

Morso usa una piccola funzione su Supabase ("extract") che legge titolo, caption e miniatura dei link. GitHub la pubblica da solo, ma serve un permesso:

1. Su Supabase vai su **[Account → Access Tokens](https://supabase.com/dashboard/account/tokens)** → **Generate new token**, nome `github-morso` → copia il token (inizia con `sbp_`).
2. Su GitHub: **Settings → Secrets and variables → Actions → scheda "Secrets" → New repository secret**
   - Name: `SUPABASE_ACCESS_TOKEN`
   - Secret: il token appena copiato

> Questo token è **segreto** (per questo va in "Secrets" e non in "Variables"): non condividerlo con nessuno.

### 4. GitHub: costruisci il sito

Scheda **Actions** → a sinistra **"Pubblica il sito"** → **Run workflow** → scegli il branch `claude/morso-food-app-3op2rx` → **Run workflow**.
Dopo 2–3 minuti compare la spunta verde ✅: il sito è costruito e la funzione "extract" è pubblicata su Supabase (la trovi in Supabase → **Edge Functions**). Il sito si ricostruisce da solo a ogni aggiornamento del codice.

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

## Cosa provare nella Fase 0 — Accesso

1. Apri il sito: vedi la schermata di accesso di Morso (chiara o scura, come il telefono).
2. Tocca **Accedi** con i campi vuoti: compaiono gli errori in rosso.
3. **Registrati** con email e password (almeno 8 caratteri).
4. Entri con 5 tab: **Libreria, Planner, Spesa, Mappa, Profilo** (per ora dicono "arriva presto").
5. Chiudi e riapri: sei ancora dentro.
6. **Profilo → Esci** e riaccedi. Prova anche una password sbagliata.
7. In Supabase → **Table Editor → profiles** c'è una riga per il tuo utente, creata da sola.

## Cosa provare nella Fase 1 — Salvare un link

1. Apri Morso → **Libreria** → **Aggiungi**.
2. Copia il link di un video TikTok o YouTube (dall'app: Condividi → Copia link), torna su Morso e premi **Incolla** (il browser può chiederti il permesso di leggere gli appunti) → **Salva**.
3. Si apre la scheda del link con **foto, titolo/caption e autore**. Lo stato è "In attesa di analisi": l'estrazione della ricetta arriva nella Fase 2.
4. Torna alla **Libreria**: c'è la card con la foto grande.
5. Prova anche: una pagina di un sito di ricette (es. GialloZafferano), un post Instagram, un pin di Pinterest.
   - Su **Instagram** spesso la caption non è leggibile: copiala a mano nel campo **"Testo del post"**.
6. Salva di nuovo lo stesso link: Morso ti dice che **è già nella libreria** (niente doppioni, anche se il link ha parametri diversi).
7. Scrivi qualcosa che non è un link (es. "ciao") → messaggio d'errore chiaro.
8. Nella scheda: **Apri l'originale** (apre il social in una nuova scheda) ed **Elimina** (chiede conferma).

### Salvare direttamente dalla "Condividi" del telefono

- **Android**: dopo aver installato il sito (Chrome → ⋮ → **Installa app**), nel menu **Condividi** di TikTok, Instagram, YouTube o Chrome compare **Morso**. Toccalo: si apre "Aggiungi" con il link già inserito, premi **Salva**.
- **iPhone**: i siti non possono comparire nel menu Condividi, ma puoi creare un **Comando rapido** (una volta sola):
  1. Apri l'app **Comandi** → **+** (nuovo comando) → in alto rinominalo **Salva in Morso**.
  2. Tocca **ⓘ** (o il nome) → attiva **Mostra nel foglio di condivisione**; come tipi lascia **URL** e **Testo**.
  3. Aggiungi l'azione **Codifica URL** (lavora sull'"Input comando").
  4. Aggiungi l'azione **Testo** e scrivi `https://iltipo.github.io/Gatu/add?text=` seguito dalla variabile **URL codificato** (toccala tra i suggerimenti).
  5. Aggiungi l'azione **Apri URL**.
  
  Ora da TikTok/Instagram: **Condividi → Salva in Morso**. Si apre Safari su Morso con il link pronto (la prima volta accedi anche in Safari).

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
| `npm run test:functions` | Test delle funzioni del server (lettura dei link, sicurezza) |
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
