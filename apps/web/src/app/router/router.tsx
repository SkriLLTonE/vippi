import { createBrowserRouter } from 'react-router';
import { AppShell } from '@/widgets/app-shell';
import { NotFoundState } from '@/shared/ui';
import { GuestOnly, HomeRedirect, RequireAuth, RequireFeature, RequirePermission, SettingsRedirect } from './guards';

export const router = createBrowserRouter([
  {
    path: '/login',
    lazy: async () => {
      const { LoginPage } = await import('@/pages/login');
      return {
        Component: () => (
          <GuestOnly>
            <LoginPage />
          </GuestOnly>
        ),
      };
    },
  },
  {
    path: '/register',
    lazy: async () => {
      const { RegisterPage } = await import('@/pages/register');
      return {
        Component: () => (
          <GuestOnly>
            <RegisterPage />
          </GuestOnly>
        ),
      };
    },
  },
  {
    path: '/invite/:token',
    lazy: async () => ({ Component: (await import('@/pages/accept-invitation')).AcceptInvitationPage }),
  },
  {
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <HomeRedirect /> },
      {
        path: 'dashboard',
        lazy: async () => {
          const { DashboardPage } = await import('@/pages/dashboard');
          return {
            Component: () => (
              <RequirePermission permission="dashboard.read">
                <DashboardPage />
              </RequirePermission>
            ),
          };
        },
      },
      { path: 'leads', lazy: async () => ({ Component: (await import('@/pages/leads')).LeadsPage }) },
      { path: 'leads/:id', lazy: async () => ({ Component: (await import('@/pages/lead-details')).LeadDetailsPage }) },
      { path: 'overdue', lazy: async () => ({ Component: (await import('@/pages/overdue')).OverduePage }) },
      {
        path: 'team',
        lazy: async () => {
          const { TeamPage } = await import('@/pages/team');
          return {
            Component: () => (
              <RequirePermission permission="invitation.manage">
                <TeamPage />
              </RequirePermission>
            ),
          };
        },
      },
      { path: 'settings', element: <SettingsRedirect /> },
      {
        path: 'settings/sla',
        lazy: async () => {
          const { SettingsSlaPage } = await import('@/pages/settings-sla');
          return {
            Component: () => (
              <RequirePermission permission="sla.manage">
                <SettingsSlaPage />
              </RequirePermission>
            ),
          };
        },
      },
      {
        path: 'settings/api-keys',
        lazy: async () => {
          const { SettingsApiKeysPage } = await import('@/pages/settings-api-keys');
          return {
            Component: () => (
              <RequirePermission permission="apiKey.manage">
                <SettingsApiKeysPage />
              </RequirePermission>
            ),
          };
        },
      },
      {
        path: 'settings/organization',
        lazy: async () => {
          const { SettingsOrganizationPage } = await import('@/pages/settings-organization');
          return {
            Component: () => (
              <RequirePermission permission="ai.statusRead">
                <SettingsOrganizationPage />
              </RequirePermission>
            ),
          };
        },
      },
      {
        path: 'settings/audit-log',
        lazy: async () => {
          const { AuditLogPage } = await import('@/pages/audit-log');
          return {
            Component: () => (
              <RequireFeature flag="AUDIT_LOG_UI">
                <RequirePermission permission="audit.read">
                  <AuditLogPage />
                </RequirePermission>
              </RequireFeature>
            ),
          };
        },
      },
      { path: 'profile', lazy: async () => ({ Component: (await import('@/pages/profile')).ProfilePage }) },
      { path: '*', element: <NotFoundState /> },
    ],
  },
]);
