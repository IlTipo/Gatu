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

// ------------------------------------------------------------------ distanze

/** Distanza in metri tra due punti (formula dell'emisenoverso). */
export function distanceMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** 350 → "350 m" · 2430 → "2,4 km" · 45200 → "45 km" */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.max(10, Math.round(meters / 10) * 10)} m`;
  const km = meters / 1000;
  return `${km.toLocaleString('it-IT', { maximumFractionDigits: km < 10 ? 1 : 0 })} km`;
}

// ------------------------------------------------------------------ orari

const DAYS: Record<string, string> = { Mo: 'Lun', Tu: 'Mar', We: 'Mer', Th: 'Gio', Fr: 'Ven', Sa: 'Sab', Su: 'Dom', PH: 'Festivi' };

/**
 * Orari leggibili in italiano, una riga per gruppo di giorni.
 * "Mo-Sa 12:00-15:00,19:00-23:00; Su off" → ["Lun–Sab 12:00–15:00, 19:00–23:00", "Dom chiuso"]
 * Le righe di Google ("lunedì: 12:00–15:00; martedì: …") restano come sono.
 */
export function formatOpeningHours(value: string | null): string[] {
  if (!value?.trim()) return [];
  if (value.trim() === '24/7') return ['Sempre aperto'];
  return value
    .split(';')
    .map((part) =>
      part
        .trim()
        .replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su|PH)\b/g, (d) => DAYS[d])
        .replace(/(\d{1,2}:\d{2})-(\d{1,2}:\d{2})/g, '$1–$2')
        .replace(/([A-Za-z]{3})-([A-Za-z]{3})/g, '$1–$2')
        .replace(/,(?=\S)/g, ', ')
        .replace(/\b(off|closed)\b/gi, 'chiuso')
    )
    .filter(Boolean);
}

/** Link "tel:" pulito (solo cifre e +). */
export function phoneHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}
