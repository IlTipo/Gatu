import type { TFunction } from 'i18next';

// Trasforma gli errori tecnici (Supabase, rete) in messaggi semplici in italiano.

const CODE_TO_KEY = {
  invalid_credentials: 'auth.errors.invalidCredentials',
  email_not_confirmed: 'auth.errors.emailNotConfirmed',
  user_already_exists: 'auth.errors.userAlreadyExists',
  email_exists: 'auth.errors.userAlreadyExists',
  weak_password: 'auth.errors.weakPassword',
  over_request_rate_limit: 'auth.errors.rateLimited',
  over_email_send_rate_limit: 'auth.errors.rateLimited',
  validation_failed: 'auth.errors.emailInvalid',
  // codici restituiti dalle Edge Functions (vedi supabase/functions)
  invalid_url: 'errors.invalidUrl',
  unauthorized: 'errors.unauthorized',
  network: 'common.networkError',
  function_unavailable: 'errors.functionUnavailable',
  not_found: 'errors.notFound',
  internal_error: 'common.genericError',
  invalid_image: 'errors.invalidImage',
  invalid_video: 'errors.invalidVideo',
  quota_exceeded: 'recipe.aiSkipped.quota_exceeded',
  ai_not_configured: 'recipe.aiSkipped.not_configured',
  no_kcal: 'diary.noKcal',
  feedback_limit: 'feedback.limit',
  report_limit: 'social.reportLimit',
  discover_busy: 'nearby.discoverBusy',
  discover_failed: 'nearby.discoverFailed',
  too_large: 'errors.tooLarge',
  not_configured: 'errors.notConfigured',
} as const;

type ErrorLike = { code?: unknown; message?: unknown; name?: unknown; status?: unknown };

export function errorMessage(error: unknown, t: TFunction): string {
  if (!error) return t('common.genericError');
  const e = error as ErrorLike;
  if (typeof e.code === 'string' && e.code in CODE_TO_KEY) {
    return t(CODE_TO_KEY[e.code as keyof typeof CODE_TO_KEY]);
  }
  if (e.name === 'LocationDeniedError') return t('errors.locationDenied');
  if (e.name === 'VideoTooLargeError') return t('errors.videoTooLarge');
  if (e.name === 'VideoTypeError') return t('errors.invalidVideo');
  const message = typeof e.message === 'string' ? e.message : '';
  // limiti anti-spam del database (segui, commenti, mi piace, blocchi…)
  if (/too many (actions|comments)/i.test(message)) return t('errors.tooMany');
  if (e.name === 'AuthRetryableFetchError' || /network request failed|failed to fetch/i.test(message)) {
    return t('common.networkError');
  }
  return t('common.genericError');
}
