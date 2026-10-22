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
  industry: 'REAL_ESTATE',
  industryPreset: 'REAL_ESTATE',
  leadFields: [],
  statusLabels: {},
};

describe('organization lead configuration (ADR-024)', () => {
  it('owner switches the industry without template fields', async () => {
    const { calls } = mockApi({ 'PATCH /organization': () => ({ body: { ...org, industry: 'OTHER', industryPreset: 'GENERIC' } }) });
    const { user } = renderWithProviders(<IndustryCard org={org} editable />, { me: makeMe('OWNER') });
    expect(screen.getByRole('button', { name: 'Применить шаблон' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Сменить тип без полей' })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Тип бизнеса'), 'Другой бизнес');
    await user.click(screen.getByRole('button', { name: 'Сменить тип без полей' }));
    await waitFor(() => expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(1));
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ industry: 'OTHER' });
  });

  it('previews the template merge and applies it (ADR-025)', async () => {
    const me = makeMe('OWNER');
    const mine = { key: 'service', label: { ru: 'Моя услуга' }, type: 'text' as const, required: false, showInCreate: true };
    me.organization = { ...me.organization, industry: 'OTHER', industryPreset: 'GENERIC', leadFields: [mine], statusLabels: { WON: { ru: 'Пришёл' } } };
    const current = { ...org, ...me.organization };
    const { calls } = mockApi({
      'POST /organization/industry-template': () => ({
        body: { organization: { ...current, industry: 'DENTAL_CLINIC' }, addedFields: ['preferredTime', 'visitType'], skippedFields: [], statusLabelsChanged: ['LOST'] },
      }),
      'GET /auth/me': () => ({ body: me }),
    });
    const { user } = renderWithProviders(<IndustryCard org={current} editable />, { me });
    await user.selectOptions(screen.getByLabelText('Тип бизнеса'), 'Стоматология');
    const preview = screen.getByTestId('industry-template-preview');
    expect(preview).toHaveTextContent('Шаблон «Стоматология»');
    expect(preview).toHaveTextContent('Будут добавлены поля: Удобное время, Визит');
    expect(preview).toHaveTextContent('Уже есть: Услуга');
    expect(preview).toHaveTextContent('Названия итогов станут: «Не записался»');
    expect(preview).toHaveTextContent('Ваши названия итогов сохранятся: «Пришёл»');

    await user.click(screen.getByRole('switch', { name: 'Заменить мои названия итогов шаблонными' }));
    expect(preview).toHaveTextContent('Названия итогов станут: «Записан» / «Не записался»');
    await user.click(screen.getByRole('button', { name: 'Применить шаблон' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ industry: 'DENTAL_CLINIC', overwriteStatusLabels: true });
  });

  it('warns when template fields do not fit the limit', async () => {
    mockApi({});
    const me = makeMe('OWNER');
    me.organization.leadFields = Array.from({ length: 7 }, (_, i) => ({
      key: `f${i}`,
      label: { ru: `F${i}` },
      type: 'text' as const,
      required: false,
      showInCreate: true,
    }));
    const { user } = renderWithProviders(<IndustryCard org={org} editable />, { me });
    await user.selectOptions(screen.getByLabelText('Тип бизнеса'), 'Образование и курсы');
    expect(screen.getByTestId('industry-template-preview')).toHaveTextContent(
      'Не поместятся (максимум 8 полей): Возраст ученика, Формат, Уровень',
    );
  });

  it('non-owners see the industry read-only', () => {
    mockApi({});
    renderWithProviders(<IndustryCard org={org} editable={false} />, { me: makeMe('HEAD_OF_SALES') });
    expect(screen.getByLabelText('Тип бизнеса')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Применить шаблон' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('industry-template-preview')).not.toBeInTheDocument();
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
