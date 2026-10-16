import { analysisMessageKey, describeStatus, destinationAfterSave } from '@/features/sources/status';

describe('stato di un link', () => {
  const base = { error_message: null, ai_result: null };
  it('casi semplici', () => {
    expect(describeStatus({ ...base, status: 'pending' })).toBe('pending');
    expect(describeStatus({ ...base, status: 'processing' })).toBe('processing');
    expect(describeStatus({ ...base, status: 'done' })).toBe('done');
    expect(describeStatus({ ...base, status: 'error' })).toBe('error');
  });

  it('da rivedere: manca il testo, niente trovato, o solo da controllare', () => {
    expect(describeStatus({ status: 'needs_review', error_message: 'needs_text', ai_result: null })).toBe('needs_text');
    expect(describeStatus({ status: 'needs_review', error_message: null, ai_result: { kind: 'unknown' } })).toBe('unknown');
    expect(describeStatus({ status: 'needs_review', error_message: null, ai_result: { kind: 'recipe' } })).toBe('review');
  });
});

describe('dopo il salvataggio', () => {
  it('ricetta → pagina della ricetta', () => {
    expect(destinationAfterSave('s1', { status: 'done', kind: 'recipe', recipeId: 'r1', placeIds: [], missingInfo: [] })).toEqual({
      pathname: '/recipe/[id]',
      id: 'r1',
    });
  });
  it('un solo locale → pagina del locale; più locali → elenco nel link', () => {
    expect(destinationAfterSave('s1', { status: 'done', kind: 'places', recipeId: null, placeIds: ['p1'], missingInfo: [] }).pathname).toBe(
      '/place/[id]',
    );
    expect(destinationAfterSave('s1', { status: 'done', kind: 'places', recipeId: null, placeIds: ['p1', 'p2'], missingInfo: [] })).toEqual({
      pathname: '/source/[id]',
      id: 's1',
    });
  });
  it('da rivedere o non analizzato → pagina del link', () => {
    expect(destinationAfterSave('s1', { status: 'needs_review', kind: 'recipe', recipeId: 'r1', placeIds: [], missingInfo: [] }).pathname).toBe(
      '/source/[id]',
    );
    expect(destinationAfterSave('s1', { status: 'skipped', reason: 'quota_exceeded' }).pathname).toBe('/source/[id]');
  });
  it('messaggi', () => {
    expect(analysisMessageKey({ status: 'skipped', reason: 'quota_exceeded' })).toBe('source.skipped.quota_exceeded');
    expect(analysisMessageKey({ status: 'skipped', reason: 'already_done' })).toBeNull();
    expect(analysisMessageKey({ status: 'error', reason: 'auth' })).toBe('source.errors.auth');
  });
});
