// Informativa privacy e Termini d'uso di Morso (in italiano semplice).
// Quando cambiano in modo importante: aggiorna TERMS_VERSION (data) e tutti li riaccetteranno.

export const TERMS_VERSION = '2026-10-22';
export const MIN_AGE = 14;
/** Email pubblica per privacy e termini (vuota: si scrive dal modulo nel Profilo). */
export const CONTACT_EMAIL = '';
const OWNER = 'Endris, sviluppatore di Morso';

export type LegalDoc = 'privacy' | 'terms';
type Section = { title: string; body: string[] };

const contact = CONTACT_EMAIL
  ? `scrivi a ${CONTACT_EMAIL} oppure usa "Cosa aggiungeresti?" nel Profilo`
  : 'usa il modulo "Cosa aggiungeresti?" nel Profilo (arriva direttamente al titolare)';

const privacy: Section[] = [
  {
    title: 'Chi tratta i tuoi dati',
    body: [
      `Titolare del trattamento: ${OWNER}. Per qualsiasi domanda o richiesta sulla privacy ${contact}.`,
      'Questa informativa spiega quali dati usa Morso, perché, con chi li condivide e quali diritti hai (Regolamento UE 2016/679, "GDPR").',
    ],
  },
  {
    title: 'Quali dati usiamo',
    body: [
      'Account: email e password (la password è salvata solo in forma cifrata, nessuno può leggerla). Se accedi con Google: email e nome del tuo account Google.',
      'Profilo: nome, @username, foto profilo, bio, codice amico, scelte su cosa condividere, grammi per porzione e obiettivi del diario.',
      'Quello che salvi: link, ricette, locali, raccolte, planner, lista della spesa, voti, ricette cucinate, foto che carichi. I video caricati servono solo per la lettura con l\'AI e vengono cancellati subito dopo.',
      'Diario calorie: cosa mangi e le calorie stimate. Può dire qualcosa sulla tua salute, per questo resta privato finché non scegli tu di condividerlo con gli amici (con conferma esplicita).',
      'Piano alimentare: se lo carichi (foto, PDF o testo), lo leggiamo con l\'AI per mostrartelo giorno per giorno. Come il diario può dire qualcosa sulla tua salute: resta solo tuo e non si condivide con nessuno. Puoi eliminarlo quando vuoi.',
      'Parte social: chi segui e chi ti segue, amici, mi piace, commenti, notifiche, persone bloccate, segnalazioni.',
      'Posizione: solo quando usi "Vicino a me" o "Scopri in zona", e solo dopo il permesso del telefono. Non la salviamo: serve per calcolare le distanze e cercare i locali vicini.',
      'Consigli che ci mandi da "Cosa aggiungeresti?" e i dati tecnici necessari a far funzionare il servizio (per esempio l\'indirizzo IP nei registri dei fornitori, per sicurezza).',
    ],
  },
  {
    title: 'Perché li usiamo (e su quale base)',
    body: [
      'Per darti il servizio che chiedi: salvare, leggere e organizzare ricette e locali, il planner, la spesa, il diario e la parte social (esecuzione del contratto, art. 6.1.b GDPR).',
      'Per leggere e mostrarti il piano alimentare che carichi tu: con il tuo consenso esplicito, dato caricandolo (art. 9.2.a GDPR). Lo togli eliminandolo.',
      'Per mostrare il tuo diario agli amici: solo con il tuo consenso esplicito, che puoi togliere quando vuoi spegnendo l\'interruttore (art. 9.2.a GDPR).',
      'Per tenere Morso sicuro: limiti anti-spam, blocchi, segnalazioni, prevenzione degli abusi (legittimo interesse, art. 6.1.f GDPR).',
      'Non vendiamo i tuoi dati, non facciamo pubblicità e non usiamo strumenti di tracciamento o profilazione.',
    ],
  },
  {
    title: 'Chi altro li riceve',
    body: [
      'Solo i fornitori che fanno funzionare Morso, ciascuno per la sua parte e con contratti che proteggono i dati:',
      '• Supabase (database, accesso e file): server nell\'Unione Europea (Francoforte).',
      '• Google (AI Gemini): riceve il testo del link, la foto o il video da leggere, il piano alimentare da leggere, la domanda o il pasto da stimare. Se è configurato, Google Maps aiuta a trovare l\'indirizzo dei locali.',
      '• Cloudflare: ospita il sito di Morso.',
      '• Resend: manda al titolare le email dei consigli e delle segnalazioni.',
      '• OpenStreetMap (Nominatim e Overpass): riceve il nome o la zona da cercare per trovare i locali sulla mappa.',
      '• Quando salvi un link, il server apre la pagina pubblica (Instagram, TikTok, YouTube, siti di ricette…) per leggerne il contenuto.',
      'Alcuni fornitori hanno sede fuori dall\'UE (per esempio negli Stati Uniti): i trasferimenti sono protetti dalle Clausole Contrattuali Standard della Commissione Europea o dal Data Privacy Framework UE-USA.',
      'Gli altri utenti vedono solo quello che scegli di mostrare: @username, nome, foto e bio; le ricette che condividi; e, solo agli amici, ciò che attivi tu (ricette cucinate, planner, diario).',
    ],
  },
  {
    title: 'Per quanto tempo',
    body: [
      'Finché hai l\'account. Quando lo elimini cancelliamo subito tutti i tuoi dati, le foto e i video; possono restare per poco tempo nelle copie di sicurezza dei fornitori, che si cancellano da sole.',
      'I video caricati si cancellano appena letti. Il registro anti-spam si cancella dopo 2 giorni.',
    ],
  },
  {
    title: 'I tuoi diritti',
    body: [
      'Puoi vedere, correggere e cancellare i tuoi dati in ogni momento dall\'app.',
      'Profilo → Privacy e dati → "Scarica i miei dati": ricevi una copia di tutti i tuoi dati (portabilità).',
      'Profilo → Privacy e dati → "Elimina account": cancella tutto, per sempre.',
      `Puoi anche opporti, chiedere la limitazione o revocare un consenso: ${contact}. Rispondiamo entro 30 giorni.`,
      'Se pensi che i tuoi dati siano trattati male, puoi fare reclamo al Garante per la protezione dei dati personali (www.garanteprivacy.it).',
    ],
  },
  {
    title: 'Età minima',
    body: [`Morso è per persone con almeno ${MIN_AGE} anni. Se hai meno di ${MIN_AGE} anni non puoi creare un account.`],
  },
  {
    title: 'Memoria del telefono (niente cookie di tracciamento)',
    body: [
      'Morso salva sul tuo dispositivo solo ciò che serve a funzionare: l\'accesso, le preferenze (tema, ordine dei reparti), le copie per usare l\'app senza internet e i timer di cucina. Non ci sono cookie pubblicitari o di statistica, per questo non serve il banner dei cookie.',
      'Quando esci dall\'account, le copie dei tuoi dati sul dispositivo vengono cancellate.',
    ],
  },
  {
    title: 'Sicurezza',
    body: [
      'Connessione sempre cifrata (HTTPS); ogni utente può leggere solo i propri dati, e gli altri vedono solo quello che condividi; controlli automatici a ogni modifica.',
      'In caso di problemi di sicurezza che riguardano i tuoi dati ti avviseremo come richiesto dalla legge.',
    ],
  },
  {
    title: 'Modifiche',
    body: [`Ultimo aggiornamento: ${TERMS_VERSION}. Se cambiamo qualcosa di importante te lo chiederemo di nuovo all'apertura dell'app.`],
  },
];

const terms: Section[] = [
  {
    title: 'Cos\'è Morso',
    body: [
      `Morso è un'app gratuita, creata da ${OWNER}, per salvare ricette e locali dai social, organizzare pasti e spesa e condividere ricette con amici e follower.`,
      'Usando Morso accetti questi Termini e l\'Informativa privacy.',
    ],
  },
  {
    title: 'Il tuo account',
    body: [
      `Devi avere almeno ${MIN_AGE} anni. L'account è personale: non condividere la password e scegli uno @username che non offenda e non finga di essere qualcun altro.`,
      'Puoi eliminare l\'account quando vuoi dal Profilo.',
    ],
  },
  {
    title: 'Regole della community',
    body: [
      'Sono vietati: offese, molestie, minacce, discriminazioni, contenuti violenti, sessuali o illegali, spam, truffe, fingersi un\'altra persona, pubblicare dati personali di altri.',
      'Puoi bloccare chi ti dà fastidio e segnalare i commenti. Possiamo rimuovere contenuti e sospendere o chiudere gli account che violano queste regole.',
    ],
  },
  {
    title: 'Diritti d\'autore',
    body: [
      'I contenuti dei social e dei siti che salvi (video, foto, testi) appartengono ai loro autori. Morso li legge per creare la tua scheda ricetta per uso personale.',
      'Quando condividi una ricetta salvata da altri, Morso mostra il nome e il link dell\'autore originale e non mostra la sua copertina. Condividi come "creata da me" solo le ricette che hai davvero inventato tu.',
      'Le foto che carichi devono essere tue o devi avere il permesso di usarle. Mantieni la proprietà dei tuoi contenuti; ci dai solo il permesso di salvarli e mostrarli alle persone che scegli tu, per far funzionare l\'app.',
      `Se pensi che un contenuto violi i tuoi diritti, ${contact}: lo valuteremo e, se serve, lo rimuoveremo.`,
    ],
  },
  {
    title: 'AI, calorie e salute',
    body: [
      'Ricette, dosi, valori nutrizionali, calorie e indirizzi vengono letti o stimati da un\'intelligenza artificiale e possono contenere errori. Controlla sempre ingredienti e allergeni.',
      'Il diario calorie e gli obiettivi sono solo un aiuto: non sono consigli medici né nutrizionali. Per diete, allergie o problemi di salute chiedi a un medico o a un professionista.',
    ],
  },
  {
    title: 'Limiti del servizio',
    body: [
      'Morso è offerto gratuitamente "così com\'è": può avere interruzioni, limiti giornalieri di utilizzo dell\'AI e cambiare nel tempo.',
      'Nei limiti permessi dalla legge non rispondiamo di danni indiretti dovuti all\'uso dell\'app o ai contenuti pubblicati dagli utenti. Restano sempre i tuoi diritti di consumatore.',
    ],
  },
  {
    title: 'Modifiche e legge applicabile',
    body: [
      `Ultimo aggiornamento: ${TERMS_VERSION}. Se cambiano in modo importante te li chiederemo di nuovo.`,
      'Si applica la legge italiana. Per i consumatori è competente il tribunale del luogo in cui vivono.',
      `Contatti: ${contact}.`,
    ],
  },
];

export const LEGAL: Record<LegalDoc, { title: string; sections: Section[] }> = {
  privacy: { title: 'Informativa privacy', sections: privacy },
  terms: { title: 'Termini d\'uso', sections: terms },
};
