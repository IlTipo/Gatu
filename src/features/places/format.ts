import type { Place } from './types';

export function priceLabel(level: number | null): string | null {
  return level ? '€'.repeat(level) : null;
}

/** Link per aprire il locale in Google Maps (funziona senza chiavi). */
export function googleMapsUrl(p: Pick<Place, 'name' | 'city' | 'address' | 'google_place_id'>): string {
  const query = encodeURIComponent([p.name, p.address ?? p.city].filter(Boolean).join(', '));
  return p.google_place_id
    ? `https://www.google.com/maps/search/?api=1&query=${query}&query_place_id=${p.google_place_id}`
    : `https://www.google.com/maps/search/?api=1&query=${query}`;
}

/** "trofie al pesto, focaccia" → ["trofie al pesto", "focaccia"] */
export function parseDishes(text: string): string[] {
  return [...new Set(text.split(/[,\n]/).map((d) => d.trim()).filter(Boolean))];
}
