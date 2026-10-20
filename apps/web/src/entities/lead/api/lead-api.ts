import { keepPreviousData, useQuery, type QueryClient } from '@tanstack/react-query';
import type {
  LeadActivityDto,
  LeadDto,
  LeadListItem,
  OverdueLeadItem,
  Paginated,
} from '@vippi/shared';
import { apiRequest, type QueryParams } from '@/shared/api';
import { POLL_LEADS_MS } from '@/shared/config';

export const leadKeys = {
  all: ['leads'] as const,
  list: (q: QueryParams) => ['leads', 'list', q] as const,
  overdue: (q: QueryParams) => ['leads', 'overdue', q] as const,
  detail: (id: string) => ['leads', 'detail', id] as const,
  activities: (id: string) => ['leads', 'activities', id] as const,
};

export function useLeadList(query: QueryParams) {
  return useQuery({
    queryKey: leadKeys.list(query),
    queryFn: ({ signal }) => apiRequest<Paginated<LeadListItem>>('/leads', { query, signal }),
    placeholderData: keepPreviousData,
    refetchInterval: POLL_LEADS_MS,
  });
}

export function useOverdueLeads(query: QueryParams, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: leadKeys.overdue(query),
    queryFn: ({ signal }) => apiRequest<Paginated<OverdueLeadItem>>('/leads/overdue', { query, signal }),
    placeholderData: keepPreviousData,
    refetchInterval: POLL_LEADS_MS,
    enabled: options.enabled ?? true,
  });
}

export function useLead(id: string) {
  return useQuery({
    queryKey: leadKeys.detail(id),
    queryFn: ({ signal }) => apiRequest<LeadDto>(`/leads/${id}`, { signal }),
    refetchInterval: POLL_LEADS_MS,
  });
}

export function useLeadActivities(id: string) {
  return useQuery({
    queryKey: leadKeys.activities(id),
    queryFn: ({ signal }) => apiRequest<LeadActivityDto[]>(`/leads/${id}/activities`, { signal }),
  });
}

/** After any lead mutation: put the fresh DTO into cache and refresh lists/history. */
export function onLeadChanged(qc: QueryClient, lead?: LeadDto, id?: string): void {
  const leadId = lead?.id ?? id;
  if (lead) qc.setQueryData(leadKeys.detail(lead.id), lead);
  void qc.invalidateQueries({ queryKey: ['leads', 'list'] });
  void qc.invalidateQueries({ queryKey: ['leads', 'overdue'] });
  if (leadId) void qc.invalidateQueries({ queryKey: leadKeys.activities(leadId) });
}
