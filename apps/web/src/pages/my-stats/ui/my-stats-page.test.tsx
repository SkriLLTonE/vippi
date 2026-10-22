import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { apiError, makeMe, makeMyStats, mockApi, renderWithProviders } from '../../../../test/utils';
import { MyStatsPage } from './my-stats-page';

describe('MyStatsPage (FR-056)', () => {
  it('shows my KPIs next to the team average and marks better/worse', async () => {
    mockApi({ 'GET /analytics/me': () => ({ body: makeMyStats() }) });
    renderWithProviders(<MyStatsPage />, { me: makeMe('MANAGER') });
    expect(await screen.findByTestId('my-received')).toHaveTextContent('12');
    expect(screen.getByTestId('team-received')).toHaveTextContent('Среднее по команде: 10,5');
    expect(screen.getByTestId('my-medianFirstResponseSeconds')).toHaveTextContent('8 мин');
    expect(screen.getByTestId('team-medianFirstResponseSeconds')).toHaveTextContent(
      'лучше среднего по команде',
    );
    expect(screen.getByTestId('my-slaMetRate')).toHaveTextContent('90%');
    expect(screen.getByTestId('team-conversionRate')).toHaveTextContent('30%');
    expect(screen.getByTestId('team-conversionRate')).toHaveTextContent('хуже среднего по команде');
    expect(screen.getByTestId('team-note')).toHaveTextContent(
      'Имена и личные показатели коллег не показываются',
    );
    expect(screen.getByRole('img', { name: 'График моих лидов и просрочек за 2 дн.' })).toBeInTheDocument();
  });

  it('requests the chosen period', async () => {
    const { calls } = mockApi({ 'GET /analytics/me': () => ({ body: makeMyStats() }) });
    const { user } = renderWithProviders(<MyStatsPage />, { me: makeMe('MANAGER') });
    await screen.findByTestId('my-received');
    expect(calls[0]?.query.get('preset')).toBe('7d');
    await user.click(
      within(screen.getByRole('radiogroup', { name: 'Период' })).getByRole('radio', { name: '30 дней' }),
    );
    expect(calls.at(-1)?.query.get('preset')).toBe('30d');
    expect([...(calls.at(-1)?.query.keys() ?? [])]).toEqual(['preset']);
  });

  it('explains why there is no team comparison in a small team', async () => {
    mockApi({
      'GET /analytics/me': () => ({
        body: makeMyStats({
          team: { size: 2, average: null },
          daily: [{ date: '2026-10-19', leads: 0, breached: 0, teamAverageLeads: null }],
        }),
      }),
    });
    renderWithProviders(<MyStatsPage />, { me: makeMe('MANAGER') });
    await screen.findByTestId('my-received');
    expect(screen.queryByTestId('team-received')).not.toBeInTheDocument();
    expect(screen.getByTestId('team-note')).toHaveTextContent('от 3 менеджеров');
    expect(screen.getByText('У вас нет лидов за выбранный период')).toBeInTheDocument();
  });

  it('shows an error with retry', async () => {
    mockApi({ 'GET /analytics/me': () => apiError(500, 'INTERNAL_ERROR') });
    renderWithProviders(<MyStatsPage />, { me: makeMe('MANAGER') });
    expect(await screen.findByRole('button', { name: /Повторить/ })).toBeInTheDocument();
  });
});
