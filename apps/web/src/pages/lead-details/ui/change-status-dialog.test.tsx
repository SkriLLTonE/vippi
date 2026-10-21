import { screen, waitFor, within } from '@testing-library/react';
import type { LeadDto, Role } from '@vippi/shared';
import { describe, expect, it, vi } from 'vitest';
import { makeLead, makeMe, mockApi, renderWithProviders } from '../../../../test/utils';
import { ChangeStatusDialog } from './change-status-dialog';

function setup(lead: LeadDto, role: Role = 'OWNER') {
  const onOpenChange = vi.fn();
  const api = mockApi({ 'POST /leads/lead-1/status': (c) => ({ body: { ...lead, ...(c.body as object) } }) });
  const r = renderWithProviders(<ChangeStatusDialog lead={lead} open onOpenChange={onOpenChange} />, {
    me: makeMe(role),
  });
  return { ...r, ...api, onOpenChange, dialog: screen.getByRole('dialog') };
}

const radios = (dialog: HTMLElement) =>
  within(dialog)
    .queryAllByRole('radio')
    .map((r) => r.textContent);

describe('ChangeStatusDialog (FR-013)', () => {
  it('offers only allowed transitions from CONTACTED', () => {
    const { dialog } = setup(makeLead({ status: 'CONTACTED' }));
    expect(radios(dialog)).toEqual(['Квалифицирован', 'Сделка', 'Потерян']);
  });

  it('NEW → only LOST, with DUPLICATE/SPAM reasons', async () => {
    const { dialog, user } = setup(makeLead({ status: 'NEW' }), 'MANAGER');
    expect(radios(dialog)).toEqual(['Потерян']);
    const select = within(dialog).getByLabelText('Причина потери');
    const options = within(select)
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(options).toEqual(['Выберите…', 'Дубль', 'Спам']);
    await user.selectOptions(select, 'SPAM');
    expect(select).toHaveValue('SPAM');
  });

  it('requires a lost reason, and a comment for "Другое"', async () => {
    const { dialog, user, calls } = setup(makeLead({ status: 'CONTACTED' }));
    await user.click(within(dialog).getByRole('radio', { name: 'Потерян' }));
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));
    expect(within(dialog).getByText('Выберите причину потери')).toBeInTheDocument();
    await user.selectOptions(within(dialog).getByLabelText('Причина потери'), 'OTHER');
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));
    expect(within(dialog).getByText('Опишите причину в комментарии')).toBeInTheDocument();
    expect(calls).toHaveLength(0);
    await user.type(
      within(dialog).getByLabelText('Комментарий (обязательно для «Другое»)'),
      'Передумал покупать',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toEqual({
      status: 'LOST',
      lostReason: 'OTHER',
      lostComment: 'Передумал покупать',
    });
  });

  it('submits a simple transition and closes', async () => {
    const { dialog, user, calls, onOpenChange } = setup(makeLead({ status: 'CONTACTED' }));
    await user.click(within(dialog).getByRole('radio', { name: 'Квалифицирован' }));
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(calls[0]?.body).toEqual({ status: 'QUALIFIED' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(await screen.findByText('Статус изменён: Квалифицирован')).toBeInTheDocument();
  });

  it('managers cannot reopen a closed lead', () => {
    const { dialog } = setup(makeLead({ status: 'LOST', lostReason: 'SPAM' }), 'MANAGER');
    expect(within(dialog).getByText('Из этого статуса нельзя перейти в другой')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Сохранить' })).toBeDisabled();
  });

  it('heads of sales can reopen a closed lead', () => {
    const { dialog } = setup(makeLead({ status: 'LOST', lostReason: 'SPAM' }), 'HEAD_OF_SALES');
    expect(radios(dialog).length).toBeGreaterThan(0);
  });
});
