import { useLayoutEffect, useRef, useState, type ChangeEvent, type InputHTMLAttributes, type Ref } from 'react';
import { applyPhoneEdit, formatPhoneMask, phoneCaretPosition, phoneLocalDigits, phoneMaskValue } from '../lib';
import { Input } from './input';

type PhoneInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'defaultValue' | 'onChange' | 'type'> & {
  ref?: Ref<HTMLInputElement>;
  /** `+998XXXXXXXXX` (or a partial `+998…` while typing); empty when no digits. */
  value: string | null | undefined;
  onChange: (value: string) => void;
};

/** Masked UZ phone input `+998 (XX) XXX-XX-XX`; the `+998` prefix is fixed, only 9 local digits are accepted. */
export function PhoneInput({ value, onChange, onFocus, onBlur, onSelect, ref, placeholder = '+998 (90) 123-45-67', ...props }: PhoneInputProps) {
  const local = phoneLocalDigits(value ?? '');
  const [focused, setFocused] = useState(false);
  const inner = useRef<HTMLInputElement | null>(null);
  const pendingCaret = useRef<number | null>(null);
  const display = local || focused ? formatPhoneMask(local) : '';
  const minCaret = phoneCaretPosition('', 0);

  useLayoutEffect(() => {
    const el = inner.current;
    const pos = pendingCaret.current;
    pendingCaret.current = null;
    if (el && pos !== null && document.activeElement === el) el.setSelectionRange(pos, pos);
  });

  const setRef = (el: HTMLInputElement | null) => {
    inner.current = el;
    if (typeof ref === 'function') ref(el);
    else if (ref) ref.current = el;
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const el = e.target;
    const inputType = (e.nativeEvent as Partial<InputEvent>).inputType;
    const next = applyPhoneEdit(local, el.value, el.selectionEnd, inputType);
    // Write the masked value synchronously so the caret is not thrown to the end when nothing changes.
    el.value = formatPhoneMask(next.local);
    el.setSelectionRange(next.caret, next.caret);
    pendingCaret.current = next.caret;
    if (next.local !== local) onChange(phoneMaskValue(next.local));
  };

  return (
    <Input
      {...props}
      ref={setRef}
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      placeholder={placeholder}
      value={display}
      onChange={handleChange}
      onFocus={(e) => {
        setFocused(true);
        if (!local) pendingCaret.current = minCaret;
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
      onSelect={(e) => {
        const el = e.currentTarget;
        if (el.value && el.selectionStart === el.selectionEnd && (el.selectionStart ?? 0) < minCaret) el.setSelectionRange(minCaret, minCaret);
        onSelect?.(e);
      }}
    />
  );
}
