import type { TFunction } from 'i18next';

import { errorMessage } from '@/lib/errors';

const t = ((key: string) => key) as unknown as TFunction;

describe('errorMessage', () => {
  it('traduce i codici di errore di Supabase', () => {
    expect(errorMessage({ code: 'invalid_credentials', message: 'Invalid login credentials' }, t)).toBe(
      'auth.errors.invalidCredentials',
    );
    expect(errorMessage({ code: 'user_already_exists' }, t)).toBe('auth.errors.userAlreadyExists');
  });

  it('riconosce gli errori di rete', () => {
    expect(errorMessage(new TypeError('Network request failed'), t)).toBe('common.networkError');
    expect(errorMessage({ name: 'AuthRetryableFetchError', message: '' }, t)).toBe('common.networkError');
  });

  it('usa un messaggio generico per il resto', () => {
    expect(errorMessage(new Error('boom'), t)).toBe('common.genericError');
    expect(errorMessage(null, t)).toBe('common.genericError');
  });
});
