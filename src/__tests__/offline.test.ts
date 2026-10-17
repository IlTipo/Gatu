import { shouldPersist } from '@/lib/offline';

describe('offline', () => {
  it('salva solo i dati utili e già caricati', () => {
    expect(shouldPersist(['recipes', 'r1'], 'success')).toBe(true);
    expect(shouldPersist(['shopping', '2026-10-12'], 'success')).toBe(true);
    expect(shouldPersist(['recipes', 'r1'], 'error')).toBe(false);
    // le risposte dell'AI e i dati degli amici non restano sul dispositivo
    expect(shouldPersist(['ask-library', 'pasta'], 'success')).toBe(false);
    expect(shouldPersist(['friend-feed', 'u2', '2026-10-17'], 'success')).toBe(false);
  });
});
