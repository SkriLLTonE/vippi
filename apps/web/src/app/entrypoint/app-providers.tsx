import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { Toaster } from 'sonner';
import { sessionKeys } from '@/entities/session';
import { createQueryClient, onUnauthorized } from '@/shared/api';
import { initI18n } from '@/shared/i18n';
import { TooltipProvider } from '@/shared/ui';
import { router } from '../router/router';

const i18n = initI18n();

const GUEST_PATHS = ['/login', '/register', '/invite/'];

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);

  useEffect(() => {
    onUnauthorized(() => {
      const { pathname, search } = window.location;
      if (GUEST_PATHS.some((p) => pathname.startsWith(p))) return;
      queryClient.setQueryData(sessionKeys.me, null);
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== sessionKeys.me[0] });
      void router.navigate(`/login?expired=1&next=${encodeURIComponent(pathname + search)}`, { replace: true });
    });
    return () => onUnauthorized(null);
  }, [queryClient]);

  return (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          {children}
          <Toaster position="top-right" richColors closeButton duration={4000} />
        </TooltipProvider>
      </QueryClientProvider>
    </I18nextProvider>
  );
}
