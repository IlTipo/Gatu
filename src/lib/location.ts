import * as Location from 'expo-location';

export type Coords = { latitude: number; longitude: number };

export class LocationDeniedError extends Error {
  constructor() {
    super('location_denied');
    this.name = 'LocationDeniedError';
  }
}

/** Posizione attuale (chiede il permesso la prima volta). */
export async function getCurrentCoords(): Promise<Coords> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') throw new LocationDeniedError();
  const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  return { latitude: position.coords.latitude, longitude: position.coords.longitude };
}
