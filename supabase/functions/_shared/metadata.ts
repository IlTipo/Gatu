// Recupera i metadati pubblici di un link, nel rispetto dei termini dei social:
// - TikTok e YouTube: oEmbed ufficiale (titolo/caption, autore, miniatura)
// - Instagram, Pinterest e siti web: anteprime Open Graph pubbliche della pagina
// Nessuno scraping di contenuti privati, nessun login, nessun aggiramento di blocchi.

import { parseHtmlMetadata } from './html.ts';
import { detectPlatform, isPublicIp, isSafePublicUrl, isShortLink, normalizeUrl, type Platform } from './links.ts';

export type LinkMetadata = {
  url: string;
  platform: Platform;
  title: string | null;
  description: string | null;
  author: string | null;
  thumbnailUrl: string | null;
  recipeJsonLd: Record<string, unknown> | null;
  /** true se non abbiamo trovato testo utile: l'app chiederà di incollare la caption. */
  needsText: boolean;
};

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export const USER_AGENT = 'MorsoBot/1.0 (+https://github.com/IlTipo/Gatu)';
const TIMEOUT_MS = 8000;
const MAX_HTML_BYTES = 2_000_000;
const MAX_REDIRECTS = 5;

export class UnsafeUrlError extends Error {
  constructor() {
    super('unsafe_url');
    this.name = 'UnsafeUrlError';
  }
}

/** fetch che segue i redirect a mano, controllando che ogni tappa sia un indirizzo pubblico. */
/**
 * Controlla dove porta davvero il nome (DNS): un nome "innocuo" potrebbe puntare a un IP interno.
 * Se il DNS non è disponibile (test, ambienti senza permesso) si va avanti col solo controllo sul nome.
 */
export async function resolvesToPublicIp(url: string): Promise<boolean> {
  const host = new URL(url).hostname.replace(/^\[|\]$/g, '').replace(/\.+$/, '');
  if (/^[\d.]+$/.test(host) || host.includes(':')) return isPublicIp(host);
  const resolve = (globalThis as { Deno?: { resolveDns?: (h: string, t: 'A' | 'AAAA') => Promise<string[]> } }).Deno
    ?.resolveDns;
  if (!resolve) return true;
  const answers = (
    await Promise.all([resolve(host, 'A').catch(() => []), resolve(host, 'AAAA').catch(() => [])])
  ).flat();
  // nessuna risposta: il fetch fallirà da solo; se anche un solo indirizzo è interno, no
  return answers.every((ip) => isPublicIp(ip));
}

export async function safeFetch(url: string, fetchImpl: FetchLike, init: RequestInit = {}): Promise<Response> {
  let current = url;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    if (!isSafePublicUrl(current) || !(await resolvesToPublicIp(current))) throw new UnsafeUrlError();
    const res = await fetchImpl(current, {
      ...init,
      redirect: 'manual',
      signal: init.signal ?? AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'user-agent': USER_AGENT, 'accept-language': 'it-IT,it;q=0.9,en;q=0.8', ...(init.headers ?? {}) },
    });
    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) {
      await res.body?.cancel();
      current = new URL(location, current).href;
      continue;
    }
    // ricordiamo l'indirizzo finale (dopo i redirect) per chi ci chiama
    Object.defineProperty(res, 'finalUrl', { value: current });
    return res;
  }
  throw new Error('too_many_redirects');
}

export function finalUrlOf(res: Response, fallback: string): string {
  return (res as Response & { finalUrl?: string }).finalUrl ?? fallback;
}

/** Legge al massimo `maxBytes` del corpo della risposta (le pagine enormi vengono troncate). */
/** Legge al massimo maxBytes; se la risposta è più lunga restituisce null (niente file enormi in memoria). */
export async function readBytesLimited(res: Response, maxBytes: number): Promise<Uint8Array | null> {
  if (!res.body) return new Uint8Array();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    all.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return all;
}

export async function readTextLimited(res: Response, maxBytes = MAX_HTML_BYTES): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
  }
  await reader.cancel().catch(() => {});
  const all = new Uint8Array(Math.min(total, maxBytes));
  let offset = 0;
  for (const chunk of chunks) {
    const part = chunk.subarray(0, Math.min(chunk.byteLength, all.byteLength - offset));
    all.set(part, offset);
    offset += part.byteLength;
    if (offset >= all.byteLength) break;
  }
  return new TextDecoder().decode(all);
}

type OEmbed = { title?: string; author_name?: string; thumbnail_url?: string };

async function fetchOEmbed(endpoint: string, fetchImpl: FetchLike): Promise<OEmbed | null> {
  try {
    const res = await safeFetch(endpoint, fetchImpl, { headers: { accept: 'application/json' } });
    if (!res.ok) {
      await res.body?.cancel();
      return null;
    }
    // anche la risposta oEmbed ha un limite (è un piccolo JSON)
    const bytes = await readBytesLimited(res, 256 * 1024);
    return bytes ? (JSON.parse(new TextDecoder().decode(bytes)) as OEmbed) : null;
  } catch {
    return null;
  }
}

async function fetchPage(url: string, fetchImpl: FetchLike) {
  try {
    const res = await safeFetch(url, fetchImpl, { headers: { accept: 'text/html,application/xhtml+xml' } });
    const finalUrl = finalUrlOf(res, url);
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok || !/html|xml/i.test(type)) {
      await res.body?.cancel();
      return { finalUrl, meta: null };
    }
    return { finalUrl, meta: parseHtmlMetadata(await readTextLimited(res), finalUrl) };
  } catch (e) {
    if (e instanceof UnsafeUrlError) throw e;
    return { finalUrl: url, meta: null };
  }
}

/** Apre un link corto (vm.tiktok.com/…, pin.it/…) per scoprire l'indirizzo vero. */
export async function resolveShortLink(url: string, fetchImpl: FetchLike): Promise<string> {
  if (!isShortLink(url)) return url;
  try {
    const res = await safeFetch(url, fetchImpl, { method: 'GET' });
    await res.body?.cancel();
    return finalUrlOf(res, url);
  } catch (e) {
    if (e instanceof UnsafeUrlError) throw e;
    return url;
  }
}

/** Instagram mette la caption nell'anteprima così: «12 likes - chef on May 1, 2026: "Pasta al limone…"». */
function cleanInstagramText(text: string | null): string | null {
  if (!text) return null;
  const quoted = text.match(/:\s*["“](.+)["”]\.?\s*$/s);
  return quoted ? quoted[1].trim() : text;
}

export async function fetchLinkMetadata(rawUrl: string, fetchImpl: FetchLike = fetch): Promise<LinkMetadata> {
  const normalized = normalizeUrl(rawUrl);
  if (!normalized || !isSafePublicUrl(normalized)) throw new UnsafeUrlError();

  const resolved = normalizeUrl(await resolveShortLink(normalized, fetchImpl)) ?? normalized;
  const platform = detectPlatform(resolved);
  const result: LinkMetadata = {
    url: resolved,
    platform,
    title: null,
    description: null,
    author: null,
    thumbnailUrl: null,
    recipeJsonLd: null,
    needsText: false,
  };

  if (platform === 'tiktok' || platform === 'youtube') {
    const endpoint = platform === 'tiktok'
      ? `https://www.tiktok.com/oembed?url=${encodeURIComponent(resolved)}`
      : `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(resolved)}`;
    const oembed = await fetchOEmbed(endpoint, fetchImpl);
    result.title = oembed?.title?.trim() || null;
    result.author = oembed?.author_name?.trim() || null;
    result.thumbnailUrl = oembed?.thumbnail_url || null;
    // Su TikTok il "titolo" oEmbed è proprio la caption del video.
    if (platform === 'tiktok') result.description = result.title;
  }

  if (platform !== 'tiktok') {
    const { meta } = await fetchPage(resolved, fetchImpl);
    if (meta) {
      result.title ??= meta.title;
      result.description ??= platform === 'instagram' ? cleanInstagramText(meta.description) : meta.description;
      result.author ??= meta.author ?? meta.siteName;
      result.thumbnailUrl ??= meta.imageUrl;
      result.recipeJsonLd = meta.recipeJsonLd;
    }
  }

  const textLength = `${result.title ?? ''} ${result.description ?? ''}`.trim().length;
  result.needsText = !result.recipeJsonLd && textLength < 40;
  return result;
}
