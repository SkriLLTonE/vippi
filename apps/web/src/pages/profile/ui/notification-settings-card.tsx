import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  NotificationSettingsDto,
  NotificationTestResultDto,
  PushSubscriptionRequest,
  UpdateNotificationSettingsRequest,
} from '@vippi/shared';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useSession } from '@/entities/session';
import { apiRequest } from '@/shared/api';
import { errorMessage } from '@/shared/lib';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ErrorState,
  Skeleton,
  Switch,
} from '@/shared/ui';
import {
  PushPermissionDeniedError,
  currentSubscription,
  isPushSupported,
  pushPermission,
  subscribePush,
  unsubscribePush,
} from '../lib/web-push';

const settingsKey = ['notification-settings'] as const;
const browserSubKey = ['push-subscription', 'browser'] as const;

function Row({
  id,
  label,
  hint,
  control,
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  control: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-md border border-border p-3">
      <div>
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      {control}
    </div>
  );
}

/** Web Push on this device and email opt-in for SLA breaches and assignments (ADR-023). */
export function NotificationSettingsCard() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const me = useSession();
  const [permission, setPermission] = useState(pushPermission);
  const settings = useQuery({
    queryKey: settingsKey,
    queryFn: () => apiRequest<NotificationSettingsDto>('/notifications/settings'),
  });
  const supported = isPushSupported();
  const browserSub = useQuery({
    queryKey: browserSubKey,
    queryFn: async () => (await currentSubscription())?.endpoint ?? null,
    enabled: supported,
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: settingsKey });
    void qc.invalidateQueries({ queryKey: browserSubKey });
  };

  const push = useMutation({
    mutationFn: async (enable: boolean) => {
      if (enable) {
        const key = settings.data?.vapidPublicKey;
        if (!key) return;
        const body: PushSubscriptionRequest = await subscribePush(key);
        await apiRequest<void>('/notifications/push-subscriptions', { method: 'POST', body });
      } else {
        const endpoint = await unsubscribePush();
        if (endpoint)
          await apiRequest<void>('/notifications/push-subscriptions/remove', {
            method: 'POST',
            body: { endpoint },
          });
      }
    },
    onSuccess: (_d, enable) =>
      toast.success(t(enable ? 'notifSettings.pushEnabled' : 'notifSettings.pushDisabled')),
    onError: (e) => {
      if (e instanceof PushPermissionDeniedError) toast.error(t('notifSettings.pushDenied'));
      else toast.error(errorMessage(e, t));
    },
    onSettled: () => {
      setPermission(pushPermission());
      refresh();
    },
  });

  const email = useMutation({
    mutationFn: (body: UpdateNotificationSettingsRequest) =>
      apiRequest<NotificationSettingsDto>('/notifications/settings', { method: 'PATCH', body }),
    onSuccess: (next) => {
      qc.setQueryData(settingsKey, next);
      toast.success(t('common.saved'));
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  });

  const test = useMutation({
    mutationFn: () => apiRequest<NotificationTestResultDto>('/notifications/test', { method: 'POST' }),
    onSuccess: (r) => {
      if (r.push === 0 && !r.email) toast.warning(t('notifSettings.testNothing'));
      else toast.success(t('notifSettings.testSent'));
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  });

  const s = settings.data;
  let pushControl: ReactNode = null;
  let pushHint: ReactNode = t('notifSettings.pushHint');
  if (s && !s.channels.push) pushHint = t('notifSettings.pushNotConfigured');
  else if (!supported) pushHint = t('notifSettings.pushUnsupported');
  else if (permission === 'denied') pushHint = t('notifSettings.pushDenied');
  if (s) {
    pushControl = (
      <Switch
        id="push-enabled"
        checked={!!browserSub.data}
        disabled={
          !s.channels.push || !supported || permission === 'denied' || push.isPending || browserSub.isPending
        }
        onCheckedChange={(v) => push.mutate(v)}
      />
    );
  }

  let emailHint: string = t('notifSettings.emailHint');
  if (s && !s.channels.email) emailHint = t('notifSettings.emailNotConfigured');
  else if (me.organization.isDemo) emailHint = t('notifSettings.emailDemo');

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('notifSettings.title')}</CardTitle>
        <CardDescription>{t('notifSettings.description')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {settings.isError ? (
          <ErrorState message={errorMessage(settings.error, t)} onRetry={() => void settings.refetch()} />
        ) : !s ? (
          <Skeleton className="h-32" />
        ) : (
          <>
            <Row
              id="push-enabled"
              label={t('notifSettings.pushLabel')}
              hint={
                <>
                  {pushHint}
                  {s.pushSubscriptions > 0 ? (
                    <>
                      <br />
                      {t('notifSettings.pushDevices', { count: s.pushSubscriptions })}
                    </>
                  ) : null}
                </>
              }
              control={pushControl}
            />
            <Row
              id="email-enabled"
              label={t('notifSettings.emailLabel', { email: s.email })}
              hint={emailHint}
              control={
                <Switch
                  id="email-enabled"
                  checked={s.emailEnabled}
                  disabled={(!s.channels.email && !s.emailEnabled) || email.isPending}
                  onCheckedChange={(v) => email.mutate({ emailEnabled: v })}
                />
              }
            />
            <Button
              variant="outline"
              className="self-start"
              disabled={!s.channels.push && !s.channels.email}
              loading={test.isPending}
              loadingText={t('notifSettings.testSending')}
              onClick={() => test.mutate()}
            >
              {t('notifSettings.test')}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
