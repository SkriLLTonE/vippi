/** Apostrophe variants used in Uzbek Latin text: ' ʻ ʼ ‘ ’ ` */
const APOSTROPHES = /['\u02BB\u02BC\u2018\u2019`\u02B9]/g;

export function normalizeApostrophes(value: string): string {
  return value.replace(APOSTROPHES, "'");
}

/** Normalized text used for lead search (FR-017). */
export function normalizeSearchText(value: string): string {
  return normalizeApostrophes(value).toLowerCase().replace(/\s+/g, ' ').trim();
}

export type PhoneNormalizeResult = { ok: true; value: string } | { ok: false };

/**
 * FR-011: strip everything except digits; 9 digits -> +998XXXXXXXXX; 998XXXXXXXXX -> +998XXXXXXXXX.
 * Operator code is not validated (allows synthetic +99800 range in demo data).
 */
export function normalizePhone(raw: string): PhoneNormalizeResult {
  if (!/^[\d\s\-()+]+$/.test(raw.trim())) return { ok: false };
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 9) return { ok: true, value: `+998${digits}` };
  if (digits.length === 12 && digits.startsWith('998')) return { ok: true, value: `+${digits}` };
  return { ok: false };
}

/** +998901234567 -> +998 90 123 45 67 */
export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return '';
  const m = /^\+998(\d{2})(\d{3})(\d{2})(\d{2})$/.exec(e164);
  if (!m) return e164;
  return `+998 ${m[1]} ${m[2]} ${m[3]} ${m[4]}`;
}

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

/** Builds Lead.searchText: name + phone digits (+ local 9-digit part) + message. */
export function buildLeadSearchText(input: {
  fullName?: string | null;
  phone?: string | null;
  message?: string | null;
}): string {
  const parts: string[] = [];
  if (input.fullName) parts.push(input.fullName);
  if (input.phone) {
    const d = digitsOnly(input.phone);
    parts.push(d);
  }
  if (input.message) parts.push(input.message);
  return normalizeSearchText(parts.join(' '));
}

/** Converts a user search query to the form stored in searchText. */
export function normalizeSearchQuery(q: string): string {
  const trimmed = q.trim();
  if (/^[\d\s\-()+]+$/.test(trimmed)) return digitsOnly(trimmed);
  return normalizeSearchText(trimmed);
}
