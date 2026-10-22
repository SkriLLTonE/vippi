import { screen, waitFor, within } from '@testing-library/react';
import type { LeadFieldDef } from '@vippi/shared';
import { describe, expect, it } from 'vitest';
import { apiError, makeLead, makeMe, mockApi, renderWithProviders } from '../../../../test/utils';
import { CreateLeadButton } from './create-lead-dialog';

const SERVICE: LeadFieldDef = {
  key: 'service',
  label: { ru: 'Услуга', uz: 'Xizmat' },
  type: 'single_select',
  required: true,
  showInCreate: true,
  options: [
    { value: 'cleaning', label: { ru: 'Чистка', uz: 'Tozalash' } },
    { value: 'implant', label: { ru: 'Имплант', uz: 'Implant' } },
  ],
};
const TIME: LeadFieldDef = { key: 'preferredTime', label: { ru: 'Удобное время' }, type: 'text', required: false, showInCreate: true };
const HIDDEN: LeadFieldDef = { key: 'internalNote', label: { ru: 'Заметка' }, type: 'text', required: false, showInCreate: false };

function genericMe() {
  const me = makeMe('MANAGER');
  me.organization.industryPreset = 'GENERIC';
  me.organization.leadFields = [SERVICE, TIME, HIDDEN];
  return me;
}

describe('CreateLeadButton (FR-010, ADR-024)', () => {
  it('real-estate orgs keep district, property type and rooms', async () => {
    mockApi({});
    const { user } = renderWithProviders(<CreateLeadButton />, { me: makeMe('MANAGER') });
    await user.click(screen.getByRole('button', { name: 'Новый лид' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Район')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Тип недвижимости')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Комнат')).toBeInTheDocument();
  });

  it('GENERIC orgs see custom fields instead of real-estate fields and send attributes', async () => {
    let attempt = 0;
    const { calls } = mockApi({
      'POST /leads': () =>
        ++attempt === 1
          ? apiError(400, 'VALIDATION_FAILED', [{ path: 'attributes.service', code: 'required', message: 'required' }])
          : { status: 201, body: makeLead({ id: 'lead-9', number: 9 }) },
    });
    const { user } = renderWithProviders(<CreateLeadButton />, {
      me: genericMe(),
      extraRoutes: [{ path: '/leads/:id', element: <p>lead page</p> }],
    });
    await user.click(screen.getByRole('button', { name: 'Новый лид' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByLabelText('Район')).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText('Тип недвижимости')).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText('Комнат')).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText('Бюджет')).toBeInTheDocument();
    expect(within(dialog).queryByLabelText('Заметка')).not.toBeInTheDocument();

    await user.type(within(dialog).getByLabelText('Имя клиента'), 'Malika');
    await user.click(within(dialog).getByRole('button', { name: 'Создать лид' }));
    expect(await within(dialog).findByText('Обязательное поле')).toBeInTheDocument();
    expect(calls[0]?.body).not.toHaveProperty('attributes');
    expect(calls[0]?.body).not.toHaveProperty('district');

    await user.selectOptions(within(dialog).getByLabelText('Услуга *'), 'Имплант');
    await user.type(within(dialog).getByLabelText('Удобное время'), 'вечером');
    await user.click(within(dialog).getByRole('button', { name: 'Создать лид' }));
    expect(await screen.findByText('lead page')).toBeInTheDocument();
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]?.body).toMatchObject({
      fullName: 'Malika',
      attributes: { service: 'implant', preferredTime: 'вечером' },
    });
  });
});
