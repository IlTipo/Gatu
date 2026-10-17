// Mappa dei posti: quali si possono mostrare e come inquadrarli. Niente rete: testabile.

export type MapPlace = {
  id: string;
  name: string;
  city: string | null;
  cuisine: string | null;
  price_level: number | null;
  latitude: number | null;
  longitude: number | null;
  wishlist: boolean;
};

export type Located<T> = T & { latitude: number; longitude: number };

/** Solo i posti con coordinate valide. */
export function mappable<T extends MapPlace>(places: T[]): Located<T>[] {
  return places.filter(
    (p): p is Located<T> =>
      typeof p.latitude === 'number' &&
      typeof p.longitude === 'number' &&
      Math.abs(p.latitude) <= 90 &&
      Math.abs(p.longitude) <= 180 &&
      !(p.latitude === 0 && p.longitude === 0),
  );
}

/** Rettangolo che contiene tutti i punti: [[sud, ovest], [nord, est]] (null se non ce ne sono). */
export function boundsOf(points: { latitude: number; longitude: number }[]): [[number, number], [number, number]] | null {
  if (!points.length) return null;
  const lats = points.map((p) => p.latitude);
  const lngs = points.map((p) => p.longitude);
  return [
    [Math.min(...lats), Math.min(...lngs)],
    [Math.max(...lats), Math.max(...lngs)],
  ];
}

/** Centro dell'Italia, per quando non c'è ancora niente da mostrare. */
export const DEFAULT_CENTER: [number, number] = [42.5, 12.5];
export const DEFAULT_ZOOM = 5;
