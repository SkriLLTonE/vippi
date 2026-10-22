/** Uzbekistan-only phone mask `+998 (XX) XXX-XX-XX` (ADR-024/025); the API still normalizes via normalizePhone. */
const PREFIX = '+998';
const PREFIX_DISPLAY = `${PREFIX} `;
const LOCAL_LENGTH = 9;

const digitsOf = (s: string) => s.replace(/\D/g, '');

/** Local 9-digit part from typed, pasted or stored input: drops a leading 998 / trunk 8 / 0 when it is clearly a prefix. */
export function phoneLocalDigits(raw: string): string {
  let d = digitsOf(raw);
  if (raw.trim().startsWith(PREFIX) || (d.length > LOCAL_LENGTH && d.startsWith('998'))) d = d.slice(3);
  else if (d.length > LOCAL_LENGTH && (d.startsWith('8') || d.startsWith('0'))) d = d.slice(1);
  return d.slice(0, LOCAL_LENGTH);
}

/** `901234` -> `+998 (90) 123-4`; separators appear only before the next digit. */
export function formatPhoneMask(local: string): string {
  let out = PREFIX_DISPLAY;
  if (local.length > 0) out += `(${local.slice(0, 2)}`;
  if (local.length > 2) out += `) ${local.slice(2, 5)}`;
  if (local.length > 5) out += `-${local.slice(5, 7)}`;
  if (local.length > 7) out += `-${local.slice(7, 9)}`;
  return out;
}

/** Form/API value: `+998` + typed digits; partial numbers stay invalid for normalizePhone, empty stays empty. */
export function phoneMaskValue(local: string): string {
  return local ? PREFIX + local : '';
}

/** Caret index in the formatted display right after `count` local digits. */
export function phoneCaretPosition(local: string, count: number): number {
  const display = formatPhoneMask(local);
  let seen = 0;
  for (let i = PREFIX_DISPLAY.length; i < display.length; i++) {
    if (!/\d/.test(display[i]!)) continue;
    if (count === 0) return i;
    if (++seen === count) return i + 1;
  }
  return display.length;
}

/** Number of local digits in `display` before position `pos`. */
function localDigitsBefore(display: string, pos: number): number {
  return pos <= PREFIX_DISPLAY.length ? 0 : digitsOf(display.slice(PREFIX_DISPLAY.length, pos)).length;
}

/**
 * Applies a native edit (typing, deletion, paste, autofill) of the formatted display to the local digits.
 * The edit is recovered by diffing the previous display with `next`; `caret` is the selection end after the edit.
 */
export function applyPhoneEdit(
  prevLocal: string,
  next: string,
  caret: number | null,
  inputType?: string,
): { local: string; caret: number } {
  const prev = formatPhoneMask(prevLocal);
  let prefixLen = 0;
  const maxPrefix = Math.min(prev.length, next.length);
  while (prefixLen < maxPrefix && prev[prefixLen] === next[prefixLen]) prefixLen++;
  let suffixLen = 0;
  const maxSuffix = Math.min(prev.length, next.length, caret === null ? Infinity : next.length - caret);
  while (suffixLen < maxSuffix && prev[prev.length - 1 - suffixLen] === next[next.length - 1 - suffixLen]) suffixLen++;
  const start = Math.min(prefixLen, prev.length - suffixLen, next.length - suffixLen);

  let from = localDigitsBefore(prev, start);
  let to = localDigitsBefore(prev, prev.length - suffixLen);
  let inserted = next.slice(start, next.length - suffixLen);
  inserted = digitsOf(inserted).length > 1 ? phoneLocalDigits(inserted) : digitsOf(inserted);

  if (from === to && inserted === '' && start >= PREFIX_DISPLAY.length && next.length < prev.length) {
    // Only a separator was removed: delete the neighbouring digit instead.
    if (inputType === 'deleteContentForward') to = Math.min(from + 1, prevLocal.length);
    else from = Math.max(0, from - 1);
  }

  const kept = prevLocal.slice(0, from) + prevLocal.slice(to);
  inserted = inserted.slice(0, LOCAL_LENGTH - kept.length);
  const local = prevLocal.slice(0, from) + inserted + prevLocal.slice(to);
  return { local, caret: phoneCaretPosition(local, from + inserted.length) };
}
