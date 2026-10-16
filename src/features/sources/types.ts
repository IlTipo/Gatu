// Forma di una riga della tabella "sources" (un link salvato).

export type Platform = 'tiktok' | 'instagram' | 'youtube' | 'pinterest' | 'web' | 'manual';
export type ImportStatus = 'pending' | 'processing' | 'done' | 'needs_review' | 'error';

export type Source = {
  id: string;
  user_id: string;
  url: string;
  platform: Platform;
  title: string | null;
  description: string | null;
  author_name: string | null;
  thumbnail_url: string | null;
  shared_text: string | null;
  status: ImportStatus;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type SaveLinkResult = {
  source: Source;
  duplicate: boolean;
  needsText: boolean;
};
