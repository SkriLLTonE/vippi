import type { FeatureFlag, MeResponse, Permission } from '@vippi/shared';
import { useMeQuery } from '../api/session-api';

/** Current session inside authenticated routes (RequireAuth guarantees it is loaded). */
export function useSession(): MeResponse {
  const { data } = useMeQuery();
  if (!data) throw new Error('useSession() used outside of an authenticated route');
  return data;
}

export function useCan(): (permission: Permission) => boolean {
  const me = useSession();
  return (permission) => me.permissions.includes(permission);
}

export function useFeature(flag: FeatureFlag): boolean {
  return useSession().features[flag];
}

/** Start page after login (UX §2.2). */
export function homePath(me: MeResponse): string {
  return me.permissions.includes('dashboard.read') ? '/dashboard' : '/leads?assigneeId=me';
}
