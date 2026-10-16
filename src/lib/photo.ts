import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

const MAX_SIDE = 1600;

export type PickedPhoto = { uri: string; base64: string; mimeType: 'image/jpeg' };

/**
 * Fa scegliere una foto (galleria o, sul telefono, anche la fotocamera dal selettore del browser)
 * e la rimpicciolisce a max 1600 px in JPEG: si carica in fretta e l'AI la legge bene lo stesso.
 * Restituisce null se l'utente annulla.
 */
export async function pickRecipePhoto(): Promise<PickedPhoto | null> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  const scale = Math.min(1, MAX_SIDE / Math.max(asset.width || MAX_SIDE, asset.height || MAX_SIDE));
  const context = ImageManipulator.manipulate(asset.uri);
  if (scale < 1) context.resize({ width: Math.round((asset.width || MAX_SIDE) * scale) });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: true });
  if (!saved.base64) throw new Error('photo_encoding_failed');
  return { uri: saved.uri, base64: saved.base64.replace(/^data:[^,]+,/, ''), mimeType: 'image/jpeg' };
}
