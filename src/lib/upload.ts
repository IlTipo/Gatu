import { supabase } from './supabase';

/** Carica una foto (già rimpicciolita, JPEG in base64) nella propria cartella e restituisce il link pubblico. */
export async function uploadPhoto(base64: string, prefix: 'avatar' | 'recipe'): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) throw new Error('unauthorized');
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const path = `${uid}/${prefix}-${Date.now()}.jpg`;
  const { error } = await supabase.storage.from('images').upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;
  return supabase.storage.from('images').getPublicUrl(path).data.publicUrl;
}
