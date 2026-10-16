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
  ai_result: AiResult | null;
  created_at: string;
  updated_at: string;
};

export type SaveLinkResult = {
  source: Source;
  duplicate: boolean;
  needsText: boolean;
  analysis: Analysis;
};

export type AiResult = {
  model?: string;
  kind?: 'recipe' | 'places' | 'unknown';
  confidence?: 'high' | 'medium' | 'low';
  missing_info?: string[];
};

/** Risultato dell'analisi AI restituito dalla funzione "extract". */
export type Analysis =
  | {
    status: 'done' | 'needs_review';
    kind: 'recipe' | 'places' | 'unknown';
    recipeId: string | null;
    placeIds: string[];
    missingInfo: string[];
  }
  | { status: 'skipped'; reason: 'not_configured' | 'needs_text' | 'quota_exceeded' | 'already_done' }
  | { status: 'error'; reason: string };
