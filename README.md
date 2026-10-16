# Morso

Il posto dove salvare tutto il cibo che trovi online (ricette e ristoranti da TikTok, Instagram, YouTube, Pinterest e siti web) e trasformarlo in pasti e uscite vere.

App mobile per iOS e Android fatta con **Expo (React Native) + TypeScript + Expo Router** e **Supabase**.

- Proposta tecnica (schema del database, cartelle, fasi): [`docs/PROPOSTA.md`](docs/PROPOSTA.md)
- Stato: **Fase 0 — Fondamenta** completata (login, tab, tema chiaro/scuro, database)

---

## Avviare l'app sul tuo telefono (passo passo)

### 1. Cosa ti serve

- Un computer con **Node.js 20 o più recente** ([nodejs.org](https://nodejs.org), scarica la versione "LTS")
- L'app **Expo Go** sul telefono (App Store o Google Play)
- Un account gratuito su **[supabase.com](https://supabase.com)**

### 2. Scarica il progetto e installa le dipendenze

```bash
git clone https://github.com/IlTipo/Gatu.git morso
cd morso
git checkout claude/morso-food-app-3op2rx
npm install
```

### 3. Crea il progetto Supabase

1. Su [supabase.com/dashboard](https://supabase.com/dashboard) premi **New project**.
   Nome: `morso`. Regione: **Central EU (Frankfurt)** (la più vicina all'Italia). Scegli una password per il database e salvala.
2. Aspetta un paio di minuti che il progetto sia pronto.

### 4. Crea le tabelle (una volta sola)

1. Nel menu a sinistra apri **SQL Editor** → **New query**.
2. Apri il file [`supabase/migrations/20261016120000_initial_schema.sql`](supabase/migrations/20261016120000_initial_schema.sql), copia **tutto** il contenuto e incollalo.
3. Premi **Run**. Deve comparire "Success. No rows returned".

Controllo: in **Table Editor** vedrai le tabelle `recipes`, `places`, `collections`… tutte con l'etichetta "RLS enabled".

### 5. Collega l'app a Supabase

1. In Supabase vai su **Project Settings → Data API** e copia il **Project URL**.
2. Vai su **Project Settings → API Keys** e copia la **Publishable key** (inizia con `sb_publishable_`). Se vedi solo la vecchia chiave `anon`, va bene anche quella.
3. Nella cartella del progetto copia `.env.example` in un nuovo file `.env` e incolla i due valori:

```
EXPO_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
EXPO_PUBLIC_SUPABASE_KEY=sb_publishable_xxxxxxxx
```

> Non mettere mai nel file `.env` la chiave `service_role`/`secret`: è segreta e darebbe accesso a tutti i dati.

### 6. Impostazioni di accesso in Supabase

In **Authentication → URL Configuration**:

- **Site URL**: `morso://`
- **Redirect URLs**: aggiungi `exp://**` (serve a Expo Go) e `morso://**`

Per provare in fretta, puoi disattivare la conferma email: **Authentication → Sign In / Providers → Email → "Confirm email" spento**. Se la lasci attiva, dopo la registrazione riceverai un'email: **aprila dal telefono** su cui gira Expo Go.

### 7. Avvia

```bash
npx expo start
```

Compare un **codice QR** nel terminale:

- **iPhone**: inquadralo con la fotocamera e tocca il banner "Apri in Expo Go"
- **Android**: apri Expo Go e tocca "Scan QR code"

Telefono e computer devono essere sulla **stessa rete Wi-Fi**. Se non funziona (es. rete aziendale), usa `npm run start:tunnel`.

Se cambi il file `.env`, riavvia con `npx expo start --clear`.

---

## Cosa provare nella Fase 0

1. All'apertura vedi la schermata di accesso di Morso (in chiaro o in scuro, come il telefono).
2. Tocca **Accedi** con i campi vuoti: compaiono gli errori in rosso sotto i campi.
3. **Registrati** con email e password (almeno 8 caratteri).
4. Entri nell'app con 5 tab: **Libreria, Planner, Spesa, Mappa, Profilo** (per ora mostrano "arriva presto").
5. Chiudi del tutto Expo Go e riaprilo: sei ancora dentro (la sessione resta salvata).
6. **Profilo → Esci**: torni alla schermata di accesso. Riaccedi con le stesse credenziali.
7. Prova una password sbagliata: messaggio "Email o password non corrette".
8. Attiva la modalità aereo e prova ad accedere: messaggio di connessione assente.
9. Cambia tema chiaro/scuro del telefono: l'app si adegua.
10. In Supabase → **Table Editor → profiles** trovi una riga per il tuo utente, creata da sola.

### Accesso con Google (facoltativo, si può fare anche dopo)

1. Su [console.cloud.google.com](https://console.cloud.google.com) crea un progetto, poi **APIs & Services → Credentials → Create credentials → OAuth client ID**, tipo **Web application**.
2. In **Authorized redirect URIs** aggiungi `https://<il-tuo-progetto>.supabase.co/auth/v1/callback`.
3. Copia **Client ID** e **Client secret** in Supabase → **Authentication → Sign In / Providers → Google** e attivalo.

In Expo Go il login Google si apre in una pagina web interna e poi torna nell'app.

### Accesso con Apple

Il codice è pronto (pulsante visibile solo su iPhone), ma per attivarlo serve un account **Apple Developer** (99 $/anno). Lo configureremo quando pubblicheremo l'app.

---

## Comandi utili

| Comando | A cosa serve |
|---|---|
| `npx expo start` | Avvia l'app per Expo Go |
| `npm test` | Test automatici dell'app |
| `npm run test:db` | Test di sicurezza del database (nessun utente vede i dati di un altro) |
| `npm run typecheck` | Controlla gli errori di TypeScript |
| `npm run lint` | Controlla lo stile del codice |

## Struttura

```
src/app/          schermate (ogni file = una pagina, grazie a Expo Router)
src/components/   pezzi di interfaccia riutilizzabili
src/features/     logica per funzionalità (auth, import, ricette…)
src/lib/          Supabase, gestione errori, cache dati
src/theme/        colori, spazi, tipografia (chiaro/scuro)
src/i18n/         testi dell'app (italiano; pronto per altre lingue)
supabase/         migrazioni SQL, test del database, Edge Functions (dalla Fase 1)
```
