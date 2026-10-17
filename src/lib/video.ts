import * as ImagePicker from 'expo-image-picker';

import { supabase } from '@/lib/supabase';

export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

const EXTENSIONS: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'video/x-m4v': 'm4v',
};

export class VideoTooLargeError extends Error {
  constructor() {
    super('video_too_large');
    this.name = 'VideoTooLargeError';
  }
}

export class VideoTypeError extends Error {
  constructor() {
    super('invalid_video');
    this.name = 'VideoTypeError';
  }
}

/** Fa scegliere un video dal telefono (es. salvato da TikTok). null se l'utente annulla. */
export async function pickVideo(): Promise<{ uri: string; mimeType: string } | null> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], quality: 1 });
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  return { uri: asset.uri, mimeType: (asset.mimeType ?? 'video/mp4').toLowerCase() };
}

/**
 * Carica il video nella cartella privata dell'utente (videos/<id>/<nome casuale>).
 * Lo legge solo la funzione del server, che poi lo cancella. Restituisce il percorso.
 */
export async function uploadVideo(video: { uri: string; mimeType: string }): Promise<string> {
  const ext = EXTENSIONS[video.mimeType];
  if (!ext) throw new VideoTypeError();
  const blob = await (await fetch(video.uri)).blob();
  if (blob.size > MAX_VIDEO_BYTES) throw new VideoTooLargeError();
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) throw new Error('unauthorized');
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('videos').upload(path, blob, { contentType: video.mimeType, upsert: false });
  if (error) throw error;
  return path;
}
