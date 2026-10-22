import { screen, waitFor, within } from '@testing-library/react';
import { INDUSTRY_TEMPLATES, type LeadFieldDef } from '@vippi/shared';
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
  me.organization.industry = 'OTHER';
  me.organization.industryPreset = 'GENERIC';
  me.organization.leadFields = [SERVICE, TIME, HIDDEN];
  return me;
}

describe('CreateLeadButton (FR-010, ADR-024)', () => {
  it('placeholders follow the industry sample, not real estate (ADR-025)', async () => {
    mockApi({});
    const me = makeMe('MANAGER');
    me.organization.industry = 'BEAUTY_SALON';
    me.organization.industryPreset = 'GENERIC';
    me.organization.leadFields = INDUSTRY_TEMPLATES.BEAUTY_SALON.fields;
    const { user } = renderWithProviders(<CreateLeadButton />, { me });
    await user.click(screen.getByRole('button', { name: 'Новый лид' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Текст заявки')).toHaveAttribute(
      'placeholder',
      'Например: Хочу записаться на маникюр в субботу после обеда',
    );
    expect(within(dialog).getByLabelText('Услуга')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Мастер')).toBeInTheDocument();
    expect(within(dialog).queryByLabelText('Район')).not.toBeInTheDocument();
  });

  it('real-estate orgs keep district, property type and rooms', async () => {
    mockApi({});
    const { user } = renderWithProviders(<CreateLeadButton />, { me: makeMe('MANAGER') });
    await user.click(screen.getByRole('button', { name: 'Новый лид' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Район')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Тип недвижимости')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Комнат')).toBeInTheDocument();
  });

  it('masks the phone and submits it normalized', async () => {
    const { calls } = mockApi({ 'POST /leads': () => ({ status: 201, body: makeLead({ id: 'lead-7', number: 7 }) }) });
    const { user } = renderWithProviders(<CreateLeadButton />, {
      me: makeMe('MANAGER'),
      extraRoutes: [{ path: '/leads/:id', element: <p>lead page</p> }],
    });
    await user.click(screen.getByRole('button', { name: 'Новый лид' }));
    const dialog = await screen.findByRole('dialog');
    const phone = within(dialog).getByLabelText('Телефон');
    expect(phone).toHaveAttribute('type', 'tel');
    expect(phone).toHaveAttribute('placeholder', '+998 (90) 123-45-67');

    await user.type(phone, '90abc12');
    expect(phone).toHaveValue('+998 (90) 12');
    await user.click(within(dialog).getByRole('button', { name: 'Создать лид' }));
    expect(await within(dialog).findByText('Введите узбекский номер: +998 и 9 цифр')).toBeInTheDocument();
    expect(calls).toHaveLength(0);

    await user.type(phone, '345678999');
    expect(phone).toHaveValue('+998 (90) 123-45-67');
    await user.type(phone, '{Backspace}{Backspace}{Backspace}');
    expect(phone).toHaveValue('+998 (90) 123-4');
    await user.clear(phone);
    await user.paste('+998 93 000 11 22');
    expect(phone).toHaveValue('+998 (93) 000-11-22');

    await user.click(within(dialog).getByRole('button', { name: 'Создать лид' }));
    expect(await screen.findByText('lead page')).toBeInTheDocument();
    expect(calls[0]?.body).toMatchObject({ phone: '+998930001122' });
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
