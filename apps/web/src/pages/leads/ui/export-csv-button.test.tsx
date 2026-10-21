import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiError, makeMe, mockApi, renderWithProviders } from '../../../../test/utils';
import { ExportCsvButton } from './export-csv-button';

describe('ExportCsvButton (FR-064, ADR-019)', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'URL',
      Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:mock'), revokeObjectURL: vi.fn() }),
    );
  });

  it('exports with the current filters and reports the file name', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const { calls } = mockApi({
      'GET /leads/export.csv': () => ({
        raw: '\ufeffnumber,name\r\n1,Aziz\r\n',
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="leads-2026-10-21.csv"',
        },
      }),
    });
    const { user } = renderWithProviders(
      <ExportCsvButton filters={{ status: ['NEW', 'LOST'], q: 'Aziz', page: 3, empty: '' }} />,
      {
        me: makeMe(),
      },
    );
    await user.click(screen.getByTestId('export-csv'));
    expect(await screen.findByText('Файл leads-2026-10-21.csv скачан')).toBeInTheDocument();
    const query = calls[0]?.query;
    expect(query?.get('status')).toBe('NEW,LOST');
    expect(query?.get('q')).toBe('Aziz');
    expect(query?.has('empty')).toBe(false);
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('explains EXPORT_TOO_LARGE instead of a generic error', async () => {
    mockApi({ 'GET /leads/export.csv': () => apiError(422, 'EXPORT_TOO_LARGE') });
    const { user } = renderWithProviders(<ExportCsvButton filters={{}} />, { me: makeMe() });
    await user.click(screen.getByTestId('export-csv'));
    expect(await screen.findByText(/Слишком много строк для экспорта. Сузьте фильтры/)).toBeInTheDocument();
  });

  it('shows a loading state while the file is prepared', async () => {
    let release: (() => void) | undefined;
    const { fetchMock } = mockApi({});
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          release = () =>
            resolve(new Response('x', { status: 200, headers: { 'Content-Type': 'text/csv' } }));
        }),
    );
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const { user } = renderWithProviders(<ExportCsvButton filters={{}} />, { me: makeMe() });
    await user.click(screen.getByTestId('export-csv'));
    expect(await screen.findByText('Готовим файл…')).toBeInTheDocument();
    expect(screen.getByTestId('export-csv')).toBeDisabled();
    release?.();
    await waitFor(() => expect(screen.getByTestId('export-csv')).toBeEnabled());
  });
});
