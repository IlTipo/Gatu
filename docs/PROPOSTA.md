# Morso — Proposta tecnica

> ✅ Approvata il 16/10/2026.
>
> 🔄 **Cambio di rotta (16/10/2026): Morso diventa un sito web** (installabile sulla schermata Home), pubblicato gratis su GitHub Pages. Il codice resta Expo/React Native, quindi in futuro si potrà ancora farne un'app da store. Le differenze rispetto al piano originale sono nella sezione "Versione sito" in fondo.
> Piccola differenza rispetto alla bozza: con Expo SDK 58 le schermate stanno in `src/app/` invece che in `app/`.

Questo documento contiene tre cose:

1. **Schema del database** (tabelle + regole di sicurezza RLS di Supabase)
2. **Struttura delle cartelle** del progetto
3. **Piano a fasi**, una funzionalità alla volta

Più una sezione finale con **limiti da sapere subito** (cose che Expo Go non può fare, cosa permettono davvero i social).

---

## 0. Come funziona, in breve

```
 Telefono (app Expo)                       Supabase (cloud)                         Servizi esterni
 ───────────────────                       ────────────────                         ───────────────
 incolli/condividi un link ──────────────▶ Edge Function "extract"
                                             1. legge i metadati pubblici ────────▶ oEmbed TikTok/YouTube/Pinterest,
                                                (titolo, caption, miniatura)          Open Graph dei siti web
                                             2. manda il testo a Claude ─────────▶ API Claude (Sonnet)
                                             3. riceve JSON strutturato
                                             4. salva nel database
 l'app mostra ricetta/posti ◀────────────── Postgres (tabelle con RLS)

 cerchi un indirizzo ────────────────────▶ Edge Function "places" ─────────────────▶ Google Places API
```

**Perché le "Edge Function"?** Sono piccoli programmi che girano sui server di Supabase. Le chiavi segrete (Claude, Google Places) stanno lì e **mai dentro l'app**: chiunque scarichi un'app può estrarne le chiavi, quindi non devono esserci.

**Cos'è RLS?** "Row Level Security": una regola scritta nel database che dice *"ogni utente può leggere e modificare solo le proprie righe"*. Anche se qualcuno manomettesse l'app, il database stesso rifiuterebbe di mostrargli i dati altrui.

---

## 1. Schema del database

Convenzioni:
- ogni tabella ha `id` (uuid), `created_at`, e quasi tutte `updated_at`
- ogni tabella ha `user_id` che punta all'utente proprietario → così la regola RLS è identica e semplice ovunque
- `user_id` ha come valore predefinito `auth.uid()` (l'utente collegato), quindi l'app non deve nemmeno passarlo

### Tipi (enum)

| Enum | Valori |
|---|---|
| `platform` | `tiktok`, `instagram`, `youtube`, `pinterest`, `web`, `manual` |
| `import_status` | `pending`, `processing`, `done`, `needs_review`, `error` |
| `item_status` | `to_try` (Da provare), `tried` (Provato) |
| `meal_slot` | `lunch` (pranzo), `dinner` (cena) |

### Tabelle

#### `profiles` — dati dell'utente
| Colonna | Tipo | Note |
|---|---|---|
| id | uuid PK | = `auth.users.id` (creata in automatico alla registrazione con un trigger) |
| display_name | text | |
| locale | text | default `'it'` |
| created_at | timestamptz | |

#### `sources` — ogni link salvato (l'"origine")
Un link può produrre **una ricetta** oppure **più ristoranti**, quindi l'origine è separata.

| Colonna | Tipo | Note |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK → auth.users | |
| url | text | link originale (normalizzato) |
| platform | platform | riconosciuto dall'URL |
| title | text | da oEmbed/Open Graph |
| description | text | caption / descrizione |
| author_name | text | es. @creator |
| thumbnail_url | text | miniatura (copiata nel nostro storage) |
| shared_text | text | testo che l'utente ha condiviso o incollato a mano |
| status | import_status | stato dell'estrazione |
| error_message | text | messaggio leggibile in caso di errore |
| ai_result | jsonb | risposta grezza di Claude (utile per debug e per ri-elaborare) |
| created_at / updated_at | timestamptz | |

Vincolo: `unique (user_id, url)` → se salvi due volte lo stesso link, l'app te lo dice invece di duplicarlo.

#### `recipes` — ricette
| Colonna | Tipo | Note |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK | |
| source_id | uuid FK → sources (nullable, `on delete set null`) | |
| title | text not null | |
| description | text | |
| image_url | text | |
| servings | smallint | porzioni originali (per ricalcolare le dosi) |
| prep_minutes / cook_minutes / total_minutes | smallint | |
| tags | text[] | es. `{veloce, vegetariano, dolce}` — indice GIN per filtrare velocemente |
| status | item_status | default `to_try` |
| rating | smallint | 1–5, `check (rating between 1 and 5)` |
| notes | text | nota personale |
| last_cooked_at | timestamptz | |
| created_at / updated_at | timestamptz | |

#### `recipe_ingredients`
| Colonna | Tipo | Note |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK | |
| recipe_id | uuid FK → recipes (`on delete cascade`) | |
| position | smallint | ordine |
| quantity | numeric | es. 200 (nullable: "q.b.") |
| unit | text | es. `g`, `ml`, `cucchiaio` — normalizzate da un elenco |
| name | text not null | es. "farina 00" |
| note | text | es. "a temperatura ambiente" |
| aisle | text | reparto: `frutta_verdura`, `latticini`, `carne_pesce`, `dispensa`, `surgelati`, `panetteria`, `altro` |

#### `recipe_steps`
| Colonna | Tipo | Note |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK | |
| recipe_id | uuid FK (`cascade`) | |
| position | smallint | numero del passaggio |
| text | text not null | |
| timer_seconds | int | se il passaggio contiene un tempo ("cuoci 10 minuti") → timer pronto in modalità cucina |

#### `places` — ristoranti / locali
| Colonna | Tipo | Note |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK | |
| source_id | uuid FK → sources (nullable) | |
| name | text not null | |
| city | text | |
| address | text | |
| latitude / longitude | double precision | da Google Places |
| google_place_id | text | per "Apri in Google Maps" |
| verified | boolean | `true` se l'indirizzo è stato confermato con Google Places |
| cuisine | text | es. "pizza napoletana" |
| price_level | smallint | 1–4 (€ … €€€€) |
| recommended_dishes | text[] | piatti consigliati |
| image_url | text | |
| status | item_status | |
| rating | smallint 1–5 | |
| notes | text | |
| visited_at | timestamptz | |
| created_at / updated_at | timestamptz | |

#### `collections` e `collection_items` — collezioni personalizzate
`collections`: id, user_id, name, emoji, position, created_at.

`collection_items`: id, user_id, collection_id (cascade), recipe_id (nullable, cascade), place_id (nullable, cascade), added_at.
Vincolo: `check (num_nonnulls(recipe_id, place_id) = 1)` → ogni elemento è *o* una ricetta *o* un posto. Così una collezione come "Weekend a Genova" può mescolare focacce da fare e trattorie da provare.

#### `meal_plan_entries` — meal planner
| Colonna | Tipo | Note |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK | |
| date | date | giorno |
| slot | meal_slot | pranzo/cena |
| recipe_id | uuid FK → recipes (cascade) | |
| servings | smallint | porzioni per quel pasto (può differire dalla ricetta) |
| position | smallint | se ci sono più ricette nello stesso pasto |

#### `shopping_items` — lista della spesa
| Colonna | Tipo | Note |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK | |
| week_start | date | lunedì della settimana a cui si riferisce |
| name | text | nome normalizzato ("uova") |
| quantity | numeric | somma delle quantità |
| unit | text | |
| aisle | text | reparto |
| checked | boolean | spuntato mentre compri |
| is_manual | boolean | aggiunto a mano (non viene cancellato quando rigeneri) |
| recipe_ids | uuid[] | da quali ricette arriva (per mostrare "per: Carbonara, Frittata") |

La lista viene **generata** a partire dal meal planner (unendo ingredienti con stesso nome + unità compatibile, es. 200 g + 0,3 kg = 500 g) e salvata qui, così le spunte restano anche chiudendo l'app.

### Sicurezza (RLS)

Su **ogni** tabella:

```sql
alter table public.recipes enable row level security;

create policy "owner_select" on public.recipes for select using (user_id = auth.uid());
create policy "owner_insert" on public.recipes for insert with check (user_id = auth.uid());
create policy "owner_update" on public.recipes for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "owner_delete" on public.recipes for delete using (user_id = auth.uid());
```

In più:
- **Tabelle figlie** (`recipe_ingredients`, `recipe_steps`, `collection_items`, `meal_plan_entries`): oltre a `user_id = auth.uid()`, un controllo che la ricetta/collezione collegata appartenga allo stesso utente (impedisce di "agganciarsi" a righe altrui).
- **Storage immagini**: bucket `images`, file salvati in `images/{user_id}/...`; policy: ognuno può leggere/scrivere solo nella propria cartella.
- **Edge Functions**: verificano il token dell'utente e scrivono nel database *come quell'utente* (non con permessi da amministratore), quindi anche loro rispettano RLS.
- **Limite d'uso**: massimo N estrazioni AI al giorno per utente (contatore in una tabella `usage_counters`), per evitare costi a sorpresa.

---

## 2. Struttura delle cartelle

```
morso/
├── src/app/                      # Schermate (Expo Router: ogni file = una pagina)
│   ├── _layout.tsx               # layout radice: tema, i18n, sessione
│   ├── (auth)/                   # login, registrazione
│   │   ├── sign-in.tsx
│   │   └── sign-up.tsx
│   ├── index.tsx                 # smista verso Libreria o accesso
│   ├── (tabs)/                   # barra in basso
│   │   ├── _layout.tsx
│   │   ├── library.tsx           # Libreria (Ricette | Posti)
│   │   ├── planner.tsx           # Meal planner
│   │   ├── shopping.tsx          # Lista della spesa
│   │   ├── map.tsx               # Mappa
│   │   └── profile.tsx           # Profilo e impostazioni
│   ├── add.tsx                   # "Aggiungi link" (modale)
│   ├── import/[id].tsx           # stato estrazione + revisione/correzione
│   ├── recipe/[id]/index.tsx     # dettaglio ricetta
│   ├── recipe/[id]/edit.tsx
│   ├── recipe/[id]/cook.tsx      # modalità cucina
│   ├── place/[id]/index.tsx
│   ├── place/[id]/edit.tsx
│   └── collection/[id].tsx
├── src/  (oltre a src/app)
│   ├── components/               # pezzi di UI riutilizzabili (Card, Button, TagChip, EmptyState, ErrorState…)
│   ├── features/                 # logica per funzionalità
│   │   ├── import/               # salvataggio link, share intent
│   │   ├── recipes/
│   │   ├── places/
│   │   ├── collections/
│   │   ├── planner/
│   │   └── shopping/             # unione ingredienti, raggruppamento reparti
│   ├── lib/
│   │   ├── supabase.ts           # client Supabase
│   │   ├── units.ts              # conversione unità e ricalcolo dosi
│   │   └── queryClient.ts        # cache dati (TanStack Query)
│   ├── theme/                    # colori, tipografia, chiaro/scuro
│   ├── i18n/
│   │   ├── index.ts
│   │   └── locales/it.json       # tutti i testi (poi en.json, ecc.)
│   └── types/database.ts         # tipi generati dallo schema Supabase
├── supabase/
│   ├── migrations/               # SQL dello schema + RLS (versionato)
│   ├── seed.sql                  # dati di prova
│   └── functions/
│       ├── _shared/              # codice comune (cors, auth, errori)
│       ├── extract/              # metadati + Claude → JSON
│       │   ├── index.ts
│       │   ├── metadata.ts       # oEmbed / Open Graph
│       │   ├── prompt.ts         # istruzioni per Claude
│       │   ├── schema.ts         # forma del JSON atteso (validata)
│       │   └── extract.test.ts   # TEST della funzione di estrazione
│       └── places/               # proxy verso Google Places
├── assets/                       # icona, splash, font
├── app.json
├── package.json
└── README.md                     # come avviare tutto, passo per passo
```

Librerie principali (oltre a quelle che hai indicato): **TanStack Query** (carica e mette in cache i dati, gestisce caricamento/errori/riprova in modo uniforme), **Zod** (controlla che il JSON di Claude abbia la forma giusta), **i18next** (traduzioni), **expo-keep-awake** (schermo acceso in cucina), **react-native-reanimated + gesture-handler** (trascinamento nel planner), **expo-share-intent** (ricevere link dalla "Condividi").

---

## 3. Piano a fasi

Ogni fase finisce con: codice su questo branch + istruzioni "come provarla sul telefono".

| Fase | Cosa | Risultato provabile |
|---|---|---|
| **0. Fondamenta** | Progetto Expo + TypeScript + Expo Router, tema chiaro/scuro, i18n, progetto Supabase, migrazione schema + RLS, login email (+ Google; Apple preparato) | Apri l'app con Expo Go, ti registri, vedi le tab vuote con stati "nessun elemento" |
| **1. Salvataggio da link** | Schermata "Aggiungi", incolla link (con rilevamento automatico dagli appunti), Edge Function `extract` parte 1: riconoscimento piattaforma + metadati oEmbed/Open Graph + miniatura | Incolli un link TikTok/YouTube e vedi titolo e miniatura |
| **2. Estrazione AI** | Chiamata a Claude Sonnet con output JSON a schema fisso, validazione, salvataggio ricetta o più posti, schermata di revisione/correzione manuale, verifica indirizzo con Google Places, **test automatici** dell'estrazione | Incolli un link e ottieni ricetta con ingredienti e passaggi, o l'elenco dei locali |
| **3. Libreria** | Tab Ricette/Posti con card grandi, ricerca, filtri per tag, collezioni | Cerchi, filtri, crei "Cene veloci" |
| **4. Modalità cucina** | Ingredienti spuntabili, passaggi uno alla volta, timer, schermo acceso, porzioni che ricalcolano le dosi | Cucini davvero dal telefono |
| **5. Meal planner** | Settimana lun–dom × pranzo/cena, trascini le ricette | Pianifichi la settimana |
| **6. Lista della spesa** | Generata dal planner, unisce ingredienti uguali, raggruppa per reparto, spunte, voci manuali | Vai al supermercato con la lista |
| **7. Mappa** | Tutti i posti su mappa, filtri città/cucina, "Apri in Google Maps" | Vedi i tuoi posti attorno a te |
| **8. Voti e note** | Voto 1–5, nota, stato Da provare/Provato su ricette e posti | Segni la carbonara come "Provato ★★★★★" |
| **9. Share extension** | "Condividi → Morso" da TikTok/Instagram/YouTube (richiede una *development build*, vedi sotto) | Condividi direttamente dall'app del social |

Nota: la "Condividi" è nel punto 1 della tua lista, ma tecnicamente **non funziona dentro Expo Go**. Per questo propongo di fare in Fase 1 il salvataggio tramite "incolla link" (che funziona subito in Expo Go) e di attivare la share extension nella Fase 9, quando passeremo a una development build. Il codice di Fase 1 sarà già predisposto per riceverla. Se preferisci farla subito, possiamo anticipare la development build: te lo spiego quando ci arriviamo.

### Dettagli sull'estrazione AI (Fase 2)
- Modello: **Claude Sonnet** (`claude-sonnet-5-5`), chiamato con l'SDK ufficiale Anthropic dalla Edge Function.
- Uso gli **structured outputs** dell'API: Claude è obbligato a rispondere con JSON che rispetta uno schema (tipo `recipe` | `places` | `unknown`), poi lo ricontrollo con Zod.
- Se Claude non è sicuro (es. caption troppo corta), lo stato diventa `needs_review` e l'app ti chiede di completare a mano o incollare il testo della caption.
- Test: una serie di caption di esempio (ricetta italiana, ricetta con dosi in "cups", post con 5 locali a Milano, post senza info utili, link non valido) con risposte di Claude simulate, così i test girano gratis e sempre uguali; più un test "dal vivo" opzionale da lanciare a mano.

---

## 4. Limiti da sapere subito (in parole semplici)

1. **Expo Go ha dei limiti.** Expo Go è un'app "contenitore" già pronta: puoi provare quasi tutto, ma non funzionalità che richiedono codice nativo personalizzato. Nel nostro caso:
   - **Share extension** (Condividi → Morso): serve una *development build* (una versione dell'app costruita apposta, gratis con EAS di Expo). Te la preparo nella Fase 9 con istruzioni passo passo.
   - **Login con Google**: in Expo Go funziona tramite pagina web di accesso (va bene). Il pulsante nativo arriva con la development build.
   - **Login con Apple**: richiede un account Apple Developer (99 $/anno) ed è obbligatorio per App Store se offri il login con Google. Lo preparo nel codice ma va attivato quando avrai l'account.
2. **Instagram è il più chiuso.** TikTok, YouTube e Pinterest offrono oEmbed pubblico (titolo, autore, miniatura, spesso la caption). Instagram richiede un'app Meta registrata per l'oEmbed e spesso **non restituisce la caption**. Soluzione rispettosa dei termini: se non riusciamo a leggere il testo, l'app ti chiede di incollare la caption (bastano 2 tocchi: "Copia" su Instagram, "Incolla" su Morso). Niente scraping.
3. **Costi.** Supabase e Expo hanno piani gratuiti sufficienti per iniziare. Claude e Google Places si pagano a consumo: con Sonnet un'estrazione costa indicativamente meno di un centesimo; Google Places ha un credito mensile gratuito. Metto un limite giornaliero di estrazioni per utente.
4. **Account che ti serviranno** (te li farò creare quando servono, non ora): Supabase, Anthropic (chiave API), Google Cloud (Places + login Google), Expo.

---

## 5. Versione sito: cosa cambia

| Funzione | Prima (app) | Ora (sito) |
|---|---|---|
| Provarla | Expo Go + computer | Apri **https://iltipo.github.io/Gatu/** e "Aggiungi a schermata Home" |
| Aggiornamenti | Rilanciare dal computer | Automatici: GitHub ricostruisce il sito a ogni modifica |
| Salvare un link (Fase 1) | Incolla link | Uguale: incolla link + pulsante "Incolla dagli appunti" |
| "Condividi → Morso" (Fase 9) | Share extension nativa | **Android**: il sito installato compare nel menu Condividi (Web Share Target). **iPhone**: non possibile per i siti; in alternativa un Comando rapido (app Comandi) "Salva in Morso" che apre il sito con il link |
| Schermo acceso in cucina (Fase 4) | expo-keep-awake | Wake Lock del browser (Safari e Chrome recenti) |
| Mappa (Fase 7) | react-native-maps | **Leaflet + OpenStreetMap** (gratis, nessuna chiave); "Apri in Google Maps" resta |
| Login Apple | Pulsante nativo iPhone | Rimandato: anche sul web richiede l'account Apple Developer |
| Login Google | Browser interno | Pagina Google classica, poi si torna su Morso |

Restano identici: database, sicurezza, estrazione con Claude, libreria, planner, lista della spesa, voti e note.

---

## 6. Cosa mi serve da te (risposto)

Rispondi con **"ok"** (o con le modifiche che vuoi) su:
1. Schema del database
2. Struttura delle cartelle
3. Piano a fasi, in particolare: **va bene spostare la share extension alla Fase 9** (con "incolla link" subito in Fase 1)?

Domande opzionali:
- Il nome del pacchetto/bundle: va bene `app.morso` (modificabile prima della pubblicazione)?
- Hai già un progetto Supabase o lo creiamo insieme?
