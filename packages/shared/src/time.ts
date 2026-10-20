import { ORG_TIMEZONE } from './enums.js';

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** ISO weekday 1 (Mon) … 7 (Sun) */
  weekday: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatterCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
    });
    formatterCache.set(tz, f);
  }
  return f;
}

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export function zonedParts(date: Date, tz: string = ORG_TIMEZONE): ZonedParts {
  const parts = formatter(tz).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '0';
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    second: Number(get('second')),
    weekday: WEEKDAYS[get('weekday')] ?? 1,
  };
}

/** Offset of tz from UTC at the given instant, in minutes (Asia/Tashkent → 300). */
export function tzOffsetMinutes(date: Date, tz: string = ORG_TIMEZONE): number {
  const p = zonedParts(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60_000);
}

/** Wall-clock time in tz → UTC instant. */
export function zonedTimeToUtc(
  local: { year: number; month: number; day: number; hour?: number; minute?: number },
  tz: string = ORG_TIMEZONE,
): Date {
  const guess = Date.UTC(local.year, local.month - 1, local.day, local.hour ?? 0, local.minute ?? 0);
  const offset = tzOffsetMinutes(new Date(guess), tz);
  const result = new Date(guess - offset * 60_000);
  const offset2 = tzOffsetMinutes(result, tz);
  return offset2 === offset ? result : new Date(guess - offset2 * 60_000);
}

export function parseDateOnly(value: string): { year: number; month: number; day: number } {
  const [y, m, d] = value.split('-').map(Number);
  return { year: y ?? 1970, month: m ?? 1, day: d ?? 1 };
}

/** 'YYYY-MM-DD' in tz → UTC instant of local midnight. */
export function startOfZonedDay(dateOnly: string, tz: string = ORG_TIMEZONE): Date {
  return zonedTimeToUtc(parseDateOnly(dateOnly), tz);
}

export function zonedDateString(date: Date, tz: string = ORG_TIMEZONE): string {
  const p = zonedParts(date, tz);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

export function addDaysToDateString(dateOnly: string, days: number): string {
  const { year, month, day } = parseDateOnly(dateOnly);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return d.toISOString().slice(0, 10);
}

/** Period [from, to] inclusive (local dates) → UTC half-open interval [start, end). */
export function zonedPeriodToUtc(
  from: string,
  to: string,
  tz: string = ORG_TIMEZONE,
): { start: Date; end: Date } {
  return { start: startOfZonedDay(from, tz), end: startOfZonedDay(addDaysToDateString(to, 1), tz) };
}

/** DD.MM.YYYY HH:mm in tz (FR-081). */
export function formatDateTimeTz(value: Date | string, tz: string = ORG_TIMEZONE): string {
  const p = zonedParts(typeof value === 'string' ? new Date(value) : value, tz);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(p.day)}.${pad(p.month)}.${p.year} ${pad(p.hour)}:${pad(p.minute)}`;
}
