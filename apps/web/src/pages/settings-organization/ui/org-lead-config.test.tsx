import { screen, waitFor, within } from '@testing-library/react';
import type { OrganizationDto } from '@vippi/shared';
import { describe, expect, it } from 'vitest';
import { apiError, makeMe, mockApi, renderWithProviders } from '../../../../test/utils';
import { IndustryCard } from './industry-card';
import { LeadFieldsCard } from './lead-fields-card';
import { StatusLabelsCard } from './status-labels-card';

const org: OrganizationDto = {
  id: 'o-1',
  name: 'Test Agency',
  isDemo: false,
  emailFrom: null,
  aiExternalProcessingEnabled: false,
  timezone: 'Asia/Tashkent',
  industryPreset: 'REAL_ESTATE',
  leadFields: [],
  statusLabels: {},
};

describe('organization lead configuration (ADR-024)', () => {
  it('owner switches the industry preset', async () => {
    const { calls } = mockApi({ 'PATCH /organization': () => ({ body: { ...org, industryPreset: 'GENERIC' } }) });
    const { user } = renderWithProviders(<IndustryCard org={org} editable />, { me: makeMe('OWNER') });
    const save = screen.getByRole('button', { name: 'Сохранить' });
    expect(save).toBeDisabled();
    await user.selectOptions(screen.getByLabelText('Тип бизнеса'), 'Другой бизнес');
    await user.click(save);
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toEqual({ industryPreset: 'GENERIC' });
  });

  it('non-owners see the preset read-only', () => {
    mockApi({});
    renderWithProviders(<IndustryCard org={org} editable={false} />, { me: makeMe('HEAD_OF_SALES') });
    expect(screen.getByLabelText('Тип бизнеса')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Сохранить' })).not.toBeInTheDocument();
  });

  it('owner renames final statuses; empty inputs are omitted', async () => {
    const { calls } = mockApi({ 'PATCH /organization': () => ({ body: org }) });
    const { user } = renderWithProviders(<StatusLabelsCard org={org} editable />, { me: makeMe('OWNER') });
    await user.type(screen.getByLabelText('Успешный итог (рус.)'), 'Записан');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toEqual({ statusLabels: { WON: { ru: 'Записан' } } });
  });

  it('adds a single-select custom field', async () => {
    const me = makeMe('HEAD_OF_SALES');
    const { calls } = mockApi({
      'POST /lead-fields': () => ({ status: 201, body: [] }),
      'GET /auth/me': () => ({ body: me }),
    });
    const { user } = renderWithProviders(<LeadFieldsCard canManage />, { me });
    expect(screen.getByText('Своих полей пока нет')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Добавить поле' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Название (рус.)'), 'Услуга');
    await user.selectOptions(within(dialog).getByLabelText('Тип'), 'Список');
    await user.type(within(dialog).getByLabelText('Вариант 1 (рус.)'), 'Чистка');
    await user.click(within(dialog).getByRole('button', { name: 'Добавить вариант' }));
    await user.type(within(dialog).getByLabelText('Вариант 2 (узб.)'), 'Implant');
    await user.click(within(dialog).getByRole('switch', { name: /Обязательное/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1);
    expect(calls[0]?.body).toEqual({
      key: 'field1',
      label: { ru: 'Услуга' },
      type: 'single_select',
      required: true,
      showInCreate: true,
      options: [
        { value: 'o1', label: { ru: 'Чистка' } },
        { value: 'o2', label: { uz: 'Implant' } },
      ],
    });
  });

  it('validates on the client and maps a taken key from the server', async () => {
    const { calls } = mockApi({ 'POST /lead-fields': () => apiError(409, 'CONFLICT') });
    const { user } = renderWithProviders(<LeadFieldsCard canManage />, { me: makeMe('OWNER') });
    await user.click(screen.getByRole('button', { name: 'Добавить поле' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));
    expect(await within(dialog).findByText('Обязательное поле')).toBeInTheDocument();
    expect(calls).toHaveLength(0);
    await user.type(within(dialog).getByLabelText('Название (рус.)'), 'Время');
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }));
    expect(await within(dialog).findByText('Поле с таким ключом уже есть')).toBeInTheDocument();
  });

  it('lists fields; managers without the permission cannot change them', () => {
    mockApi({});
    const me = makeMe('MANAGER');
    me.organization.leadFields = [
      { key: 'service', label: { ru: 'Услуга' }, type: 'text', required: true, showInCreate: true },
    ];
    renderWithProviders(<LeadFieldsCard canManage={false} />, { me });
    expect(screen.getByText('Услуга')).toBeInTheDocument();
    expect(screen.getByText('Обязательное')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Добавить поле' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Удалить поле/ })).not.toBeInTheDocument();
  });
});
