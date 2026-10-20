import type { FeatureFlag, Permission } from '@vippi/shared';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation } from 'react-router';
import { homePath, useCan, useFeature, useMeQuery, useSession } from '@/entities/session';
import { applyLocale } from '@/shared/i18n';
import { errorMessage } from '@/shared/lib';
import { ErrorState, ForbiddenState, NotFoundState, Skeleton } from '@/shared/ui';

function FullScreenLoader() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-dvh items-center justify-center" role="status" aria-label={t('common.loading')}>
      <Skeleton className="h-8 w-40" />
    </div>
  );
}

/** Authenticated area: loads `/auth/me`, redirects guests to /login?next=… (UX §2.2). */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const me = useMeQuery();
  const location = useLocation();
  const locale = me.data?.user.locale;
  useEffect(() => {
    if (locale) applyLocale(locale);
  }, [locale]);

  if (me.isPending) return <FullScreenLoader />;
  if (me.isError) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-4">
        <ErrorState message={errorMessage(me.error, t)} onRetry={() => void me.refetch()} />
      </div>
    );
  }
  if (!me.data) {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }
  return children;
}

/**
 * Login/registration screens: a user who opens them while already signed in goes to the start page.
 * The decision is made once, so a session created by the page itself (login, registration) does
 * not override the page's own redirect (`?next=`, onboarding).
 */
export function GuestOnly({ children }: { children: ReactNode }) {
  const me = useMeQuery();
  const [signedInOnEntry, setSignedInOnEntry] = useState<boolean | null>(null);
  if (signedInOnEntry === null && !me.isPending) setSignedInOnEntry(!!me.data);
  if (signedInOnEntry === null) return <FullScreenLoader />;
  if (signedInOnEntry && me.data) return <Navigate to={homePath(me.data)} replace />;
  return children;
}

export function RequirePermission({ permission, children }: { permission: Permission; children: ReactNode }) {
  const can = useCan();
  return can(permission) ? children : <ForbiddenState />;
}

/** A disabled feature flag behaves as a missing route (ADR-020). */
export function RequireFeature({ flag, children }: { flag: FeatureFlag; children: ReactNode }) {
  return useFeature(flag) ? children : <NotFoundState />;
}

export function HomeRedirect() {
  return <Navigate to={homePath(useSession())} replace />;
}

export function SettingsRedirect() {
  const can = useCan();
  if (can('sla.manage')) return <Navigate to="/settings/sla" replace />;
  if (can('ai.statusRead')) return <Navigate to="/settings/organization" replace />;
  return <ForbiddenState />;
}
