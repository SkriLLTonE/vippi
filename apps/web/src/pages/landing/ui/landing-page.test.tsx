import { screen } from '@testing-library/react';
import i18n from 'i18next';
import { describe, expect, it, vi } from 'vitest';
import { apiError, makeMe, mockApi, renderWithProviders } from '../../../../test/utils';
import { LandingPage } from './landing-page';

describe('LandingPage', () => {
  it('offers sign-in and registration to guests', () => {
    mockApi({});
    renderWithProviders(<LandingPage />, { me: null });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Каждая заявка. Вовремя.');
    for (const link of screen.getAllByRole('link', { name: 'Войти' })) expect(link).toHaveAttribute('href', '/login');
    const register = screen.getAllByRole('link', { name: 'Зарегистрировать компанию' });
    expect(register.length).toBeGreaterThan(0);
    for (const link of register) expect(link).toHaveAttribute('href', '/register');
    expect(screen.queryByRole('link', { name: /Открыть дашборд|Мои лиды/ })).not.toBeInTheDocument();
  });

  it('keeps the scroll stories readable and lets keyboard users jump between graph steps', async () => {
    mockApi({});
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const { user } = renderWithProviders(<LandingPage />, { me: null });
    for (const title of ['Все заявки. В\u00a0одном списке.', '15 минут на первый ответ.', 'Руководитель видит цифры.'])
      expect(screen.getByRole('heading', { level: 3, name: title })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Пропустить' })).toHaveAttribute('href', '#lp-after-graph');
    const first = screen.getByRole('button', { name: /Все заявки в одном месте/ });
    expect(first).toHaveAttribute('aria-current', 'step');
    const timer = screen.getByRole('button', { name: /Таймер первого ответа/ });
    expect(timer).not.toHaveAttribute('aria-current');
    timer.focus();
    await user.keyboard('{Enter}');
    expect(scrollTo).toHaveBeenCalledTimes(1);
    scrollTo.mockRestore();
  });

  it('shows the dashboard button instead of sign-in for an owner', () => {
    mockApi({});
    renderWithProviders(<LandingPage />, { me: makeMe('OWNER') });
    const links = screen.getAllByRole('link', { name: 'Открыть дашборд' });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(link).toHaveAttribute('href', '/dashboard');
    expect(screen.queryByRole('link', { name: 'Войти' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Зарегистрировать компанию' })).not.toBeInTheDocument();
    expect(screen.getByText('Вы вошли как Owner Person · Test Agency')).toBeInTheDocument();
  });

  it('sends a manager without dashboard access to their own leads', () => {
    mockApi({});
    renderWithProviders(<LandingPage />, { me: makeMe('MANAGER') });
    const links = screen.getAllByRole('link', { name: 'Мои лиды' });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(link).toHaveAttribute('href', '/leads?assigneeId=me');
    expect(screen.queryByRole('link', { name: 'Открыть дашборд' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Войти' })).not.toBeInTheDocument();
  });

  it('signs a user out and stays on the landing with the guest actions', async () => {
    const { calls } = mockApi({ 'POST /auth/logout': () => ({ status: 204 }) });
    const { user, router } = renderWithProviders(<LandingPage />, { me: makeMe('OWNER') });
    await user.click(screen.getByRole('button', { name: 'Выйти' }));
    expect((await screen.findAllByRole('link', { name: 'Войти' }))[0]).toHaveAttribute('href', '/login');
    expect(screen.getAllByRole('link', { name: 'Зарегистрировать компанию' })[0]).toHaveAttribute('href', '/register');
    expect(screen.queryByRole('link', { name: 'Открыть дашборд' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Выйти' })).not.toBeInTheDocument();
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(['POST /auth/logout']);
    expect(router.state.location.pathname).toBe('/');
  });

  it('keeps the session and reports a failed logout', async () => {
    mockApi({ 'POST /auth/logout': () => apiError(500, 'INTERNAL_ERROR') });
    const { user } = renderWithProviders(<LandingPage />, { me: makeMe('OWNER') });
    await user.click(screen.getByRole('button', { name: 'Выйти' }));
    expect(await screen.findByText(i18n.t('errors.INTERNAL_ERROR'))).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Открыть дашборд' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: 'Войти' })).not.toBeInTheDocument();
  });
});
