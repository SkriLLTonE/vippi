import { isApiError } from '../api';
import type { Translate } from './format';

const CODE_LIKE = /^[a-z][a-z0-9_]*$/;

/** API error → user-facing text by `error.code` (SPEC §13.2: UI never shows raw messages). */
export function errorMessage(err: unknown, t: Translate): string {
  if (isApiError(err)) {
    if (err.code === 'RATE_LIMITED' && err.retryAfterSeconds) {
      return t('errors.RATE_LIMITED_retry', { minutes: Math.max(1, Math.ceil(err.retryAfterSeconds / 60)) });
    }
    if (err.code === 'VALIDATION_FAILED' && err.details[0]) {
      return `${t('errors.VALIDATION_FAILED')}: ${validationMessage(err.details[0].code, undefined, t)}`;
    }
    return t(`errors.${err.code}`, { defaultValue: t('errors.generic') });
  }
  return t('errors.generic');
}

/** Translates a Zod/RHF message (`invalid_phone`) or issue type (`too_small`). */
export function validationMessage(message: string | undefined, type: string | undefined, t: Translate): string {
  if (message && CODE_LIKE.test(message)) return t(`validation.${message}`, { defaultValue: t('validation.invalid') });
  if (type && CODE_LIKE.test(type)) return t(`validation.${type}`, { defaultValue: t('validation.invalid') });
  return t('validation.invalid');
}

/** Maps server `details[]` of a 400 response to form fields. */
export function serverFieldErrors(err: unknown): Array<{ path: string; code: string }> {
  if (!isApiError(err) || err.code !== 'VALIDATION_FAILED') return [];
  return err.details.map((d) => ({ path: d.path, code: d.code }));
}
