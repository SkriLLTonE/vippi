import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EmptyState, ErrorState } from '@/shared/ui';
import { makeMe, mockApi, renderWithProviders } from '../../../test/utils';
import { RequireFeature, RequirePermission } from './guards';

describe('route guards (SEC-006 UI, ADR-020)', () => {
  it('RequirePermission renders 403 for a role without the permission', () => {
    mockApi({});
    renderWithProviders(
      <RequirePermission permission="sla.manage">
        <p>SLA settings</p>
      </RequirePermission>,
      { me: makeMe('MANAGER') },
    );
    expect(screen.getByRole('heading', { name: 'У вас нет доступа к этому разделу' })).toBeInTheDocument();
    expect(screen.getByText('403')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /главн|На главную/i })).toHaveAttribute('href', '/');
    expect(screen.queryByText('SLA settings')).not.toBeInTheDocument();
  });

  it('RequirePermission renders the page for a role with the permission', () => {
    mockApi({});
    renderWithProviders(
      <RequirePermission permission="sla.manage">
        <p>SLA settings</p>
      </RequirePermission>,
      { me: makeMe('HEAD_OF_SALES') },
    );
    expect(screen.getByText('SLA settings')).toBeInTheDocument();
  });

  it('RequireFeature renders 404 when a cut-line flag is disabled', () => {
    mockApi({});
    const me = makeMe('OWNER');
    me.features.AUDIT_LOG_UI = false;
    renderWithProviders(
      <RequireFeature flag="AUDIT_LOG_UI">
        <p>Audit log</p>
      </RequireFeature>,
      { me },
    );
    expect(screen.getByText('404')).toBeInTheDocument();
    expect(screen.queryByText('Audit log')).not.toBeInTheDocument();
  });
});

describe('shared states (UX §4)', () => {
  it('ErrorState is announced and retry calls back', async () => {
    mockApi({});
    const onRetry = vi.fn();
    const { user } = renderWithProviders(<ErrorState message="Не удалось загрузить" onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Не удалось загрузить');
    await user.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('EmptyState shows title, description and action', () => {
    mockApi({});
    renderWithProviders(
      <EmptyState
        title="Пока нет лидов"
        description="Создайте первый"
        action={<button type="button">Создать лид</button>}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Пока нет лидов' })).toBeInTheDocument();
    expect(screen.getByText('Создайте первый')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Создать лид' })).toBeInTheDocument();
  });
});
