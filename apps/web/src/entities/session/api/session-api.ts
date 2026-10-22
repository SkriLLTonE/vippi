import { useQuery, type QueryClient } from '@tanstack/react-query';
import type { MeResponse } from '@vippi/shared';
import { apiRequest, isApiError } from '@/shared/api';
import { applyStatusLabels } from '@/shared/i18n';
import { syncServerTime } from '@/shared/lib';

export const sessionKeys = { me: ['session', 'me'] as const };

/** Returns `null` when there is no valid session (401) instead of throwing. */
export async function fetchMe(): Promise<MeResponse | null> {
  try {
    const me = await apiRequest<MeResponse>('/auth/me', { silentUnauthorized: true });
    syncServerTime(me.serverTime);
    applyStatusLabels(me.organization.statusLabels);
    return me;
  } catch (e) {
    if (isApiError(e) && e.status === 401) {
      applyStatusLabels(null);
      return null;
    }
    throw e;
  }
}

export function useMeQuery() {
  return useQuery({ queryKey: sessionKeys.me, queryFn: fetchMe, staleTime: 60_000, refetchOnWindowFocus: true });
}

export function setSession(qc: QueryClient, me: MeResponse | null): void {
  if (me) syncServerTime(me.serverTime);
  applyStatusLabels(me?.organization.statusLabels);
  qc.setQueryData(sessionKeys.me, me);
}
