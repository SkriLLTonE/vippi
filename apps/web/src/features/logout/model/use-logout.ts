import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { setSession } from '@/entities/session';
import { apiRequest } from '@/shared/api';
import { errorMessage } from '@/shared/lib';

/** Ends the session and drops every cached query except the (now empty) session; failures go to a toast. */
export function useLogout({ onLoggedOut }: { onLoggedOut?: () => void } = {}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiRequest<void>('/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      setSession(qc, null);
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'session' });
      onLoggedOut?.();
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  });
}
