import { clampCrop, cropRect } from '@/features/profile/crop';

describe('ritaglio foto profilo', () => {
  it('senza spostamenti: il quadrato centrale', () => {
    // foto 2000x1000, cerchio 250: si vede il centro, alto quanto la foto
    expect(cropRect({ zoom: 1, x: 0, y: 0 }, 2000, 1000, 250)).toEqual({ originX: 500, originY: 0, side: 1000 });
  });
  it('ingrandita e spostata a destra: si vede una parte più a sinistra e più piccola', () => {
    const r = cropRect({ zoom: 2, x: 50, y: 0 }, 1000, 1000, 250);
    expect(r.side).toBe(500);
    expect(r.originX).toBe(150);
    expect(r.originY).toBe(250);
  });
  it('la foto copre sempre il cerchio (niente bordi vuoti)', () => {
    expect(clampCrop({ zoom: 1, x: 999, y: 999 }, 2000, 1000, 250)).toEqual({ zoom: 1, x: 125, y: 0 });
    expect(clampCrop({ zoom: 9, x: 0, y: 0 }, 1000, 1000, 250).zoom).toBe(4);
    expect(clampCrop({ zoom: 0.2, x: 0, y: 0 }, 1000, 1000, 250).zoom).toBe(1);
  });
});
