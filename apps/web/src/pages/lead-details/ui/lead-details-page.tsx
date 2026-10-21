import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { useLead } from '@/entities/lead';
import { isApiError } from '@/shared/api';
import { errorMessage, useMediaQuery } from '@/shared/lib';
import {
  DelayedSkeleton,
  ErrorState,
  NotFoundState,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/shared/ui';
import { useLeadAccess } from '../model/use-lead-access';
import { AiPanel } from './ai-panel';
import { LeadData } from './lead-data';
import { LeadHeader } from './lead-header';
import { LeadTimeline } from './lead-timeline';

export function LeadDetailsPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const lead = useLead(id);
  const access = useLeadAccess(lead.data);
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  if (lead.isPending) {
    return (
      <DelayedSkeleton>
        <div className="flex flex-col gap-4">
          <Skeleton className="h-32" />
          <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
            <Skeleton className="h-96" />
            <Skeleton className="h-96" />
          </div>
        </div>
      </DelayedSkeleton>
    );
  }
  if (lead.isError && !lead.data) {
    if (isApiError(lead.error) && (lead.error.status === 404 || lead.error.status === 400)) {
      return <NotFoundState title={t('lead.notFound')} />;
    }
    return <ErrorState message={errorMessage(lead.error, t)} onRetry={() => void lead.refetch()} />;
  }
  const data = lead.data;

  return (
    <div className="flex flex-col gap-4">
      <Link to="/leads" className="inline-flex min-h-7 items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden />
        {t('nav.leads')}
      </Link>
      <LeadHeader lead={data} />
      {isDesktop ? (
        <div className="grid items-start gap-4 lg:grid-cols-[3fr_2fr]">
          <div className="flex min-w-0 flex-col gap-4">
            <LeadData lead={data} />
            <LeadTimeline leadId={data.id} />
          </div>
          {access.canUseAi ? <AiPanel lead={data} canAct={access.canAct} /> : null}
        </div>
      ) : (
        <Tabs defaultValue="details">
          <TabsList label={t('lead.sections')}>
            <TabsTrigger value="details">{t('lead.tabDetails')}</TabsTrigger>
            <TabsTrigger value="history">{t('lead.tabHistory')}</TabsTrigger>
            {access.canUseAi ? <TabsTrigger value="ai">AI</TabsTrigger> : null}
          </TabsList>
          <TabsContent value="details">
            <LeadData lead={data} />
          </TabsContent>
          <TabsContent value="history">
            <LeadTimeline leadId={data.id} />
          </TabsContent>
          {access.canUseAi ? (
            <TabsContent value="ai">
              <AiPanel lead={data} canAct={access.canAct} />
            </TabsContent>
          ) : null}
        </Tabs>
      )}
    </div>
  );
}
