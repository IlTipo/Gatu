import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

const MAX_SIDE = 1600;

export type PickedPhoto = { uri: string; base64: string; mimeType: 'image/jpeg' };

/**
 * Fa scegliere una foto (galleria o, sul telefono, anche la fotocamera dal selettore del browser)
 * e la rimpicciolisce a max 1600 px in JPEG: si carica in fretta e l'AI la legge bene lo stesso.
 * Restituisce null se l'utente annulla.
 */
export async function pickRecipePhoto(maxSide = MAX_SIDE): Promise<PickedPhoto | null> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  const scale = Math.min(1, maxSide / Math.max(asset.width || maxSide, asset.height || maxSide));
  const context = ImageManipulator.manipulate(asset.uri);
  if (scale < 1) context.resize({ width: Math.round((asset.width || maxSide) * scale) });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: true });
  if (!saved.base64) throw new Error('photo_encoding_failed');
  return { uri: saved.uri, base64: saved.base64.replace(/^data:[^,]+,/, ''), mimeType: 'image/jpeg' };
}

export type RawPhoto = { uri: string; width: number; height: number };

/** Sceglie una foto così com'è (per ritagliarla dopo, es. la foto profilo). null se annullato. */
export async function pickRawPhoto(): Promise<RawPhoto | null> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
  if (result.canceled || !result.assets?.length) return null;
  const a = result.assets[0];
  return { uri: a.uri, width: a.width || 1, height: a.height || 1 };
}

/** Ritaglia un quadrato (in pixel della foto originale) e lo rimpicciolisce a `size` px, JPEG base64. */
export async function cropSquare(
  photo: RawPhoto,
  rect: { originX: number; originY: number; side: number },
  size = 512,
): Promise<{ uri: string; base64: string }> {
  const side = Math.max(1, Math.min(Math.round(rect.side), photo.width, photo.height));
  const originX = Math.max(0, Math.min(Math.round(rect.originX), photo.width - side));
  const originY = Math.max(0, Math.min(Math.round(rect.originY), photo.height - side));
  const context = ImageManipulator.manipulate(photo.uri).crop({ originX, originY, width: side, height: side });
  if (side > size) context.resize({ width: size, height: size });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.85, base64: true });
  if (!saved.base64) throw new Error('photo_encoding_failed');
  return { uri: saved.uri, base64: saved.base64.replace(/^data:[^,]+,/, '') };
}
