import { useQuery } from '@tanstack/react-query';
import type { OrganizationDto } from '@vippi/shared';
import { ListChecks, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAiStatus } from '@/entities/ai-insight';
import { useCan } from '@/entities/session';
import { apiRequest } from '@/shared/api';
import { errorMessage, formatNumber } from '@/shared/lib';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  DelayedSkeleton,
  ErrorState,
  Skeleton,
  Switch,
} from '@/shared/ui';
import { SettingsLayout } from '@/widgets/settings-nav';
import { organizationKey, useUpdateOrg } from '../model/use-update-org';
import { CompanyCard } from './company-card';
import { IndustryCard } from './industry-card';
import { LeadFieldsCard } from './lead-fields-card';
import { StatusLabelsCard } from './status-labels-card';

function AiCard({ canManage }: { canManage: boolean }) {
  const { t } = useTranslation();
  const status = useAiStatus();
  const update = useUpdateOrg();
  const [confirmOpen, setConfirmOpen] = useState(false);
  if (status.isPending) {
    return (
      <DelayedSkeleton>
        <Skeleton className="h-48" />
      </DelayedSkeleton>
    );
  }
  if (status.isError) return <ErrorState message={errorMessage(status.error, t)} onRetry={() => void status.refetch()} />;
  const s = status.data;
  const usage = s.usage;
  return (
    <Card data-testid="ai-settings">
      <CardHeader>
        <CardTitle>{t('org.aiTitle')}</CardTitle>
        <CardDescription>{t('org.aiDescription')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex items-start gap-2 text-sm">
          {s.mode === 'AI' ? (
            <>
              <Sparkles className="mt-0.5 size-4 text-primary" aria-hidden />
              <span>{t('ai.mode.ai', { provider: 'Gemini', model: s.model ?? '' })}</span>
            </>
          ) : (
            <>
              <ListChecks className="mt-0.5 size-4 text-muted-foreground" aria-hidden />
              <span>
                {t('ai.mode.rules')}
                {s.reason ? ` — ${t(`ai.reason.${s.reason}`)}` : ''}
              </span>
            </>
          )}
        </div>
        <div className="flex items-start justify-between gap-4 rounded-md border border-border p-3">
          <div>
            <label htmlFor="ai-consent" className="text-sm font-medium">
              {t('org.aiConsent')}
            </label>
            <p className="text-xs text-muted-foreground">{t('org.aiConsentHint')}</p>
          </div>
          <Switch
            id="ai-consent"
            checked={s.orgConsent}
            disabled={!canManage || update.isPending}
            onCheckedChange={(v) => (v ? setConfirmOpen(true) : update.mutate({ aiExternalProcessingEnabled: false }))}
          />
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-md bg-background-subtle p-3">
            <dt className="text-muted-foreground">{t('org.requestsToday')}</dt>
            <dd className="text-lg font-semibold tabular">
              {formatNumber(usage.requestsToday)} / {formatNumber(usage.requestLimit)}
            </dd>
          </div>
          <div className="rounded-md bg-background-subtle p-3">
            <dt className="text-muted-foreground">{t('org.tokensToday')}</dt>
            <dd className="text-lg font-semibold tabular">
              {formatNumber(usage.tokensToday)} / {formatNumber(usage.tokenLimit)}
            </dd>
          </div>
        </dl>
        {!canManage ? <p className="text-xs text-muted-foreground">{t('org.viewOnly')}</p> : null}
      </CardContent>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        destructive={false}
        title={t('org.aiConfirmTitle')}
        description={t('org.aiConfirmText')}
        confirmLabel={t('org.aiConfirmAction')}
        loading={update.isPending}
        onConfirm={() => update.mutate({ aiExternalProcessingEnabled: true }, { onSettled: () => setConfirmOpen(false) })}
      />
    </Card>
  );
}

export function SettingsOrganizationPage() {
  const { t } = useTranslation();
  const can = useCan();
  const org = useQuery({ queryKey: organizationKey, queryFn: ({ signal }) => apiRequest<OrganizationDto>('/organization', { signal }) });
  return (
    <SettingsLayout>
      <div className="grid max-w-5xl gap-6 lg:grid-cols-2">
        {org.isPending ? (
          <DelayedSkeleton>
            <Skeleton className="h-48" />
          </DelayedSkeleton>
        ) : org.isError ? (
          <ErrorState message={errorMessage(org.error, t)} onRetry={() => void org.refetch()} />
        ) : (
          <CompanyCard org={org.data} editable={can('org.manage')} />
        )}
        <AiCard canManage={can('org.manage')} />
        {org.data ? <IndustryCard org={org.data} editable={can('org.manage')} /> : null}
        {org.data ? <StatusLabelsCard org={org.data} editable={can('org.manage')} /> : null}
        <LeadFieldsCard canManage={can('leadFields.manage')} />
      </div>
    </SettingsLayout>
  );
}
