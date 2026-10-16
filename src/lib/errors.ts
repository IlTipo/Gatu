import type { TFunction } from 'i18next';

// Trasforma gli errori tecnici (Supabase, rete) in messaggi semplici in italiano.

const AUTH_CODE_TO_KEY = {
  invalid_credentials: 'auth.errors.invalidCredentials',
  email_not_confirmed: 'auth.errors.emailNotConfirmed',
  user_already_exists: 'auth.errors.userAlreadyExists',
  email_exists: 'auth.errors.userAlreadyExists',
  weak_password: 'auth.errors.weakPassword',
  over_request_rate_limit: 'auth.errors.rateLimited',
  over_email_send_rate_limit: 'auth.errors.rateLimited',
  validation_failed: 'auth.errors.emailInvalid',
} as const;

type ErrorLike = { code?: unknown; message?: unknown; name?: unknown; status?: unknown };

export function errorMessage(error: unknown, t: TFunction): string {
  if (!error) return t('common.genericError');
  const e = error as ErrorLike;
  if (typeof e.code === 'string' && e.code in AUTH_CODE_TO_KEY) {
    return t(AUTH_CODE_TO_KEY[e.code as keyof typeof AUTH_CODE_TO_KEY]);
  }
  const message = typeof e.message === 'string' ? e.message : '';
  if (e.name === 'AuthRetryableFetchError' || /network request failed|failed to fetch/i.test(message)) {
    return t('common.networkError');
  }
  return t('common.genericError');
}
