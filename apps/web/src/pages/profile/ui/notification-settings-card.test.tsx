import type { NotificationSettingsDto } from '@vippi/shared';
import { screen, waitFor } from '@testing-library/react';
import i18n from 'i18next';
import { describe, expect, it } from 'vitest';
import { makeMe, mockApi, renderWithProviders } from '../../../../test/utils';
import { NotificationSettingsCard } from './notification-settings-card';

const t = (key: string, opts?: Record<string, unknown>) => i18n.t(key, { lng: 'ru', ...opts });

function settings(overrides: Partial<NotificationSettingsDto> = {}): NotificationSettingsDto {
  return {
    channels: { push: true, email: true },
    vapidPublicKey: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U',
    emailEnabled: false,
    email: 'owner@example.test',
    pushSubscriptions: 0,
    ...overrides,
  };
}

describe('NotificationSettingsCard (ADR-023)', () => {
  it('turns email notifications on', async () => {
    const { calls } = mockApi({
      'GET /notifications/settings': () => ({ body: settings() }),
      'PATCH /notifications/settings': () => ({ body: settings({ emailEnabled: true }) }),
    });
    const { user } = renderWithProviders(<NotificationSettingsCard />, { me: makeMe() });
    const toggle = await screen.findByRole('switch', {
      name: t('notifSettings.emailLabel', { email: 'owner@example.test' }),
    });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    await user.click(toggle);
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'));
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ emailEnabled: true });
  });

  it('explains channels that are not configured on the server', async () => {
    mockApi({
      'GET /notifications/settings': () => ({
        body: settings({ channels: { push: false, email: false }, vapidPublicKey: null }),
      }),
    });
    renderWithProviders(<NotificationSettingsCard />, { me: makeMe() });
    expect(await screen.findByText(t('notifSettings.pushNotConfigured'))).toBeInTheDocument();
    expect(screen.getByText(t('notifSettings.emailNotConfigured'))).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: t('notifSettings.pushLabel') })).toBeDisabled();
    expect(screen.getByRole('button', { name: t('notifSettings.test') })).toBeDisabled();
  });

  it('disables push in a browser without the Push API', async () => {
    mockApi({ 'GET /notifications/settings': () => ({ body: settings() }) });
    renderWithProviders(<NotificationSettingsCard />, { me: makeMe() });
    expect(await screen.findByText(t('notifSettings.pushUnsupported'))).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: t('notifSettings.pushLabel') })).toBeDisabled();
  });

  it('warns when a test has no channel to deliver to', async () => {
    mockApi({
      'GET /notifications/settings': () => ({ body: settings() }),
      'POST /notifications/test': () => ({ body: { push: 0, email: false } }),
    });
    const { user } = renderWithProviders(<NotificationSettingsCard />, { me: makeMe() });
    await user.click(await screen.findByRole('button', { name: t('notifSettings.test') }));
    expect(await screen.findByText(t('notifSettings.testNothing'))).toBeInTheDocument();
  });
});
