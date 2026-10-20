import { useQuery } from '@tanstack/react-query';
import type { AiStatusDto, LeadAiState } from '@vippi/shared';
import { apiRequest } from '@/shared/api';

export const aiKeys = {
  lead: (leadId: string) => ['ai', 'lead', leadId] as const,
  status: ['ai', 'status'] as const,
};

export function useLeadAi(leadId: string) {
  return useQuery({
    queryKey: aiKeys.lead(leadId),
    queryFn: ({ signal }) => apiRequest<LeadAiState>(`/leads/${leadId}/ai`, { signal }),
  });
}

export function useAiStatus(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: aiKeys.status,
    queryFn: ({ signal }) => apiRequest<AiStatusDto>('/ai/status', { signal }),
    enabled: options.enabled ?? true,
    staleTime: 30_000,
  });
}
