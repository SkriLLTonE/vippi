import { describe, expect, it } from 'vitest';
import {
  buildLeadSearchText,
  formatPhone,
  normalizeApostrophes,
  normalizePhone,
  normalizeSearchQuery,
} from './text-normalize.js';

describe('normalizePhone (FR-011)', () => {
  it.each([
    ['90 123-45-67', '+998901234567'],
    ['901234567', '+998901234567'],
    ['+998 90 123 45 67', '+998901234567'],
    ['998901234567', '+998901234567'],
    ['(90) 123 45 67', '+998901234567'],
    ['+998-00-123-45-67', '+998001234567'],
    ['  +998 (71) 200 00 00 ', '+998712000000'],
    ['00 000 00 01', '+998000000001'],
  ])('%s → %s', (input, expected) => {
    expect(normalizePhone(input)).toEqual({ ok: true, value: expected });
  });

  it.each(['12345', '+7 900 123 45 67', '99890123456', '9989012345678', 'abc901234567', '', '90.123.45.67'])(
    'rejects %s',
    (input) => {
      expect(normalizePhone(input)).toEqual({ ok: false });
    },
  );

  it('formats for display', () => {
    expect(formatPhone('+998901234567')).toBe('+998 90 123 45 67');
    expect(formatPhone(null)).toBe('');
    expect(formatPhone('+12345')).toBe('+12345');
  });
});

describe('apostrophe and search normalization (FR-017, AC-022)', () => {
  it.each(["Mirzo Ulug'bek", 'Mirzo Ulugʻbek', 'Mirzo Ulugʼbek', 'Mirzo Ulug‘bek', 'Mirzo Ulug’bek', 'Mirzo Ulug`bek'])(
    'normalizes %s',
    (v) => {
      expect(normalizeApostrophes(v)).toBe("Mirzo Ulug'bek");
    },
  );

  it('query with formatted phone matches stored digits', () => {
    const stored = buildLeadSearchText({ fullName: 'Aziz', phone: '+998901234567', message: 'Salom' });
    expect(stored).toContain('998901234567');
    expect(stored.includes(normalizeSearchQuery('901234567'))).toBe(true);
    expect(stored.includes(normalizeSearchQuery('90 123 45 67'))).toBe(true);
  });

  it('text query is lowercased and apostrophes unified', () => {
    const stored = buildLeadSearchText({ message: 'Kvartira Mirzo Ulugʻbek tumanida' });
    expect(stored.includes(normalizeSearchQuery("Mirzo Ulug'bek"))).toBe(true);
  });
});
