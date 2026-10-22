import { screen, waitFor, within } from '@testing-library/react';
import { INDUSTRY_TEMPLATES, type ApiKeyDto } from '@vippi/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeMe, mockApi, renderWithProviders } from '../../../../test/utils';
import { SettingsApiKeysPage } from './settings-api-keys-page';

const clipboard = vi.hoisted(() => ({ copied: [] as string[] }));
vi.mock('@/shared/lib/clipboard', () => ({
  copyText: async (text: string) => {
    clipboard.copied.push(text);
    return true;
  },
  copyTextFrom: async (load: () => Promise<string>) => {
    clipboard.copied.push(await load());
    return true;
  },
}));

const FULL_KEY = 'vpk_Q8xY2mN4pR7tK1wZ9aB3cD5eF6gH0jL2nP4rS6uVabc';

function apiKey(over: Partial<ApiKeyDto> = {}): ApiKeyDto {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Сайт',
    prefix: FULL_KEY.slice(0, 12),
    createdAt: '2026-10-20T10:00:00.000Z',
    createdBy: { id: 'u1', fullName: 'Owner Person' },
    lastUsedAt: null,
    revokedAt: null,
    last3: 'abc',
    revealable: true,
    ...over,
  };
}

beforeEach(() => {
  clipboard.copied = [];
});

function exampleBody(): Record<string, unknown> {
  const text = screen.getByTestId('intake-example').textContent ?? '';
  const json = /-d '(.*)'$/s.exec(text)?.[1] ?? '{}';
  return JSON.parse(json) as Record<string, unknown>;
}

describe('SettingsApiKeysPage intake example (ADR-025)', () => {
  it('builds the example from the organization industry and its real field keys', async () => {
    mockApi({ 'GET /api-keys': () => ({ body: [] }) });
    const me = makeMe('OWNER');
    const custom = { key: 'deposit', label: { ru: 'Предоплата' }, type: 'money' as const, required: false, showInCreate: true };
    me.organization = {
      ...me.organization,
      industry: 'AUTO',
      industryPreset: 'GENERIC',
      leadFields: [...INDUSTRY_TEMPLATES.AUTO.fields.slice(0, 2), custom],
    };
    renderWithProviders(<SettingsApiKeysPage />, { me });
    expect(await screen.findByText('API-ключей пока нет')).toBeInTheDocument();
    const body = exampleBody();
    expect(body).toMatchObject({
      source: 'WEBSITE',
      message: 'Интересует Chevrolet Cobalt 2024 в рассрочку',
      attributes: { requestType: 'buyNew', carModel: 'Chevrolet Cobalt', deposit: { amount: '1000000', currency: 'UZS' } },
    });
    expect(body).not.toHaveProperty('district');
    expect(screen.getByTestId('intake-example').textContent).not.toMatch(/kvartira|квартир/);
  });

  it('real estate keeps the built-in columns and omits empty attributes', async () => {
    mockApi({ 'GET /api-keys': () => ({ body: [] }) });
    renderWithProviders(<SettingsApiKeysPage />, { me: makeMe('OWNER') });
    await screen.findByText('API-ключей пока нет');
    const body = exampleBody();
    expect(body).toMatchObject({ message: 'Нужна 2-комнатная квартира в Чиланзаре', district: 'CHILONZOR', rooms: 2 });
    expect(body).not.toHaveProperty('attributes');
  });
});

describe('SettingsApiKeysPage key actions', () => {
  it('rows show the masked key and icon actions with accessible names; copy puts the FULL key on the clipboard', async () => {
    const { calls } = mockApi({
      'GET /api-keys': () => ({ body: [apiKey()] }),
      'POST /api-keys/11111111-1111-4111-8111-111111111111/reveal': () => ({ body: { key: FULL_KEY } }),
    });
    const { user } = renderWithProviders(<SettingsApiKeysPage />, { me: makeMe('OWNER') });
    expect(await screen.findByTestId('api-key-mask')).toHaveTextContent(/^vpk_•{12}abc$/);
    expect(screen.queryByText('Отозвать')).not.toBeInTheDocument();
    const del = screen.getByRole('button', { name: 'Удалить ключ «Сайт»' });
    expect(del.querySelector('svg')).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Скопировать ключ «Сайт»' }));
    await waitFor(() => expect(clipboard.copied).toEqual([FULL_KEY]));
    expect(calls.some((c) => c.method === 'POST' && c.path.endsWith('/reveal'))).toBe(true);
    expect(await screen.findByText('Ключ скопирован')).toBeInTheDocument();
  });

  it('delete asks for confirmation, then soft-revokes and the key leaves the list', async () => {
    let list = [apiKey()];
    const { calls } = mockApi({
      'GET /api-keys': () => ({ body: list }),
      'POST /api-keys/11111111-1111-4111-8111-111111111111/revoke': () => {
        list = [];
        return { status: 204 };
      },
    });
    const { user } = renderWithProviders(<SettingsApiKeysPage />, { me: makeMe('OWNER') });
    await user.click(await screen.findByRole('button', { name: 'Удалить ключ «Сайт»' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Удалить ключ «Сайт»?' });
    expect(calls.some((c) => c.path.endsWith('/revoke'))).toBe(false);
    await user.click(within(confirm).getByRole('button', { name: 'Удалить' }));
    expect(await screen.findByText('API-ключей пока нет')).toBeInTheDocument();
    expect(calls.filter((c) => c.path.endsWith('/revoke'))).toHaveLength(1);
  });

  it('key dialog: masked vpk_…abc, eye reveals, copy, rotate after confirm shows the new key', async () => {
    const NEW_KEY = 'vpk_NEWNEWNEWNEWNEWNEWNEWNEWNEWNEWNEWNEWNEWxyz';
    const { calls } = mockApi({
      'GET /api-keys': () => ({ body: [apiKey()] }),
      'POST /api-keys/11111111-1111-4111-8111-111111111111/reveal': () => ({ body: { key: FULL_KEY } }),
      'POST /api-keys/11111111-1111-4111-8111-111111111111/rotate': () => ({
        status: 201,
        body: { ...apiKey({ id: '22222222-2222-4222-8222-222222222222', last3: 'xyz', prefix: NEW_KEY.slice(0, 12) }), key: NEW_KEY },
      }),
    });
    const { user } = renderWithProviders(<SettingsApiKeysPage />, { me: makeMe('OWNER') });
    await user.click(await screen.findByRole('button', { name: 'Сайт' }));
    const dialog = await screen.findByRole('dialog', { name: 'Сайт' });
    const display = within(dialog).getByTestId('api-key-display');
    expect(display).toHaveTextContent(/^vpk_•{12}abc$/);

    await user.click(within(dialog).getByRole('button', { name: 'Показать ключ' }));
    await waitFor(() => expect(display).toHaveTextContent(FULL_KEY));
    await user.click(within(dialog).getByRole('button', { name: 'Скрыть ключ' }));
    expect(display).toHaveTextContent(/^vpk_•{12}abc$/);

    await user.click(within(dialog).getByRole('button', { name: 'Скопировать ключ' }));
    await waitFor(() => expect(clipboard.copied).toEqual([FULL_KEY]));
    expect(calls.filter((c) => c.path.endsWith('/reveal'))).toHaveLength(1);

    await user.click(within(dialog).getByRole('button', { name: 'Обновить ключ' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Обновить ключ «Сайт»?' });
    expect(confirm).toHaveTextContent('Старый ключ перестанет работать сразу');
    expect(calls.some((c) => c.path.endsWith('/rotate'))).toBe(false);
    await user.click(within(confirm).getByRole('button', { name: 'Обновить' }));
    await waitFor(() => expect(within(dialog).getByTestId('api-key-display')).toHaveTextContent(NEW_KEY));
    expect(within(dialog).getByText(/Готово, это новый ключ/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Скопировать ключ' }));
    await waitFor(() => expect(clipboard.copied).toEqual([FULL_KEY, NEW_KEY]));

    // No header X: the single Close button sits in the action row.
    const closes = within(dialog).getAllByRole('button', { name: 'Закрыть' });
    expect(closes).toHaveLength(1);
    await user.click(closes[0]!);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('legacy key without ciphertext: prefix mask, copy disabled with explanation, rotate offered', async () => {
    mockApi({ 'GET /api-keys': () => ({ body: [apiKey({ last3: null, revealable: false })] }) });
    const { user } = renderWithProviders(<SettingsApiKeysPage />, { me: makeMe('OWNER') });
    expect(await screen.findByTestId('api-key-mask')).toHaveTextContent(`${FULL_KEY.slice(0, 12)}…`);
    expect(screen.getByRole('button', { name: 'Скопировать ключ «Сайт»' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Сайт' }));
    const dialog = await screen.findByRole('dialog', { name: 'Сайт' });
    expect(within(dialog).getByText(/создан до обновления/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Скопировать ключ' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Обновить ключ' })).toBeEnabled();
  });
});
