import { describe, expect, it } from 'vitest';
import { applyPhoneEdit, formatPhoneMask, phoneCaretPosition, phoneLocalDigits, phoneMaskValue } from './phone-mask';

/** Simulates an edit on the formatted display: `[from, to)` replaced with `text`, caret ends after it. */
function edit(local: string, from: number, to: number, text: string, inputType?: string) {
  const prev = formatPhoneMask(local);
  const next = prev.slice(0, from) + text + prev.slice(to);
  return applyPhoneEdit(local, next, from + text.length, inputType);
}

describe('phone mask helpers', () => {
  it('formats progressively with a fixed +998 prefix', () => {
    expect(formatPhoneMask('')).toBe('+998 ');
    expect(formatPhoneMask('9')).toBe('+998 (9');
    expect(formatPhoneMask('90')).toBe('+998 (90');
    expect(formatPhoneMask('901')).toBe('+998 (90) 1');
    expect(formatPhoneMask('90123')).toBe('+998 (90) 123');
    expect(formatPhoneMask('901234')).toBe('+998 (90) 123-4');
    expect(formatPhoneMask('901234567')).toBe('+998 (90) 123-45-67');
  });

  it.each([
    ['+998 90 123 45 67', '901234567'],
    ['998901234567', '901234567'],
    ['90 123-45-67', '901234567'],
    ['8 90 123 45 67', '901234567'],
    ['0901234567', '901234567'],
    ['+998901234567', '901234567'],
    ['+99890123', '90123'],
    ['88 123 45 67', '881234567'],
    ['99 812 34 56', '998123456'],
    ['90abc1', '901'],
    ['', ''],
  ])('extracts local digits from %j', (raw, local) => {
    expect(phoneLocalDigits(raw)).toBe(local);
  });

  it('maps local digits to the form value', () => {
    expect(phoneMaskValue('')).toBe('');
    expect(phoneMaskValue('90123')).toBe('+99890123');
    expect(phoneMaskValue('901234567')).toBe('+998901234567');
  });

  it('places the caret after the n-th local digit', () => {
    expect(phoneCaretPosition('', 0)).toBe(5);
    expect(phoneCaretPosition('901234567', 0)).toBe(6);
    expect(phoneCaretPosition('901234567', 2)).toBe(8);
    expect(phoneCaretPosition('901234567', 3)).toBe(11);
    expect(phoneCaretPosition('901234567', 9)).toBe(19);
  });

  describe('applyPhoneEdit', () => {
    it('appends typed digits and ignores non-digits', () => {
      expect(edit('', 5, 5, '9')).toEqual({ local: '9', caret: 7 });
      expect(edit('90', 8, 8, '1')).toEqual({ local: '901', caret: 11 });
      expect(edit('90', 8, 8, 'a')).toEqual({ local: '90', caret: 8 });
    });

    it('rejects a 10th digit', () => {
      expect(edit('901234567', 19, 19, '8').local).toBe('901234567');
      expect(edit('901234567', 10, 10, '8').local).toBe('901234567');
    });

    it('inserts in the middle and keeps the caret after the inserted digit', () => {
      // '+998 (90) 1|23' -> type 5
      expect(edit('90123', 11, 11, '5')).toEqual({ local: '901523', caret: 12 });
      // '+998 (9|' -> type 9 next to an equal digit
      expect(edit('9', 6, 6, '9')).toEqual({ local: '99', caret: 7 });
    });

    it('backspace over a formatting char deletes the previous digit', () => {
      // '+998 (90) |1' -> backspace removes ' ', so '0' goes
      expect(edit('901', 9, 10, '', 'deleteContentBackward')).toEqual({ local: '91', caret: 7 });
      // '+998 (90)| 123-4' -> backspace removes ')'
      expect(edit('901234', 8, 9, '', 'deleteContentBackward')).toEqual({ local: '91234', caret: 7 });
    });

    it('delete over a formatting char deletes the next digit', () => {
      expect(edit('901234', 13, 14, '', 'deleteContentForward')).toEqual({ local: '90123', caret: 13 });
    });

    it('backspace on a digit removes it', () => {
      expect(edit('901', 10, 11, '', 'deleteContentBackward')).toEqual({ local: '90', caret: 8 });
    });

    it('the +998 prefix cannot be deleted', () => {
      expect(edit('90', 4, 5, '', 'deleteContentBackward')).toEqual({ local: '90', caret: 6 });
      expect(edit('90', 3, 4, '', 'deleteContentBackward')).toEqual({ local: '90', caret: 6 });
      expect(edit('', 0, 5, '')).toEqual({ local: '', caret: 5 });
    });

    it('select-all + backspace clears, select-all + type replaces', () => {
      expect(edit('901234567', 0, 19, '')).toEqual({ local: '', caret: 5 });
      expect(edit('901234567', 0, 19, '7')).toEqual({ local: '7', caret: 7 });
    });

    it.each(['+998 90 123 45 67', '998901234567', '90 123-45-67', '8 (90) 123-45-67'])('paste %j into an empty field', (text) => {
      expect(edit('', 5, 5, text)).toEqual({ local: '901234567', caret: 19 });
    });

    it('paste over a selection replaces it; overflow is truncated', () => {
      expect(edit('901234567', 0, 19, '+998 93 000 00 00').local).toBe('930000000');
      expect(edit('90', 8, 8, '1234567890').local).toBe('901234567');
    });

    it('autofill replaces the whole value', () => {
      expect(applyPhoneEdit('', '+998901234567', 13)).toEqual({ local: '901234567', caret: 19 });
    });
  });
});
