import { describe, expect, it } from 'vitest';
import type { SlaPolicyLike } from './schemas/sla.js';
import { computeDueAt } from './sla-deadline.js';
import { zonedParts } from './time.js';

/** Local Tashkent wall time (UTC+5, no DST) → Date. */
const tk = (local: string) => new Date(`${local.replace(' ', 'T')}+05:00`);

const policy = (o: Partial<SlaPolicyLike> = {}): SlaPolicyLike => ({
  firstResponseMinutes: 15,
  businessHoursEnabled: true,
  workdays: [1, 2, 3, 4, 5],
  workStart: '09:00',
  workEnd: '18:00',
  ...o,
});

// 2026-10-19 is a Monday; 2026-10-24/25 is the weekend.
const cases: Array<[name: string, received: string, p: Partial<SlaPolicyLike>, due: string]> = [
  // 24/7 timer
  ['24/7: adds minutes', '2026-10-19 10:00', { businessHoursEnabled: false }, '2026-10-19 10:15'],
  ['24/7: ignores weekends', '2026-10-24 03:00', { businessHoursEnabled: false }, '2026-10-24 03:15'],
  ['24/7: crosses midnight', '2026-10-19 23:50', { businessHoursEnabled: false }, '2026-10-20 00:05'],
  [
    '24/7: minimum 1 minute',
    '2026-10-19 10:00',
    { businessHoursEnabled: false, firstResponseMinutes: 1 },
    '2026-10-19 10:01',
  ],
  [
    '24/7: maximum 1440 minutes',
    '2026-10-19 10:00',
    { businessHoursEnabled: false, firstResponseMinutes: 1440 },
    '2026-10-20 10:00',
  ],
  ['24/7: crosses month end', '2026-10-31 23:55', { businessHoursEnabled: false }, '2026-11-01 00:10'],
  [
    'business hours without workdays behave as 24/7',
    '2026-10-24 12:00',
    { workdays: [] },
    '2026-10-24 12:15',
  ],
  // inside and at the edges of the window
  ['inside the window', '2026-10-19 10:00', {}, '2026-10-19 10:15'],
  ['exactly at window start', '2026-10-19 09:00', {}, '2026-10-19 09:15'],
  ['seconds are preserved inside the window', '2026-10-19 10:00:30', {}, '2026-10-19 10:15:30'],
  ['before start of a workday', '2026-10-19 07:30', {}, '2026-10-19 09:15'],
  ['just before start', '2026-10-19 08:59:30', { firstResponseMinutes: 1 }, '2026-10-19 09:01'],
  ['at midnight of a workday', '2026-10-19 00:00', {}, '2026-10-19 09:15'],
  ['deadline lands exactly at window end', '2026-10-19 17:45', {}, '2026-10-19 18:00'],
  ['exactly at window end → next workday', '2026-10-19 18:00', {}, '2026-10-20 09:15'],
  ['one minute before end spills over', '2026-10-19 17:59', {}, '2026-10-20 09:14'],
  ['spills over the end of day', '2026-10-19 17:55', {}, '2026-10-20 09:10'],
  ['late evening → next workday', '2026-10-19 23:00', {}, '2026-10-20 09:15'],
  // weekends
  ['Friday before end spills to Monday', '2026-10-23 17:50', {}, '2026-10-26 09:05'],
  ['Friday night → Monday', '2026-10-23 20:00', {}, '2026-10-26 09:15'],
  ['Saturday noon → Monday', '2026-10-24 12:00', {}, '2026-10-26 09:15'],
  ['Sunday 23:59 → Monday', '2026-10-25 23:59', {}, '2026-10-26 09:15'],
  ['year boundary without holiday calendar', '2026-12-31 17:50', {}, '2027-01-01 09:05'],
  // threshold larger than one window
  [
    '10 h threshold rolls into next day',
    '2026-10-19 09:00',
    { firstResponseMinutes: 600 },
    '2026-10-20 10:00',
  ],
  [
    '24 h of working time spans three days',
    '2026-10-19 09:00',
    { firstResponseMinutes: 1440 },
    '2026-10-21 15:00',
  ],
  [
    '24 h of working time skips the weekend',
    '2026-10-22 09:00',
    { firstResponseMinutes: 1440 },
    '2026-10-26 15:00',
  ],
  // threshold changes and custom schedules
  ['60 min threshold near end of day', '2026-10-19 17:30', { firstResponseMinutes: 60 }, '2026-10-20 09:30'],
  ['5 min threshold near end of day', '2026-10-19 17:30', { firstResponseMinutes: 5 }, '2026-10-19 17:35'],
  [
    'six-day week: Saturday is a workday',
    '2026-10-24 12:00',
    { workdays: [1, 2, 3, 4, 5, 6] },
    '2026-10-24 12:15',
  ],
  ['Sunday-only schedule waits for Sunday', '2026-10-19 10:00', { workdays: [7] }, '2026-10-25 09:15'],
  [
    'custom 08:30–20:00 window',
    '2026-10-19 20:30',
    { workStart: '08:30', workEnd: '20:00' },
    '2026-10-20 08:45',
  ],
  [
    'custom 10:00–19:00 window, at its end',
    '2026-10-19 19:00',
    { workStart: '10:00', workEnd: '19:00' },
    '2026-10-20 10:15',
  ],
];

describe('computeDueAt (FR-030, FR-031, FR-032)', () => {
  it.each(cases)('%s', (_name, received, p, due) => {
    expect(computeDueAt(tk(received), policy(p)).toISOString()).toBe(tk(due).toISOString());
  });

  it('respects the timezone argument (same instant, different organization timezone)', () => {
    const received = new Date('2026-10-19T08:00:00Z'); // 13:00 Tashkent, 08:00 UTC
    expect(computeDueAt(received, policy()).toISOString()).toBe('2026-10-19T08:15:00.000Z');
    expect(computeDueAt(received, policy(), 'UTC').toISOString()).toBe('2026-10-19T09:15:00.000Z');
  });

  it('invariants over two weeks of arrival times: deadline is inside a working window and never early', () => {
    const p = policy();
    const start = tk('2026-10-19 00:00').getTime();
    for (let t = start; t < start + 14 * 24 * 3_600_000; t += 37 * 60_000) {
      const received = new Date(t);
      const due = computeDueAt(received, p);
      expect(due.getTime() - received.getTime()).toBeGreaterThanOrEqual(15 * 60_000);
      const parts = zonedParts(due, 'Asia/Tashkent');
      const minuteOfDay = parts.hour * 60 + parts.minute;
      expect(p.workdays).toContain(parts.weekday);
      expect(minuteOfDay).toBeGreaterThan(9 * 60);
      expect(minuteOfDay).toBeLessThanOrEqual(18 * 60);
      // 24/7 never later than business-hours deadline
      expect(computeDueAt(received, { ...p, businessHoursEnabled: false }).getTime()).toBeLessThanOrEqual(
        due.getTime(),
      );
    }
  });
});
