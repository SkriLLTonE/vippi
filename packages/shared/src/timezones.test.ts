import { describe, expect, it } from 'vitest';
import { ORG_TIMEZONE } from './enums.js';
import { UpdateOrganizationSchema } from './schemas/auth.js';
import { tzOffsetMinutes } from './time.js';
import { formatUtcOffset, isOrgTimezone, TIMEZONE_UTC_OFFSET_HOURS, TIMEZONES } from './timezones.js';

describe('organization time zones', () => {
  it('is a short curated list, Uzbekistan first, default included, no duplicates', () => {
    expect(TIMEZONES.slice(0, 2)).toEqual(['Asia/Tashkent', 'Asia/Samarkand']);
    expect(TIMEZONES).toContain(ORG_TIMEZONE);
    expect(TIMEZONES).toContain('UTC');
    expect(new Set(TIMEZONES).size).toBe(TIMEZONES.length);
    expect(TIMEZONES.length).toBeLessThanOrEqual(15);
  });

  it('every zone is a valid IANA name and its fixed offset matches the runtime tz database', () => {
    for (const tz of TIMEZONES) {
      expect(() => new Intl.DateTimeFormat('en-US', { timeZone: tz })).not.toThrow();
      for (const at of ['2026-01-15T12:00:00Z', '2026-07-15T12:00:00Z']) {
        expect(tzOffsetMinutes(new Date(at), tz), `${tz} @ ${at}`).toBe(TIMEZONE_UTC_OFFSET_HOURS[tz] * 60);
      }
    }
  });

  it('formats offsets and recognizes list members', () => {
    expect(formatUtcOffset(5)).toBe('UTC+5');
    expect(formatUtcOffset(3)).toBe('UTC+3');
    expect(formatUtcOffset(0)).toBe('UTC');
    expect(isOrgTimezone('Asia/Tashkent')).toBe(true);
    expect(isOrgTimezone('America/New_York')).toBe(false);
  });

  it('organization update accepts only listed zones', () => {
    expect(UpdateOrganizationSchema.safeParse({ timezone: 'Asia/Almaty' }).success).toBe(true);
    expect(UpdateOrganizationSchema.safeParse({ timezone: 'UTC' }).success).toBe(true);
    expect(UpdateOrganizationSchema.safeParse({ timezone: 'America/New_York' }).success).toBe(false);
    expect(UpdateOrganizationSchema.safeParse({ timezone: 'Mars/Olympus' }).success).toBe(false);
    expect(UpdateOrganizationSchema.safeParse({ timezone: '' }).success).toBe(false);
  });
});
