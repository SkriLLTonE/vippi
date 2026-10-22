import { screen, waitFor } from '@testing-library/react';
import type { Role } from '@vippi/shared';
import { describe, expect, it } from 'vitest';
import {
  apiError,
  makeLead,
  makeMe,
  makeMyStats,
  mockApi,
  renderWithProviders,
} from '../../../../test/utils';
import { LeadsPage } from './leads-page';
import { MyStatsStrip } from './my-stats-strip';

describe('MyStatsStrip (FR-056)', () => {
  it('shows 7-day KPIs with the team average and links to the full page', async () => {
    const { calls } = mockApi({ 'GET /analytics/me': () => ({ body: makeMyStats() }) });
    renderWithProviders(<MyStatsStrip />, { me: makeMe('MANAGER') });
    expect(await screen.findByTestId('strip-received')).toHaveTextContent('12');
    expect(screen.getByTestId('strip-slaMetRate')).toHaveTextContent('90%');
    expect(screen.getByTestId('strip-conversionRate')).toHaveTextContent('25%');
    expect(screen.getByTestId('team-slaMetRate')).toHaveTextContent('Среднее по команде: 75%');
    expect(screen.getByRole('link', { name: 'Подробнее' })).toHaveAttribute('href', '/my-stats');
    expect(calls[0]?.query.get('preset')).toBe('7d');
  });

  it('disappears on error so the list stays usable', async () => {
    const { calls } = mockApi({ 'GET /analytics/me': () => apiError(500, 'INTERNAL_ERROR') });
    renderWithProviders(<MyStatsStrip />, { me: makeMe('MANAGER') });
    await waitFor(() => expect(calls).toHaveLength(1));
    await waitFor(() => expect(screen.queryByTestId('my-stats-strip')).not.toBeInTheDocument());
  });
});

describe('LeadsPage strip placement', () => {
  function setup(role: Role, route: string) {
    const api = mockApi({
      'GET /leads': () => ({ body: { items: [makeLead()], total: 1, page: 1, pageSize: 25 } }),
      'GET /members': () => ({ body: [] }),
      'GET /analytics/me': () => ({ body: makeMyStats() }),
    });
    renderWithProviders(<LeadsPage />, { path: '/leads', route, me: makeMe(role) });
    return api;
  }

  it('appears above «My leads»', async () => {
    setup('MANAGER', '/leads?assigneeId=me');
    expect(await screen.findByTestId('my-stats-strip')).toBeInTheDocument();
  });

  it('is absent on the general list', async () => {
    const { calls } = setup('OWNER', '/leads');
    expect((await screen.findAllByText('Aziz Karimov')).length).toBeGreaterThan(0);
    expect(screen.queryByTestId('my-stats-strip')).not.toBeInTheDocument();
    expect(calls.some((c) => c.path === '/analytics/me')).toBe(false);
  });
});
