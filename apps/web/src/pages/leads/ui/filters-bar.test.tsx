import { act, screen, waitFor } from '@testing-library/react';
import type { Role } from '@vippi/shared';
import { describe, expect, it } from 'vitest';
import { makeMe, mockApi, renderWithProviders } from '../../../../test/utils';
import { useLeadFilters } from '../model/use-lead-filters';
import { FiltersBar } from './filters-bar';

function Harness() {
  const filters = useLeadFilters();
  return <FiltersBar filters={filters} />;
}

function setup(role: Role, route = '/leads') {
  mockApi({
    'GET /members': () => ({
      body: [
        { id: 'm1', userId: 'u-2', fullName: 'Dilnoza Manager', role: 'MANAGER', status: 'ACTIVE' },
        { id: 'm2', userId: 'u-3', fullName: 'Gone Person', role: 'MANAGER', status: 'DEACTIVATED' },
      ],
    }),
  });
  return renderWithProviders(<Harness />, { path: '/leads', route, me: makeMe(role) });
}

const search = (r: ReturnType<typeof setup>) => new URLSearchParams(r.router.state.location.search);

describe('FiltersBar (FR-017, FR-018, UX §5.4)', () => {
  it('chips toggle filters in the URL and expose aria-pressed', async () => {
    const r = setup('OWNER');
    const overdue = screen.getByRole('button', { name: 'Просроченные' });
    expect(overdue).toHaveAttribute('aria-pressed', 'false');
    await r.user.click(overdue);
    expect(search(r).get('slaState')).toBe('BREACHED');
    expect(screen.getByRole('button', { name: 'Просроченные' })).toHaveAttribute('aria-pressed', 'true');
    await r.user.click(screen.getByRole('button', { name: 'Просроченные' }));
    expect(search(r).has('slaState')).toBe(false);
  });

  it('managers do not get the "unassigned" chip or the assignee selector', () => {
    setup('MANAGER');
    expect(screen.queryByRole('button', { name: 'Не назначен' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Ответственный')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Мои' })).toBeInTheDocument();
  });

  it('owners can filter by an active assignee only', async () => {
    const r = setup('OWNER');
    const select = screen.getByLabelText('Ответственный');
    await waitFor(() => expect(screen.getByRole('option', { name: 'Dilnoza Manager' })).toBeInTheDocument());
    expect(screen.queryByRole('option', { name: 'Gone Person' })).not.toBeInTheDocument();
    await r.user.selectOptions(select, 'u-2');
    expect(search(r).get('assigneeId')).toBe('u-2');
  });

  it('search is debounced and ignores single characters', async () => {
    const r = setup('OWNER');
    const input = screen.getByRole('searchbox', { name: 'Поиск' });
    await r.user.type(input, 'A');
    await act(() => new Promise((res) => setTimeout(res, 400)));
    expect(search(r).has('q')).toBe(false);
    await r.user.type(input, 'ziz');
    expect(search(r).has('q')).toBe(false);
    await waitFor(() => expect(search(r).get('q')).toBe('Aziz'));
  });

  it('a filter change resets pagination and "reset" clears everything', async () => {
    const r = setup('OWNER', '/leads?page=3&status=NEW&q=test');
    expect(screen.getByRole('searchbox', { name: 'Поиск' })).toHaveValue('test');
    await r.user.click(screen.getByRole('button', { name: 'Забытые' }));
    expect(search(r).get('forgotten')).toBe('true');
    expect(search(r).has('page')).toBe(false);
    await r.user.click(screen.getByRole('button', { name: 'Сбросить фильтры' }));
    expect(r.router.state.location.search).toBe('');
    expect(screen.getByRole('searchbox', { name: 'Поиск' })).toHaveValue('');
  });

  it('period presets write from/to', async () => {
    const r = setup('OWNER');
    await r.user.selectOptions(screen.getByLabelText('Период'), '7d');
    const s = search(r);
    expect(s.get('from')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(s.get('to')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(s.get('from')! < s.get('to')!).toBe(true);
  });
});
