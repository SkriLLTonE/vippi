import type { FeatureFlag, Permission } from '@vippi/shared';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router';
import { useSession } from '@/entities/session';
import { cn } from '@/shared/lib';
import { PageHeader } from '@/shared/ui';

const ITEMS: Array<{ to: string; key: string; permission: Permission; feature?: FeatureFlag }> = [
  { to: '/settings/sla', key: 'settings.nav.sla', permission: 'sla.manage' },
  { to: '/settings/api-keys', key: 'settings.nav.apiKeys', permission: 'apiKey.manage' },
  { to: '/settings/organization', key: 'settings.nav.organization', permission: 'ai.statusRead' },
  { to: '/settings/audit-log', key: 'settings.nav.audit', permission: 'audit.read', feature: 'AUDIT_LOG_UI' },
];

/** Shared header + tab links for /settings/* pages. */
export function SettingsLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const me = useSession();
  const items = ITEMS.filter((i) => me.permissions.includes(i.permission) && (!i.feature || me.features[i.feature]));
  return (
    <>
      <PageHeader title={t('nav.settings')} />
      <nav aria-label={t('nav.settings')} className="mb-6 flex gap-1 overflow-x-auto border-b border-border">
        {items.map((i) => (
          <NavLink
            key={i.to}
            to={i.to}
            className={({ isActive }) =>
              cn(
                '-mb-px inline-flex h-10 items-center whitespace-nowrap border-b-2 border-transparent px-3 text-sm font-medium text-muted-foreground hover:text-foreground',
                isActive && 'border-primary text-foreground',
              )
            }
          >
            {t(i.key)}
          </NavLink>
        ))}
      </nav>
      {children}
    </>
  );
}
