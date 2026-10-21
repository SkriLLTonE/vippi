import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { Dialog } from './dialog';

function Harness({ locked }: { locked?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <Dialog open={open} onOpenChange={setOpen} title="Title" locked={locked}>
        <input aria-label="Field" />
      </Dialog>
    </>
  );
}

describe('Dialog', () => {
  it('moves focus inside on open and returns it to the opener on Escape', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open' });
    await user.click(opener);
    const dialog = await screen.findByRole('dialog', { name: 'Title' });
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('returns focus to the opener after the close button', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open' });
    await user.click(opener);
    await user.click(await screen.findByRole('button', { name: 'Закрыть' }));
    expect(opener).toHaveFocus();
  });

  it('locked dialog ignores Escape and has no close button', async () => {
    const user = userEvent.setup();
    render(<Harness locked />);
    await user.click(screen.getByRole('button', { name: 'Open' }));
    await screen.findByRole('dialog');
    expect(screen.queryByRole('button', { name: 'Закрыть' })).not.toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
