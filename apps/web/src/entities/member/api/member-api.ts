import { useQuery } from '@tanstack/react-query';
import type { MemberDto, UserRef } from '@vippi/shared';
import { apiRequest } from '@/shared/api';

export const memberKeys = { all: ['members'] as const };

export function useMembers(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: memberKeys.all,
    queryFn: ({ signal }) => apiRequest<MemberDto[]>('/members', { signal }),
    staleTime: 60_000,
    enabled: options.enabled ?? true,
  });
}

/** Active members as assignee options (by user id). */
export function useAssignees(options: { enabled?: boolean } = {}): UserRef[] {
  const { data } = useMembers(options);
  return (data ?? []).filter((m) => m.status === 'ACTIVE').map((m) => ({ id: m.userId, fullName: m.fullName }));
}

/** userId → name resolver for activity payloads. */
export function useMemberNames(): (userId: string | undefined) => string {
  const { data } = useMembers();
  return (userId) => data?.find((m) => m.userId === userId)?.fullName ?? '—';
}
