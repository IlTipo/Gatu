import type { Located, MapPlace } from '@/features/map/logic';

export type PlacesMapProps = {
  places: Located<MapPlace>[];
  me: { latitude: number; longitude: number } | null;
  onOpen: (placeId: string) => void;
  openLabel: string;
  /** cambiandolo, la mappa si ricentra su tutti i punti */
  focusKey: string;
};
