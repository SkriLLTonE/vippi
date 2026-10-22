import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { makeLead, makeMe, mockApi, renderWithProviders } from '../../../../test/utils';
import { LeadData } from './lead-data';

describe('LeadData (ADR-024)', () => {
  it('real-estate orgs see district, property type and rooms', () => {
    mockApi({});
    renderWithProviders(<LeadData lead={makeLead({ district: 'YUNUSOBOD', rooms: 2 })} />, { me: makeMe('OWNER') });
    expect(screen.getByText('Район')).toBeInTheDocument();
    expect(screen.getByText('Комнат')).toBeInTheDocument();
  });

  it('GENERIC orgs see custom field values and no real-estate rows', () => {
    mockApi({});
    const me = makeMe('OWNER');
    me.organization.industryPreset = 'GENERIC';
    me.organization.leadFields = [
      {
        key: 'service',
        label: { ru: 'Услуга' },
        type: 'single_select',
        required: false,
        showInCreate: true,
        options: [{ value: 'implant', label: { ru: 'Имплант' } }],
      },
      { key: 'deposit', label: { ru: 'Предоплата' }, type: 'money', required: false, showInCreate: true },
      { key: 'visits', label: { uz: 'Tashriflar' }, type: 'number', required: false, showInCreate: true },
    ];
    const lead = makeLead({
      district: 'YUNUSOBOD',
      rooms: 2,
      attributes: { service: 'implant', deposit: { amount: '500000', currency: 'UZS' }, visits: 3 },
    });
    renderWithProviders(<LeadData lead={lead} />, { me });
    expect(screen.queryByText('Район')).not.toBeInTheDocument();
    expect(screen.queryByText('Комнат')).not.toBeInTheDocument();
    expect(screen.getByText('Услуга')).toBeInTheDocument();
    expect(screen.getByText('Имплант')).toBeInTheDocument();
    expect(screen.getByText('Предоплата')).toBeInTheDocument();
    expect(screen.getByText('Tashriflar')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });
});
