import { screen, waitFor } from '@testing-library/react';
import i18n from 'i18next';
import { useTranslation } from 'react-i18next';
import { describe, expect, it } from 'vitest';
import { apiError, makeMe, mockApi, renderWithProviders } from '../../../../test/utils';
import { LocaleSwitch } from './locale-switch';

function Probe() {
  const { t } = useTranslation();
  return (
    <>
      <LocaleSwitch />
      <p data-testid="probe">{t('auth.login')}</p>
    </>
  );
}

describe('LocaleSwitch (FR-080)', () => {
  it('switches the interface language and <html lang> for guests without calling the API', async () => {
    const { calls } = mockApi({});
    const { user } = renderWithProviders(<Probe />, { me: null });
    expect(screen.getByTestId('probe')).toHaveTextContent('Войти');
    await user.click(screen.getByRole('radio', { name: 'UZ' }));
    expect(screen.getByTestId('probe')).toHaveTextContent('Kirish');
    expect(document.documentElement.lang).toBe('uz');
    expect(window.localStorage.getItem('vippi.locale')).toBe('uz');
    expect(calls).toHaveLength(0);
  });

  it('saves the choice to the profile for signed-in users', async () => {
    const { calls } = mockApi({ 'PATCH /me': () => ({ status: 204 }) });
    const { user } = renderWithProviders(<Probe />, { me: makeMe() });
    await user.click(screen.getByRole('radio', { name: 'UZ' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toEqual({ locale: 'uz' });
  });

  it('reports a failed save', async () => {
    mockApi({ 'PATCH /me': () => apiError(500, 'INTERNAL_ERROR') });
    const { user } = renderWithProviders(<Probe />, { me: makeMe() });
    await user.click(screen.getByRole('radio', { name: 'UZ' }));
    expect(await screen.findByText(i18n.t('errors.INTERNAL_ERROR', { lng: 'uz' }))).toBeInTheDocument();
  });
});
