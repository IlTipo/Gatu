// Verifica dei locali: trova indirizzo e coordinate partendo da nome + città.
// - Con GOOGLE_PLACES_API_KEY: Google Places (Text Search), più preciso sui ristoranti.
// - Senza chiave: OpenStreetMap (Nominatim), gratis; usato con moderazione come chiede la sua policy.

import type { FetchLike } from './metadata.ts';
import { USER_AGENT } from './metadata.ts';

export type GeoResult = {
  address: string | null;
  city: string | null;
  latitude: number;
  longitude: number;
  googlePlaceId: string | null;
  priceLevel: number | null;
  provider: 'google' | 'osm';
};

export type Geocoder = (
  query: { name: string; city: string | null; address: string | null },
) => Promise<GeoResult | null>;

const GOOGLE_PRICE: Record<string, number> = {
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

export function createGeocoder(opts: { googleApiKey?: string | null; fetch: FetchLike }): Geocoder {
  const f = opts.fetch;
  return async ({ name, city, address }) => {
    const text = [name, address, city].filter(Boolean).join(', ');
    try {
      if (opts.googleApiKey) {
        const res = await f('https://places.googleapis.com/v1/places:searchText', {
          method: 'POST',
          signal: AbortSignal.timeout(8000),
          headers: {
            'content-type': 'application/json',
            'x-goog-api-key': opts.googleApiKey,
            'x-goog-fieldmask':
              'places.id,places.formattedAddress,places.location,places.priceLevel,places.addressComponents',
          },
          body: JSON.stringify({ textQuery: text, languageCode: 'it', regionCode: 'IT', maxResultCount: 1 }),
        });
        if (!res.ok) return null;
        const data = await res.json();
        const place = data.places?.[0];
        if (!place?.location) return null;
        const locality = (place.addressComponents ?? []).find((c: { types?: string[] }) =>
          c.types?.includes('locality')
        );
        return {
          address: place.formattedAddress ?? null,
          city: locality?.longText ?? city,
          latitude: place.location.latitude,
          longitude: place.location.longitude,
          googlePlaceId: place.id ?? null,
          priceLevel: GOOGLE_PRICE[place.priceLevel] ?? null,
          provider: 'google',
        };
      }

      const url =
        `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&accept-language=it&q=${
          encodeURIComponent(text)
        }`;
      const res = await f(url, { signal: AbortSignal.timeout(8000), headers: { 'user-agent': USER_AGENT } });
      if (!res.ok) return null;
      const [hit] = await res.json();
      if (!hit) return null;
      const a = hit.address ?? {};
      const street = [a.road, a.house_number].filter(Boolean).join(' ');
      const hitCity = a.city ?? a.town ?? a.village ?? a.municipality ?? city;
      return {
        address: [street, a.postcode, hitCity].filter(Boolean).join(', ') || hit.display_name || null,
        city: hitCity ?? null,
        latitude: Number(hit.lat),
        longitude: Number(hit.lon),
        googlePlaceId: null,
        priceLevel: null,
        provider: 'osm',
      };
    } catch {
      return null;
    }
  };
}
