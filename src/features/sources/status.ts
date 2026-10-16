import type { Analysis, Source } from './types';

export type SourceState = 'pending' | 'processing' | 'done' | 'review' | 'needs_text' | 'unknown' | 'error';

/** Riassume lo stato di un link salvato in un caso semplice da mostrare. */
export function describeStatus(s: Pick<Source, 'status' | 'error_message' | 'ai_result'>): SourceState {
  switch (s.status) {
    case 'processing':
      return 'processing';
    case 'done':
      return 'done';
    case 'error':
      return 'error';
    case 'needs_review':
      if (s.error_message === 'needs_text') return 'needs_text';
      if (s.ai_result?.kind === 'unknown') return 'unknown';
      return 'review';
    default:
      return 'pending';
  }
}

/** Chiave del messaggio da mostrare dopo un'analisi saltata o fallita (null se è andata bene). */
export function analysisMessageKey(a: Analysis): string | null {
  if (a.status === 'skipped') return a.reason === 'already_done' ? null : `source.skipped.${a.reason}`;
  if (a.status === 'error') return `source.errors.${a.reason}`;
  return null;
}

/** Dove portare l'utente dopo aver salvato un link. */
export function destinationAfterSave(
  sourceId: string,
  a: Analysis,
): { pathname: '/recipe/[id]' | '/place/[id]' | '/source/[id]'; id: string } {
  if (a.status === 'done' && a.kind === 'recipe' && a.recipeId) return { pathname: '/recipe/[id]', id: a.recipeId };
  if (a.status === 'done' && a.kind === 'places' && a.placeIds.length === 1) return { pathname: '/place/[id]', id: a.placeIds[0] };
  return { pathname: '/source/[id]', id: sourceId };
}
