import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NotificationDto } from '@vippi/shared';
import { apiRequest } from '@/shared/api';
import { POLL_NOTIFICATIONS_MS } from '@/shared/config';

const keys = {
  unread: ['notifications', 'unread'] as const,
  list: ['notifications', 'list'] as const,
};

/** Polling every 30 s (ADR-013); paused automatically by TanStack Query in background tabs. */
export function useUnreadCount() {
  return useQuery({
    queryKey: keys.unread,
    queryFn: ({ signal }) => apiRequest<{ count: number }>('/notifications/unread-count', { signal }),
    refetchInterval: POLL_NOTIFICATIONS_MS,
  });
}

export function useNotificationList(enabled: boolean) {
  return useQuery({
    queryKey: keys.list,
    queryFn: ({ signal }) =>
      apiRequest<{ items: NotificationDto[] }>('/notifications', { query: { limit: 50 }, signal }),
    enabled,
    refetchInterval: enabled ? POLL_NOTIFICATIONS_MS : false,
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  const refresh = () => void qc.invalidateQueries({ queryKey: ['notifications'] });
  const one = useMutation({
    mutationFn: (id: string) => apiRequest<void>(`/notifications/${id}/read`, { method: 'POST' }),
    onSettled: refresh,
  });
  const all = useMutation({
    mutationFn: () => apiRequest<{ updated: number }>('/notifications/read-all', { method: 'POST' }),
    onSettled: refresh,
  });
  return { one, all };
}
