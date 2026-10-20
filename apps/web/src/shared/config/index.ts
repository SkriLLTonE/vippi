import type { Locale } from '@vippi/shared';

const rawLocale = import.meta.env.VITE_DEFAULT_LOCALE;

export const env = {
  apiBaseUrl: (import.meta.env.VITE_API_BASE_URL as string | undefined) || '/api/v1',
  defaultLocale: (rawLocale === 'uz' ? 'uz' : 'ru') satisfies Locale as Locale,
} as const;

export const POLL_NOTIFICATIONS_MS = 30_000;
export const POLL_LEADS_MS = 60_000;
export const SLA_TICK_MS = 30_000;
export const DUE_SOON_SECONDS = 5 * 60;
