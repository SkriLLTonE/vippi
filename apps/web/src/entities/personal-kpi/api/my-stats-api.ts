import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { DashboardPreset, MyStatsResponse } from '@vippi/shared';
import { apiRequest } from '@/shared/api';

export const myStatsKeys = {
  all: ['analytics', 'me'] as const,
  period: (preset: DashboardPreset) => [...myStatsKeys.all, preset] as const,
};

/** FR-056: the current user's KPIs next to the team average. */
export function useMyStats(preset: DashboardPreset) {
  return useQuery({
    queryKey: myStatsKeys.period(preset),
    queryFn: ({ signal }) => apiRequest<MyStatsResponse>('/analytics/me', { query: { preset }, signal }),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}
