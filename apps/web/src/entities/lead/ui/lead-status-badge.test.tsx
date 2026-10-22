import { act, render, screen } from '@testing-library/react';
import i18n from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it } from 'vitest';
import { applyStatusLabels } from '@/shared/i18n';
import { LeadStatusBadge } from './badges';

const renderBadge = (status: 'WON' | 'LOST' | 'NEW') =>
  render(
    <I18nextProvider i18n={i18n}>
      <LeadStatusBadge status={status} />
    </I18nextProvider>,
  );

describe('per-organization status labels (ADR-024)', () => {
  afterEach(() => applyStatusLabels(null));

  it('renders the default names without overrides', () => {
    renderBadge('WON');
    expect(screen.getByText('Сделка')).toBeInTheDocument();
  });

  it('renders overridden WON/LOST names and re-renders when they change', () => {
    applyStatusLabels({ WON: { ru: 'Записан', uz: 'Yozildi' }, LOST: { uz: 'Kelmadi' } });
    const { rerender } = renderBadge('WON');
    expect(screen.getByText('Записан')).toBeInTheDocument();
    rerender(
      <I18nextProvider i18n={i18n}>
        <LeadStatusBadge status="LOST" />
      </I18nextProvider>,
    );
    expect(screen.getByText('Kelmadi')).toBeInTheDocument();
    act(() => applyStatusLabels({ LOST: { ru: 'Не пришёл' } }));
    expect(screen.getByText('Не пришёл')).toBeInTheDocument();
  });

  it('feeds dashboard KPI names and hints that reference the status', () => {
    applyStatusLabels({ WON: { ru: 'Записан' } });
    expect(i18n.t('dashboard.kpi.won')).toBe('Записан');
    expect(i18n.t('myStats.hint.won')).toBe('Из полученных за период — в статусе «Записан»');
    expect(i18n.t('lead.status.NEW')).toBe('Новый');
    applyStatusLabels(null);
    expect(i18n.t('dashboard.kpi.won')).toBe('Сделки');
  });
});
