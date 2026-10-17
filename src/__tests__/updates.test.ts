import { isNewBuild } from '@/lib/updates';

describe('aggiornamenti del sito', () => {
  it('riconosce una pubblicazione nuova', () => {
    expect(isNewBuild({ build: 'b2' }, 'b1')).toBe(true);
    expect(isNewBuild({ build: 'b1' }, 'b1')).toBe(false);
  });
  it('senza informazioni non ricarica (niente giri a vuoto)', () => {
    expect(isNewBuild({ build: 'b2' }, '')).toBe(false);
    expect(isNewBuild(null, 'b1')).toBe(false);
    expect(isNewBuild({ build: '' }, 'b1')).toBe(false);
    expect(isNewBuild({ build: 42 }, 'b1')).toBe(false);
  });
});
