import type { Platform } from './types';

export const PLATFORM_LABELS: Record<Platform, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  youtube: 'YouTube',
  pinterest: 'Pinterest',
  web: 'Web',
  manual: 'Manuale',
};

/** Trova il primo link http(s) in un testo (es. quello condiviso da un'altra app). */
export function findUrl(text: string | null | undefined): string | null {
  if (!text) return null;
  const match = text.match(/https?:\/\/[^\s<>"'`]+/i);
  return match ? match[0].replace(/[)\].,;:!?»”’]+$/u, '') : null;
}

/**
 * Mette insieme ciò che arriva dalla "Condividi" (Android) o da un Comando rapido (iPhone):
 * alcune app mettono il link in `url`, altre dentro `text`, altre ancora nel `title`.
 */
export function readSharedParams(params: { url?: string; text?: string; title?: string }) {
  const pick = (v?: string | string[]) => (Array.isArray(v) ? v[0] : v)?.trim() || '';
  const url = pick(params.url);
  const text = pick(params.text);
  const title = pick(params.title);
  const link = findUrl(url) ?? findUrl(text) ?? findUrl(title) ?? '';
  // il testo extra (caption) è tutto il resto, senza ripetere il link
  const extra = [title, text]
    .map((part) => (link ? part.replace(link, '') : part).trim())
    .filter(Boolean)
    .join('\n');
  return { link, text: extra };
}

/** Mostra solo il dominio, es. "giallozafferano.it". */
export function displayHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
