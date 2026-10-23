import { screen, waitFor, within } from '@testing-library/react';
import { TIMEZONES, type OrganizationDto } from '@vippi/shared';
import { describe, expect, it } from 'vitest';
import { makeMe, mockApi, renderWithProviders } from '../../../../test/utils';
import { CompanyCard } from './company-card';

const org: OrganizationDto = {
  id: 'o-1',
  name: 'Test Agency',
  isDemo: false,
  emailFrom: null,
  aiExternalProcessingEnabled: false,
  timezone: 'Asia/Tashkent',
  industry: 'REAL_ESTATE',
  industryPreset: 'REAL_ESTATE',
  leadFields: [],
  statusLabels: {},
};

describe('company card: time zone', () => {
  it('shows the curated list with city and UTC offset, Tashkent selected', () => {
    mockApi({});
    renderWithProviders(<CompanyCard org={org} editable />, { me: makeMe('OWNER') });
    const select = screen.getByLabelText('Часовой пояс');
    expect(select).toHaveValue('Asia/Tashkent');
    const options = within(select).getAllByRole('option');
    expect(options.map((o) => o.getAttribute('value'))).toEqual([...TIMEZONES]);
    expect(options[0]).toHaveTextContent('Ташкент (UTC+5)');
    expect(within(select).getByRole('option', { name: 'Москва (UTC+3)' })).toBeInTheDocument();
    expect(within(select).getByRole('option', { name: 'UTC' })).toBeInTheDocument();
    expect(screen.getByText(/считаются по Ташкенту \(UTC\+5\)/)).toBeInTheDocument();
  });

  it('owner saves a new zone', async () => {
    const { calls } = mockApi({ 'PATCH /organization': () => ({ body: { ...org, timezone: 'Asia/Almaty' } }) });
    const { user } = renderWithProviders(<CompanyCard org={org} editable />, { me: makeMe('OWNER') });
    const save = screen.getByRole('button', { name: 'Сохранить' });
    expect(save).toBeDisabled();
    await user.selectOptions(screen.getByLabelText('Часовой пояс'), 'Алматы (UTC+5)');
    await user.click(save);
    await waitFor(() => expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(1));
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ name: 'Test Agency', timezone: 'Asia/Almaty' });
  });

  it('keeps a stored zone outside the list as an extra option and does not resend it', async () => {
    const legacy = { ...org, timezone: 'Europe/Berlin' };
    const { calls } = mockApi({ 'PATCH /organization': () => ({ body: { ...legacy, name: 'New Name' } }) });
    const { user } = renderWithProviders(<CompanyCard org={legacy} editable />, { me: makeMe('OWNER') });
    const select = screen.getByLabelText('Часовой пояс');
    expect(select).toHaveValue('Europe/Berlin');
    expect(within(select).getAllByRole('option')).toHaveLength(TIMEZONES.length + 1);
    await user.clear(screen.getByLabelText('Название компании'));
    await user.type(screen.getByLabelText('Название компании'), 'New Name');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(1));
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ name: 'New Name' });
  });

  it('non-owners see the zone read-only', () => {
    mockApi({});
    renderWithProviders(<CompanyCard org={org} editable={false} />, { me: makeMe('HEAD_OF_SALES') });
    expect(screen.getByLabelText('Часовой пояс')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Сохранить' })).not.toBeInTheDocument();
  });
});
