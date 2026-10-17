// Ritaglio della foto profilo: la foto si sposta e si ingrandisce dentro un cerchio di lato `box`.
// Conti puri (testabili): dove sta la foto sullo schermo e quale quadrato ritagliare.

export type CropState = { zoom: number; x: number; y: number };
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;

/** Scala base: la foto copre tutto il cerchio (lato corto = lato del cerchio). */
export function baseScale(width: number, height: number, box: number): number {
  return box / Math.min(width, height);
}

/** Tiene la foto sempre a coprire il cerchio: zoom tra 1 e 4, spostamento limitato. */
export function clampCrop(s: CropState, width: number, height: number, box: number): CropState {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, s.zoom));
  const scale = baseScale(width, height, box) * zoom;
  const maxX = Math.max(0, (width * scale - box) / 2);
  const maxY = Math.max(0, (height * scale - box) / 2);
  return { zoom, x: Math.min(maxX, Math.max(-maxX, s.x)), y: Math.min(maxY, Math.max(-maxY, s.y)) };
}

/** Il quadrato da ritagliare, in pixel della foto originale. */
export function cropRect(s: CropState, width: number, height: number, box: number) {
  const scale = baseScale(width, height, box) * s.zoom;
  const left = (box - width * scale) / 2 + s.x;
  const top = (box - height * scale) / 2 + s.y;
  // "+ 0" evita il -0 quando la foto è allineata al bordo
  return { originX: -left / scale + 0, originY: -top / scale + 0, side: box / scale };
}
