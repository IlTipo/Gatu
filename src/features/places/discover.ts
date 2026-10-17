// "Scopri in zona": ristoranti, bar e gelaterie vicino a te presi da OpenStreetMap (gratis, dati pubblici).
// Qui solo la costruzione della richiesta e la lettura della risposta: niente rete, testabile.

import { normalize } from '@/features/library/filter';

import { distanceMeters } from './format';

export type Coords = { latitude: number; longitude: number };
export type DiscoverKind = 'restaurant' | 'pizza' | 'cafe' | 'bar' | 'fast_food' | 'ice_cream';

export type DiscoveredPlace = {
  osmId: string;
  name: string;
  kind: DiscoverKind;
  cuisine: string | null;
  latitude: number;
  longitude: number;
  address: string | null;
  city: string | null;
  website: string | null;
  phone: string | null;
  opening_hours: string | null;
  meters: number;
};

export const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
export const MAX_RESULTS = 60;

/** Richiesta a OpenStreetMap: locali con un nome entro `radiusM` metri. */
export function buildOverpassQuery(me: Coords, radiusM: number): string {
  const r = Math.round(Math.min(Math.max(radiusM, 100), 10000));
  const lat = me.latitude.toFixed(5);
  const lon = me.longitude.toFixed(5);
  return `[out:json][timeout:20];nwr["amenity"~"^(restaurant|cafe|fast_food|bar|pub|ice_cream)$"]["name"](around:${r},${lat},${lon});out center tags 200;`;
}

// cucine più comuni di OpenStreetMap (in inglese) → italiano
const CUISINES: Record<string, string> = {
  italian: 'italiana',
  pizza: 'pizza',
  regional: 'regionale',
  japanese: 'giapponese',
  sushi: 'sushi',
  chinese: 'cinese',
  indian: 'indiana',
  thai: 'thailandese',
  mexican: 'messicana',
  greek: 'greca',
  turkish: 'turca',
  kebab: 'kebab',
  burger: 'hamburger',
  seafood: 'pesce',
  fish: 'pesce',
  vegetarian: 'vegetariana',
  vegan: 'vegana',
  coffee_shop: 'caffetteria',
  ice_cream: 'gelato',
  steak_house: 'carne',
  sandwich: 'panini',
  piadina: 'piadina',
  american: 'americana',
  french: 'francese',
  spanish: 'spagnola',
  korean: 'coreana',
  vietnamese: 'vietnamita',
  lebanese: 'libanese',
  poke: 'poke',
  ramen: 'ramen',
};

export function translateCuisine(raw: string | undefined): string | null {
  if (!raw) return null;
  const parts = raw
    .split(/[;,]/)
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean)
    .map((c) => CUISINES[c] ?? c.replace(/_/g, ' '));
  return parts.length ? [...new Set(parts)].slice(0, 3).join(', ').slice(0, 80) : null;
}

const web = (v: string | undefined) => (v && /^https?:\/\/\S+$/i.test(v.trim()) && v.length <= 300 ? v.trim() : null);
const text = (v: string | undefined, max: number) => (v ? v.replace(/\s+/g, ' ').trim().slice(0, max) || null : null);

type OsmElement = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

/** Risposta di OpenStreetMap → locali puliti, dal più vicino, al massimo 60. */
export function parseOverpass(json: unknown, me: Coords): DiscoveredPlace[] {
  const elements = (json as { elements?: OsmElement[] } | null)?.elements;
  if (!Array.isArray(elements)) return [];
  const seen = new Set<string>();
  const out: DiscoveredPlace[] = [];
  for (const e of elements) {
    const tags = e.tags ?? {};
    const lat = e.lat ?? e.center?.lat;
    const lon = e.lon ?? e.center?.lon;
    const name = text(tags.name, 120);
    if (!name || typeof lat !== 'number' || typeof lon !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const key = `${normalize(name)}|${lat.toFixed(3)}|${lon.toFixed(3)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const amenity = tags.amenity;
    const cuisine = translateCuisine(tags.cuisine);
    const kind: DiscoverKind =
      amenity === 'restaurant'
        ? /pizza/.test(tags.cuisine ?? '')
          ? 'pizza'
          : 'restaurant'
        : amenity === 'cafe'
          ? 'cafe'
          : amenity === 'fast_food'
            ? 'fast_food'
            : amenity === 'ice_cream'
              ? 'ice_cream'
              : 'bar';
    const street = [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(' ');
    out.push({
      osmId: `${e.type}/${e.id}`,
      name,
      kind,
      cuisine,
      latitude: lat,
      longitude: lon,
      address: text(street, 200),
      city: text(tags['addr:city'], 100),
      website: web(tags.website ?? tags['contact:website']),
      phone: text(tags.phone ?? tags['contact:phone'], 40),
      opening_hours: text(tags.opening_hours, 300),
      meters: distanceMeters(me, { latitude: lat, longitude: lon }),
    });
  }
  return out.sort((a, b) => a.meters - b.meters).slice(0, MAX_RESULTS);
}

/** Già tra i tuoi posti? (stesso nome a meno di 200 m) */
export function isAlreadySaved(
  p: Pick<DiscoveredPlace, 'name' | 'latitude' | 'longitude'>,
  saved: { name: string; latitude: number | null; longitude: number | null }[],
): boolean {
  const n = normalize(p.name);
  return saved.some(
    (s) =>
      normalize(s.name) === n &&
      (s.latitude === null || s.longitude === null || distanceMeters(p, { latitude: s.latitude, longitude: s.longitude }) < 200),
  );
}
