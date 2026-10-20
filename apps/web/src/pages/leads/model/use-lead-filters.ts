import { LEAD_SORTS, PAGE_SIZES, type LeadSort } from '@vippi/shared';
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import type { QueryParams } from '@/shared/api';

export interface LeadFilterState {
  status: string[];
  source: string[];
  slaState: string[];
  assigneeId: string;
  forgotten: boolean;
  from: string;
  to: string;
  q: string;
  sort: LeadSort;
  page: number;
  pageSize: number;
}

const LIST_KEYS = ['status', 'source', 'slaState'] as const;

function list(params: URLSearchParams, key: string): string[] {
  return (params.get(key) ?? '').split(',').filter(Boolean);
}

/** Filters live in the URL (UX §5.4): shareable links and back/forward navigation. */
export function useLeadFilters() {
  const [params, setParams] = useSearchParams();

  const state: LeadFilterState = useMemo(() => {
    const sort = params.get('sort');
    const pageSize = Number(params.get('pageSize'));
    return {
      status: list(params, 'status'),
      source: list(params, 'source'),
      slaState: list(params, 'slaState'),
      assigneeId: params.get('assigneeId') ?? '',
      forgotten: params.get('forgotten') === 'true',
      from: params.get('from') ?? '',
      to: params.get('to') ?? '',
      q: params.get('q') ?? '',
      sort: (LEAD_SORTS as readonly string[]).includes(sort ?? '') ? (sort as LeadSort) : '-receivedAt',
      page: Math.max(1, Number(params.get('page')) || 1),
      pageSize: (PAGE_SIZES as readonly number[]).includes(pageSize) ? pageSize : 25,
    };
  }, [params]);

  const update = useCallback(
    (patch: Partial<LeadFilterState>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(patch)) {
            const str = Array.isArray(value) ? value.join(',') : value === false ? '' : String(value);
            if (str === '' || (key === 'sort' && str === '-receivedAt') || (key === 'pageSize' && str === '25')) next.delete(key);
            else next.set(key, str);
          }
          if (!('page' in patch)) next.delete('page');
          next.delete('welcome');
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const reset = useCallback(() => setParams(new URLSearchParams(), { replace: true }), [setParams]);

  const activeCount =
    LIST_KEYS.reduce((n, k) => n + (state[k].length > 0 ? 1 : 0), 0) +
    (state.assigneeId ? 1 : 0) +
    (state.forgotten ? 1 : 0) +
    (state.from || state.to ? 1 : 0) +
    (state.q.length >= 2 ? 1 : 0);

  /** Filters accepted by GET /leads and GET /leads/export.csv (same `LeadListQuery`). */
  const filterQuery: QueryParams = {
    status: state.status,
    source: state.source,
    slaState: state.slaState,
    assigneeId: state.assigneeId || undefined,
    forgotten: state.forgotten ? 'true' : undefined,
    from: state.from || undefined,
    to: state.to || undefined,
    q: state.q.trim().length >= 2 ? state.q.trim() : undefined,
    sort: state.sort,
  };

  return { state, update, reset, activeCount, filterQuery };
}
