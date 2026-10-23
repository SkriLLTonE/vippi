/**
 * Curated organization time zones (IANA): Uzbekistan first, then neighbours/CIS clients, then UTC.
 * None of them observe DST, so the UTC offset is fixed (checked against Intl in tests).
 * Labels are translated in the web app (`org.tz.<id>`).
 */
export const TIMEZONES = [
  'Asia/Tashkent',
  'Asia/Samarkand',
  'Asia/Almaty',
  'Asia/Bishkek',
  'Asia/Dushanbe',
  'Asia/Ashgabat',
  'Europe/Moscow',
  'Asia/Yekaterinburg',
  'Asia/Dubai',
  'Europe/Istanbul',
  'UTC',
] as const;
export type OrgTimezone = (typeof TIMEZONES)[number];

export const TIMEZONE_UTC_OFFSET_HOURS: Record<OrgTimezone, number> = {
  'Asia/Tashkent': 5,
  'Asia/Samarkand': 5,
  'Asia/Almaty': 5,
  'Asia/Bishkek': 6,
  'Asia/Dushanbe': 5,
  'Asia/Ashgabat': 5,
  'Europe/Moscow': 3,
  'Asia/Yekaterinburg': 5,
  'Asia/Dubai': 4,
  'Europe/Istanbul': 3,
  UTC: 0,
};

export function isOrgTimezone(value: string): value is OrgTimezone {
  return (TIMEZONES as readonly string[]).includes(value);
}

/** 5 → 'UTC+5', -3 → 'UTC-3', 0 → 'UTC'. */
export function formatUtcOffset(hours: number): string {
  if (hours === 0) return 'UTC';
  return `UTC${hours > 0 ? '+' : '-'}${Math.abs(hours)}`;
}
