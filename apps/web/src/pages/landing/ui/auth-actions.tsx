import type { MeResponse } from '@vippi/shared';
import { ChevronRight, LogOut } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { homePath } from '@/entities/session';
import { useLogout } from '@/features/logout';
import { cn } from '@/shared/lib';
import { Button, Skeleton } from '@/shared/ui';

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2997ff]';
const PILL = cn(
  'inline-flex items-center justify-center gap-1.5 rounded-full bg-[#0071e3] font-medium whitespace-nowrap text-white transition-colors hover:bg-[#0077ed]',
  FOCUS,
);
const PILL_SM = cn(PILL, 'h-8 px-3.5 text-[0.8125rem]');
const PILL_LG = cn(PILL, 'h-12 px-7 text-base');
const TEXT_LINK = cn('inline-flex min-h-7 items-center gap-0.5 rounded-md font-medium text-[#2997ff] hover:underline', FOCUS);

/**
 * Primary actions on the dark landing: guests sign in or register; a signed-in user goes straight to their start page.
 * The header variant is compact and shortens the registration label on phones; the final CTA says «Начать».
 */
export function AuthActions({
  me,
  pending,
  place,
}: {
  me: MeResponse | null | undefined;
  pending: boolean;
  place: 'header' | 'hero' | 'cta';
}) {
  const { t } = useTranslation();
  const header = place === 'header';
  if (pending) return <Skeleton className={cn('rounded-full bg-white/10', header ? 'h-8 w-40' : 'h-12 w-64')} />;
  if (me) {
    const toDashboard = me.permissions.includes('dashboard.read');
    return (
      <Link to={homePath(me)} className={header ? PILL_SM : PILL_LG}>
        {t(toDashboard ? 'landing.openDashboard' : 'landing.openLeads')}
        {header ? null : <ChevronRight className="size-4" aria-hidden />}
      </Link>
    );
  }
  if (header) {
    return (
      <div className="flex items-center gap-1 sm:gap-2">
        <Link to="/login" className={cn('inline-flex h-8 items-center rounded-full px-3 text-[0.8125rem] text-[#f5f5f7] hover:bg-white/10', FOCUS)}>
          {t('auth.login')}
        </Link>
        <Link to="/register" className={PILL_SM}>
          <span aria-hidden className="sm:hidden">
            {t('landing.registerShort')}
          </span>
          <span className="max-sm:sr-only">{t('landing.register')}</span>
        </Link>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:gap-8">
      <Link to="/register" className={PILL_LG}>
        {t(place === 'cta' ? 'landing.start' : 'landing.register')}
      </Link>
      <Link to="/login" className={cn(TEXT_LINK, 'text-base')}>
        {t('auth.login')}
        <ChevronRight className="size-4" aria-hidden />
      </Link>
    </div>
  );
}

/** Signing out keeps the visitor on the landing, which then shows the guest actions. */
export function LogoutButton() {
  const { t } = useTranslation();
  const logout = useLogout();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="rounded-full text-[#f5f5f7] hover:bg-white/10"
      onClick={() => logout.mutate()}
      loading={logout.isPending}
    >
      <LogOut aria-hidden />
      <span className="max-sm:sr-only">{t('auth.logout')}</span>
    </Button>
  );
}
