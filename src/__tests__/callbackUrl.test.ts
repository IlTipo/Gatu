import { parseAuthCallback } from '@/features/auth/callbackUrl';

describe('parseAuthCallback', () => {
  it('legge il codice dalla query', () => {
    expect(parseAuthCallback('morso://auth/callback?code=abc123')).toEqual({ kind: 'code', code: 'abc123' });
  });

  it('funziona con gli indirizzi di Expo Go', () => {
    expect(parseAuthCallback('exp://192.168.1.5:8081/--/auth/callback?code=xyz')).toEqual({ kind: 'code', code: 'xyz' });
  });

  it("riconosce un errore nell'hash", () => {
    expect(
      parseAuthCallback('morso://auth/callback#error=access_denied&error_description=Utente+ha+annullato'),
    ).toEqual({ kind: 'error', message: 'Utente ha annullato' });
  });

  it("l'errore ha la precedenza sul codice", () => {
    expect(parseAuthCallback('morso://auth/callback?code=abc&error=server_error').kind).toBe('error');
  });

  it('restituisce empty se non ci sono parametri', () => {
    expect(parseAuthCallback('morso://auth/callback')).toEqual({ kind: 'empty' });
    expect(parseAuthCallback('')).toEqual({ kind: 'empty' });
  });

  it('non va in crash con caratteri codificati male', () => {
    expect(parseAuthCallback('morso://auth/callback?code=%E0%A4%A')).toEqual({ kind: 'code', code: '%E0%A4%A' });
  });
});
