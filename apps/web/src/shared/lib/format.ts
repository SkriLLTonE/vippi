import { formatDateTimeTz, formatPhone as formatPhoneE164, zonedDateString, zonedParts } from '@vippi/shared';

export type Translate = (key: string, options?: Record<string, unknown>) => string;

/** DD.MM.YYYY HH:mm in Asia/Tashkent (FR-081). */
export function formatDateTime(iso: string | null | undefined): string {
  return iso ? formatDateTimeTz(iso) : '—';
}

export function formatDate(iso: string): string {
  const p = zonedParts(new Date(iso));
  return `${String(p.day).padStart(2, '0')}.${String(p.month).padStart(2, '0')}.${p.year}`;
}

/** 'YYYY-MM-DD' → 'DD.MM' (chart axis). */
export function formatDayMonth(dateOnly: string): string {
  const [, m, d] = dateOnly.split('-');
  return `${d}.${m}`;
}

export function todayTashkent(): string {
  return zonedDateString(new Date());
}

/** «3 ч 20 мин», «2 д 4 ч», «<1 мин» (UX §8.1 rule 5). */
export function formatDuration(totalSeconds: number, t: Translate): string {
  const minutes = Math.floor(Math.abs(totalSeconds) / 60);
  if (minutes < 1) return t('duration.lessThanMinute');
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) {
    return hours > 0
      ? `${t('duration.d', { count: days })} ${t('duration.h', { count: hours })}`
      : t('duration.d', { count: days });
  }
  if (hours > 0) {
    return mins > 0 ? `${t('duration.h', { count: hours })} ${t('duration.m', { count: mins })}` : t('duration.h', { count: hours });
  }
  return t('duration.m', { count: mins });
}

export function formatRelative(iso: string, now: number, t: Translate): string {
  const seconds = Math.max(0, (now - Date.parse(iso)) / 1000);
  if (seconds < 60) return t('time.justNow');
  return t('time.ago', { duration: formatDuration(seconds, t) });
}

export function groupDigits(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');
}

export function formatMoney(amount: string | number, currency: 'UZS' | 'USD', t: Translate): string {
  return t(`money.${currency}`, { amount: groupDigits(String(amount)) });
}

export function formatPercent(rate: number | null | undefined): string {
  if (rate === null || rate === undefined) return '—';
  return `${Math.round(rate * 1000) / 10}%`;
}

export function formatPhone(phone: string | null | undefined): string {
  return phone ? formatPhoneE164(phone) : '—';
}

export function formatNumber(value: number): string {
  return groupDigits(String(value));
}
