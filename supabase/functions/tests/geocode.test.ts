import { assertEquals } from 'jsr:@std/assert@1';

import { createGeocoder } from '../_shared/geocode.ts';
import { fakeFetch, jsonRoute } from './fakes.ts';

Deno.test('OpenStreetMap (senza chiave Google)', async () => {
  const q = encodeURIComponent('Trattoria Anna Maria, Bologna');
  const { fetch, calls } = fakeFetch({
    [`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&extratags=1&accept-language=it&q=${q}`]:
      jsonRoute([
        {
          lat: '44.4949',
          lon: '11.3487',
          display_name: 'x',
          address: { road: 'Via delle Belle Arti', house_number: '17', postcode: '40126', city: 'Bologna' },
          extratags: {
            'contact:phone': '+39 051 266894',
            website: 'trattoria-annamaria.it',
            opening_hours: 'Tu-Su 12:30-15:00',
          },
        },
      ]),
  });
  const geo = await createGeocoder({ fetch })({ name: 'Trattoria Anna Maria', city: 'Bologna', address: null });
  assertEquals(calls.length, 1);
  assertEquals(geo, {
    address: 'Via delle Belle Arti 17, 40126, Bologna',
    city: 'Bologna',
    latitude: 44.4949,
    longitude: 11.3487,
    googlePlaceId: null,
    priceLevel: null,
    phone: '+39 051 266894',
    website: 'https://trattoria-annamaria.it/',
    openingHours: 'Tu-Su 12:30-15:00',
    provider: 'osm',
  });
});

Deno.test('Google Places (con chiave)', async () => {
  const { fetch } = fakeFetch({
    'https://places.googleapis.com/v1/places:searchText': jsonRoute({
      places: [{
        id: 'ChIJabc',
        formattedAddress: 'Via Mentana, 1, 40126 Bologna BO, Italia',
        location: { latitude: 44.5, longitude: 11.35 },
        priceLevel: 'PRICE_LEVEL_MODERATE',
        addressComponents: [{ longText: 'Bologna', types: ['locality', 'political'] }],
        websiteUri: 'javascript:alert(1)',
        regularOpeningHours: { weekdayDescriptions: ['lunedì: Chiuso', 'martedì: 12:00–15:00'] },
      }],
    }),
  });
  const geo = await createGeocoder({ fetch, googleApiKey: 'key' })({
    name: "Osteria dell'Orsa",
    city: 'Bologna',
    address: null,
  });
  assertEquals(geo?.googlePlaceId, 'ChIJabc');
  assertEquals(geo?.priceLevel, 2);
  assertEquals(geo?.provider, 'google');
  assertEquals(geo?.website, null); // link pericoloso scartato
  assertEquals(geo?.openingHours, 'lunedì: Chiuso; martedì: 12:00–15:00');
});

Deno.test('nessun risultato o errore → null (il locale si salva lo stesso)', async () => {
  const { fetch } = fakeFetch({});
  assertEquals(await createGeocoder({ fetch })({ name: 'Posto inesistente', city: null, address: null }), null);
  const failing = () => Promise.reject(new TypeError('down'));
  assertEquals(await createGeocoder({ fetch: failing })({ name: 'X', city: 'Roma', address: null }), null);
});
