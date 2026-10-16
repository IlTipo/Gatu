// Tutto quello che riguarda i link: trovarli nel testo condiviso, ripulirli,
// capire da quale piattaforma arrivano e controllare che siano sicuri da aprire.
// Niente dipendenze: funziona sia in Deno (Edge Functions) sia nei test.

export type Platform = 'tiktok' | 'instagram' | 'youtube' | 'pinterest' | 'web';

/** Trova il primo link http(s) dentro un testo (es. "Guarda questa ricetta! https://vm.tiktok.com/abc/"). */
export function extractUrl(text: string | null | undefined): string | null {
  if (!text) return null;
  const match = text.match(/https?:\/\/[^\s<>"'`]+/i);
  if (!match) return null;
  // toglie la punteggiatura finale che spesso si attacca al link ("…/abc)." → "…/abc")
  return match[0].replace(/[)\].,;:!?»”’]+$/u, '');
}

const TRACKING_PARAMS = [
  /^utm_/i,
  /^fbclid$/i,
  /^gclid$/i,
  /^igsh(id)?$/i,
  /^si$/i, // YouTube/Spotify
  /^feature$/i,
  /^is_from_webapp$/i,
  /^sender_device$/i,
  /^sender_web_id$/i,
  /^_r$/i,
  /^_t$/i,
  /^mibextid$/i,
  /^ref(_src|_url)?$/i,
  /^share_(app_id|link_id|item_id)$/i,
  /^tt_from$/i,
  /^u_code$/i,
  /^user_id$/i,
  /^timestamp$/i,
];

function hostOf(url: URL) {
  return url.hostname.toLowerCase().replace(/^(www\.|m\.|mobile\.)/, '');
}

export function detectPlatform(input: string): Platform {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return 'web';
  }
  const host = hostOf(url);
  const is = (domain: string) => host === domain || host.endsWith(`.${domain}`);
  if (is('tiktok.com')) return 'tiktok';
  if (is('instagram.com') || host === 'instagr.am') return 'instagram';
  if (is('youtube.com') || host === 'youtu.be') return 'youtube';
  if (host === 'pin.it' || /(^|\.)pinterest\.[a-z.]+$/.test(host)) return 'pinterest';
  return 'web';
}

/**
 * Ripulisce un link così che lo stesso contenuto abbia sempre lo stesso indirizzo
 * (serve a riconoscere i doppioni): https, niente parametri di tracciamento, niente #frammento.
 * Restituisce null se il testo non è un link http(s) valido.
 */
export function normalizeUrl(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  url.protocol = 'https:';
  url.hash = '';
  url.username = '';
  url.password = '';
  url.hostname = url.hostname.toLowerCase();
  if (url.hostname.startsWith('m.') && detectPlatform(url.href) !== 'web') {
    url.hostname = `www.${url.hostname.slice(2)}`;
  }

  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMS.some((re) => re.test(key))) url.searchParams.delete(key);
  }

  // youtu.be/ID → youtube.com/watch?v=ID (stesso video, stesso indirizzo)
  if (url.hostname === 'youtu.be') {
    const id = url.pathname.slice(1).split('/')[0];
    if (id) {
      const t = url.searchParams.get('t');
      url = new URL(`https://www.youtube.com/watch?v=${id}`);
      if (t) url.searchParams.set('t', t);
    }
  }

  // Instagram e TikTok: i parametri non servono mai a identificare il post
  const platform = detectPlatform(url.href);
  if (platform === 'instagram' || platform === 'tiktok') url.search = '';

  let href = url.href;
  if (url.pathname !== '/' && href.endsWith('/') && !url.search) href = href.slice(0, -1);
  return href;
}

/** Link "corti" che vanno aperti per scoprire l'indirizzo vero (es. vm.tiktok.com/abc → tiktok.com/@chef/video/123). */
export function isShortLink(input: string): boolean {
  try {
    const host = new URL(input).hostname.toLowerCase();
    return ['vm.tiktok.com', 'vt.tiktok.com', 'pin.it', 'bit.ly', 'tinyurl.com', 't.co'].includes(host);
  } catch {
    return false;
  }
}

/**
 * Evita che il server venga usato per aprire indirizzi interni (es. http://localhost, 192.168.x.x).
 * Controllo sul nome: non sostituisce un firewall, ma blocca i casi ovvi.
 */
export function isSafePublicUrl(input: string): boolean {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  if (url.port && !['80', '443'].includes(url.port)) return false;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host.includes('.') && !host.includes(':')) return false; // "localhost", nomi interni
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    return false;
  }

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (a === 10 || a === 127 || a === 0) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a >= 224) return false;
  }
  if (host.includes(':')) {
    // IPv6: blocca loopback, link-local, indirizzi privati e IPv4 mappati
    if (host === '::1' || host === '::' || /^(fc|fd|fe8|fe9|fea|feb)/.test(host) || host.startsWith('::ffff:')) {
      return false;
    }
  }
  return true;
}
