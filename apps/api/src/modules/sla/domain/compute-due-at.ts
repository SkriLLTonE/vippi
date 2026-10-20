import { addDaysToDateString, ORG_TIMEZONE, zonedDateString, zonedParts, zonedTimeToUtc } from '@vippi/shared';
import type { SlaPolicyLike } from '@vippi/shared';

const MAX_ITERATIONS = 400;

function windowFor(dateOnly: string, hhmm: string, tz: string): Date {
  const [y, m, d] = dateOnly.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  return zonedTimeToUtc({ year: y ?? 1970, month: m ?? 1, day: d ?? 1, hour: h ?? 0, minute: mi ?? 0 }, tz);
}

/**
 * FR-031/FR-032: deadline = receivedAt + N minutes; with business hours enabled the timer only
 * runs inside working windows of the organization timezone (Asia/Tashkent).
 */
export function computeDueAt(receivedAt: Date, policy: SlaPolicyLike, tz: string = ORG_TIMEZONE): Date {
  const minutes = policy.firstResponseMinutes;
  if (!policy.businessHoursEnabled || policy.workdays.length === 0) {
    return new Date(receivedAt.getTime() + minutes * 60_000);
  }
  let remainingMs = minutes * 60_000;
  let cursor = receivedAt;
  let day = zonedDateString(cursor, tz);
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const weekday = zonedParts(windowFor(day, '12:00', tz), tz).weekday;
    const start = windowFor(day, policy.workStart, tz);
    const end = windowFor(day, policy.workEnd, tz);
    if (policy.workdays.includes(weekday) && cursor < end) {
      const effectiveStart = cursor > start ? cursor : start;
      const available = end.getTime() - effectiveStart.getTime();
      if (remainingMs <= available) return new Date(effectiveStart.getTime() + remainingMs);
      remainingMs -= available;
    }
    day = addDaysToDateString(day, 1);
    cursor = windowFor(day, '00:00', tz);
  }
  return new Date(receivedAt.getTime() + minutes * 60_000);
}

/** SLA state for imported/historical leads (FR-061, AC-056). */
export function historicalSlaState(
  dueAt: Date,
  firstResponseAt: Date | null,
  now: Date,
): { slaState: 'PENDING' | 'MET' | 'BREACHED'; slaBreachedAt: Date | null } {
  if (firstResponseAt) {
    return firstResponseAt <= dueAt
      ? { slaState: 'MET', slaBreachedAt: null }
      : { slaState: 'BREACHED', slaBreachedAt: dueAt };
  }
  if (dueAt <= now) return { slaState: 'BREACHED', slaBreachedAt: dueAt };
  return { slaState: 'PENDING', slaBreachedAt: null };
}
