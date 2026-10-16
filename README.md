# Morso

Il posto dove salvare tutto il cibo che trovi online (ricette e ristoranti da TikTok, Instagram, YouTube, Pinterest e siti web) e trasformarlo in pasti e uscite vere.

**Morso è un sito web** che si usa come un'app: lo apri dal telefono e lo aggiungi alla schermata Home. Niente App Store, niente installazioni.

- Indirizzo (dopo la configurazione qui sotto): **https://iltipo.github.io/Gatu/**
- Proposta tecnica e piano a fasi: [`docs/PROPOSTA.md`](docs/PROPOSTA.md)
- Stato: **Fase 2 — Estrazione AI** completata (Fase 0: accesso · Fase 1: salvataggio da link)

Tecnologia: Expo (React Native per il web) + TypeScript + Expo Router, Supabase per accesso e database, Google Gemini (piano gratuito) per leggere i post, GitHub Pages per pubblicare il sito. **Costo: zero.**

---

## Mettere il sito online (una volta sola, 3 passi dal browser)

Quasi tutto è automatico: a ogni aggiornamento GitHub crea/aggiorna il progetto Supabase (tabelle, accesso, funzioni) e pubblica il sito. Servono solo questi passi:

### 1. Crea un account Supabase

Vai su [supabase.com/dashboard](https://supabase.com/dashboard) e registrati (il modo più rapido: **Continue with GitHub**). Non serve creare nessun progetto: lo fa Morso da solo.

### 2. Crea un "token di accesso" e dallo a GitHub

1. Su Supabase apri **[Account → Access Tokens](https://supabase.com/dashboard/account/tokens)** → **Generate new token** → nome `github-morso` → **copia** il token (inizia con `sbp_`).
2. Su GitHub apri **[Settings → Secrets and variables → Actions](https://github.com/IlTipo/Gatu/settings/secrets/actions)** → **New repository secret**:
   - **Name**: `SUPABASE_ACCESS_TOKEN`
   - **Secret**: incolla il token → **Add secret**

> Il token è **segreto**: incollalo solo lì, non mandarlo in chat a nessuno (nemmeno a me).

### 3. Avvia la pubblicazione

Apri **[Actions → Pubblica il sito](https://github.com/IlTipo/Gatu/actions/workflows/deploy-web.yml)** → **Run workflow** → branch `claude/morso-food-app-3op2rx` → **Run workflow**.

La prima volta ci mette circa **5 minuti** (Supabase deve creare il progetto). Quando compare la spunta verde ✅, apri **https://iltipo.github.io/Gatu/** e registrati.

Cosa fa da solo, in ordine: crea il progetto `morso` su Supabase (regione Francoforte) · crea le tabelle con le regole di sicurezza · imposta l'indirizzo del sito e l'accesso senza email di conferma · pubblica la funzione che legge i link · costruisce e pubblica il sito.

### 3b. Attiva l'AI gratuita (Gemini)

Le pagine dei **siti di ricette** funzionano già senza AI: Morso legge la scheda ricetta che il sito pubblica per Google. Per i **post social** (TikTok, Instagram, YouTube…) serve l'AI: usiamo **Gemini di Google, con il piano gratuito** (niente carta di credito).

1. Vai su **[aistudio.google.com/apikey](https://aistudio.google.com/apikey)** e accedi con un account Google.
2. Premi **Create API key** (se chiede un progetto, lascia quello proposto) → **copia** la chiave.
3. Su GitHub: **[Settings → Secrets and variables → Actions](https://github.com/IlTipo/Gatu/settings/secrets/actions)** → **New repository secret**
   - **Name**: `GEMINI_API_KEY`
   - **Secret**: la chiave → **Add secret**
4. Rilancia **[Actions → Pubblica il sito → Run workflow](https://github.com/IlTipo/Gatu/actions/workflows/deploy-web.yml)**: la chiave viene passata alle funzioni di Supabase (non finisce mai nel sito).

> **Da sapere sul piano gratuito**: ha un limite di richieste al minuto e al giorno (abbondante per uso personale; se lo superi Morso salva il link e ti chiede di riprovare più tardi), e Google può usare i testi inviati per migliorare i suoi modelli (inviamo solo i dati pubblici del post e l'eventuale testo che incolli).
> Per sicurezza ogni utente può fare al massimo **40 analisi AI al giorno** (secret Supabase `DAILY_EXTRACTION_LIMIT`). Il modello usato è `gemini-flash-latest`; si può cambiare con il secret Supabase `GEMINI_MODEL`.
> Facoltativo: con un secret `GOOGLE_PLACES_API_KEY` gli indirizzi dei locali vengono verificati con Google Places invece che con OpenStreetMap (gratis).

### 4. Aggiungilo alla schermata Home del telefono

- **iPhone (Safari)**: apri il sito → pulsante **Condividi** → **Aggiungi alla schermata Home**
- **Android (Chrome)**: apri il sito → menu **⋮** → **Installa app**

<details>
<summary>Configurazione manuale (solo se preferisci non usare il token)</summary>

1. Crea un progetto su Supabase e incolla in **SQL Editor** il file [`supabase/migrations/20261016120000_initial_schema.sql`](supabase/migrations/20261016120000_initial_schema.sql) → **Run**.
2. In GitHub → **Settings → Secrets and variables → Actions → Variables** crea `SUPABASE_URL` (Project URL) e `SUPABASE_KEY` (Publishable key).
3. In Supabase → **Authentication → URL Configuration** imposta Site URL `https://iltipo.github.io/Gatu/` e aggiungi il Redirect URL `https://iltipo.github.io/Gatu/**`.
4. La funzione "extract" va pubblicata con la Supabase CLI: `npx supabase functions deploy extract --project-ref <ref> --use-api --no-verify-jwt`.
</details>

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

## Cosa provare nella Fase 2 — Estrazione con l'AI

1. **Libreria → Aggiungi** → incolla il link di una ricetta da un sito (es. GialloZafferano): la ricetta si apre **subito**, letta dalla scheda del sito, senza AI.
2. Ora un video-ricetta (TikTok/YouTube) → **Salva**. Dopo 10–30 secondi si apre la **ricetta**: porzioni, tempi, etichette, ingredienti e passaggi (con il timer dove la ricetta indica un tempo).
3. **Dosi e persone**: se il post non indica le dosi, l'AI le stima (le vedi con **~**). Sulle ricette già salvate c'è il pulsante **Stima le dosi mancanti**. Scegli **da 1 a 6 persone** e le dosi si ricalcolano.
4. Tocca **Modifica**: correggi il titolo, le porzioni, aggiungi o togli ingredienti e passaggi, scegli le etichette → **Salva**.
5. Prova un post che elenca **più locali** (es. "i 5 posti dove mangiare a Napoli"): Morso li estrae tutti, ognuno con città, cucina e piatti consigliati; dove riesce verifica l'indirizzo.
6. Tocca un locale → **Apri in Google Maps**; **Modifica** per correggere nome, indirizzo, prezzo o piatti.
7. Prova un post **Instagram**: se la caption non è leggibile, Morso te lo dice. Copiala dall'app di Instagram, incollala nel riquadro e premi **Analizza con l'AI**.
8. Prova un link che non c'entra col cibo: Morso risponde "Non ho trovato ricette o locali".
9. I link salvati nella Fase 1 hanno il pulsante **Analizza con l'AI**.
10. **Calorie, difficoltà e costo**: apri una ricetta → riquadro **Per porzione** → **Calcola**. Vedi kcal, proteine, carboidrati, grassi, difficoltà e costo (€–€€€). Sono stime indicative.
11. **Varianti**: in fondo alla ricetta scegli *Vegana*, *Senza glutine*, *Light*, *Più veloce*… L'AI ti mostra la nuova versione e cosa cambia; l'originale resta com'è. Se ti piace → **Salva come nuova ricetta**.
12. **Foto di una ricetta**: **Aggiungi** → **📷 Carica la foto di una ricetta** (pagina di un libro, quaderno, screenshot). L'AI la legge e crea la ricetta.
13. **Locali**: apri un locale → **Quanto dista da me?** (il browser chiede il permesso della posizione), **🤍 Voglio andarci** per la lista desideri, **Cerca telefono, sito e orari** se mancano.
14. **Libreria → 📍 Cosa c'è vicino a me?**: i posti salvati entro 2/5/10/25 km, prima quelli "Voglio andarci".

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
| `npm run test:functions` | Test delle funzioni del server (lettura dei link, schede ricetta, estrazione AI con risposte simulate, sicurezza) |
| `npm run test:ai-live` | Test con Gemini vero su caption di esempio (serve `GEMINI_API_KEY`) |
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
