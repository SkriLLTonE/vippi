import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { apiError, makeMe, mockApi, renderWithProviders } from '../../../../test/utils';
import { RegisterPage } from './register-page';

async function fill(user: ReturnType<typeof renderWithProviders>['user'], password = 'long-enough-pass') {
  await user.type(screen.getByLabelText('Название компании'), 'Test Agency');
  await user.type(screen.getByLabelText('Ваше имя'), 'Owner Person');
  await user.type(screen.getByLabelText('Электронная почта'), 'owner@example.test');
  await user.type(screen.getByLabelText(/^Пароль/), password);
}

describe('RegisterPage (FR-001)', () => {
  it('requires all fields', async () => {
    const { calls } = mockApi({});
    const { user } = renderWithProviders(<RegisterPage />, { path: '/register', me: null });
    await user.click(screen.getByRole('button', { name: 'Создать компанию' }));
    expect(await screen.findAllByText('Обязательное поле')).toHaveLength(3);
    expect(screen.getByText('Минимум 10 символов')).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it('enforces the password policy on the client', async () => {
    const { calls } = mockApi({});
    const { user } = renderWithProviders(<RegisterPage />, { path: '/register', me: null });
    await fill(user, 'short');
    await user.click(screen.getByRole('button', { name: 'Создать компанию' }));
    expect(await screen.findByText('Минимум 10 символов')).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it('maps EMAIL_TAKEN to the email field with a login link', async () => {
    mockApi({ 'POST /auth/register-organization': () => apiError(409, 'EMAIL_TAKEN') });
    const { user } = renderWithProviders(<RegisterPage />, { path: '/register', me: null });
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Создать компанию' }));
    expect(await screen.findByText(/Этот email уже зарегистрирован/)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Войти' }).length).toBeGreaterThanOrEqual(2);
  });

  it('creates the company and opens the leads onboarding', async () => {
    const { calls } = mockApi({
      'POST /auth/register-organization': () => ({ status: 201, body: makeMe('OWNER') }),
    });
    const { user, router } = renderWithProviders(<RegisterPage />, {
      path: '/register',
      me: null,
      extraRoutes: [{ path: '/leads', element: <p>leads page</p> }],
    });
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Создать компанию' }));
    expect(await screen.findByText('leads page')).toBeInTheDocument();
    expect(router.state.location.search).toBe('?welcome=1');
    expect(calls[0]?.body).toMatchObject({
      organizationName: 'Test Agency',
      email: 'owner@example.test',
      locale: 'ru',
    });
  });
});
