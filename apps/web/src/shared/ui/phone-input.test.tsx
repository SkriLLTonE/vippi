import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { PhoneInput } from './phone-input';

function Harness({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <PhoneInput aria-label="phone" value={value} onChange={setValue} />
      <output>{value}</output>
    </>
  );
}

describe('PhoneInput', () => {
  it('shows a stored E.164 phone formatted', () => {
    render(<Harness initial="+998901234567" />);
    expect(screen.getByLabelText('phone')).toHaveValue('+998 (90) 123-45-67');
  });

  it('is empty until focused, then shows the fixed prefix; clearing emits an empty value', async () => {
    const user = userEvent.setup();
    render(<Harness initial="+998901234567" />);
    const input = screen.getByLabelText('phone');
    await user.clear(input);
    expect(input).toHaveValue('+998 ');
    expect(screen.getByRole('status')).toHaveTextContent('');
    await user.tab();
    expect(input).toHaveValue('');
  });

  it.each(['998901234567', '90 123-45-67', '8 (90) 123 45 67'])('accepts a pasted %j', async (text) => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByLabelText('phone'));
    await user.paste(text);
    expect(screen.getByLabelText('phone')).toHaveValue('+998 (90) 123-45-67');
    expect(screen.getByRole('status')).toHaveTextContent('+998901234567');
  });
});
