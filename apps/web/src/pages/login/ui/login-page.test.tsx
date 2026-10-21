import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { apiError, makeMe, mockApi, renderWithProviders } from '../../../../test/utils';
import { LoginPage } from './login-page';

const routes = [
  { path: '/dashboard', element: <p>dashboard page</p> },
  { path: '/leads', element: <p>leads page</p> },
  { path: '/leads/:id', element: <p>lead page</p> },
];

describe('LoginPage (FR-002)', () => {
  it('shows field errors on empty submit and sends nothing', async () => {
    const { calls } = mockApi({});
    const { user } = renderWithProviders(<LoginPage />, { path: '/login', me: null, extraRoutes: routes });
    await user.click(screen.getByRole('button', { name: 'Войти' }));
    expect(await screen.findAllByText('Обязательное поле')).toHaveLength(2);
    expect(calls).toHaveLength(0);
  });

  it('validates the email format', async () => {
    mockApi({});
    const { user } = renderWithProviders(<LoginPage />, { path: '/login', me: null });
    await user.type(screen.getByLabelText('Электронная почта'), 'not-an-email');
    await user.type(screen.getByLabelText('Пароль'), 'whatever-123');
    await user.click(screen.getByRole('button', { name: 'Войти' }));
    expect(await screen.findByText('Введите email в формате name@company.uz')).toBeInTheDocument();
  });

  it('shows the invalid credentials message from the server', async () => {
    mockApi({ 'POST /auth/login': () => apiError(401, 'INVALID_CREDENTIALS') });
    const { user } = renderWithProviders(<LoginPage />, { path: '/login', me: null });
    await user.type(screen.getByLabelText('Электронная почта'), 'owner@example.test');
    await user.type(screen.getByLabelText('Пароль'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Войти' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Неверный email или пароль');
  });

  it('on success goes to the dashboard for owners', async () => {
    const { calls } = mockApi({ 'POST /auth/login': () => ({ body: makeMe('OWNER') }) });
    const { user } = renderWithProviders(<LoginPage />, { path: '/login', me: null, extraRoutes: routes });
    await user.type(screen.getByLabelText('Электронная почта'), 'owner@example.test');
    await user.type(screen.getByLabelText('Пароль'), 'correct-password');
    await user.click(screen.getByRole('button', { name: 'Войти' }));
    expect(await screen.findByText('dashboard page')).toBeInTheDocument();
    expect(calls[0]?.body).toEqual({ email: 'owner@example.test', password: 'correct-password' });
  });

  it('honours a safe ?next= and ignores external redirects', async () => {
    mockApi({ 'POST /auth/login': () => ({ body: makeMe('MANAGER') }) });
    const first = renderWithProviders(<LoginPage />, {
      path: '/login',
      route: '/login?next=/leads/abc',
      me: null,
      extraRoutes: routes,
    });
    await first.user.type(screen.getByLabelText('Электронная почта'), 'm@example.test');
    await first.user.type(screen.getByLabelText('Пароль'), 'correct-password');
    await first.user.click(screen.getByRole('button', { name: 'Войти' }));
    expect(await screen.findByText('lead page')).toBeInTheDocument();
    first.unmount();

    const second = renderWithProviders(<LoginPage />, {
      path: '/login',
      route: '/login?next=//evil.example',
      me: null,
      extraRoutes: routes,
    });
    await second.user.type(screen.getByLabelText('Электронная почта'), 'm@example.test');
    await second.user.type(screen.getByLabelText('Пароль'), 'correct-password');
    await second.user.click(screen.getByRole('button', { name: 'Войти' }));
    await waitFor(() => expect(second.router.state.location.pathname).toBe('/leads'));
    expect(second.router.state.location.search).toBe('?assigneeId=me');
  });

  it('explains an expired session', () => {
    mockApi({});
    renderWithProviders(<LoginPage />, { path: '/login', route: '/login?expired=1', me: null });
    expect(screen.getByText('Сессия истекла. Войдите снова, чтобы продолжить')).toBeInTheDocument();
  });

  it('shows a network error instead of failing silently', async () => {
    const { fetchMock } = mockApi({});
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const { user } = renderWithProviders(<LoginPage />, { path: '/login', me: null });
    await user.type(screen.getByLabelText('Электронная почта'), 'owner@example.test');
    await user.type(screen.getByLabelText('Пароль'), 'correct-password');
    await user.click(screen.getByRole('button', { name: 'Войти' }));
    expect(await screen.findByRole('alert')).not.toBeEmptyDOMElement();
  });
});
