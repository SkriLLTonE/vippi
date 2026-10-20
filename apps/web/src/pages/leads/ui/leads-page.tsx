import { FileSpreadsheet, KeyRound, SearchX, UserPlus, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useLeadList } from '@/entities/lead';
import { useCan } from '@/entities/session';
import { CreateLeadButton } from '@/features/lead-create';
import { errorMessage } from '@/shared/lib';
import { Button, Card, DelayedSkeleton, EmptyState, ErrorState, PageHeader, Pagination, Skeleton } from '@/shared/ui';
import { useLeadFilters } from '../model/use-lead-filters';
import { ExportCsvButton } from './export-csv-button';
import { FiltersBar } from './filters-bar';
import { ImportCsvButton } from './import-csv-dialog';
import { LeadsTable } from './leads-table';

function PathCard({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center gap-2 font-medium">
        <Icon className="size-5 text-primary" aria-hidden />
        {title}
      </div>
      {children}
    </div>
  );
}

/** Empty organization: two onboarding paths (UX §5.2, ADR-004). The choice is not stored. */
function Onboarding() {
  const { t } = useTranslation();
  const can = useCan();
  return (
    <Card className="p-6" data-testid="onboarding">
      <h2 className="text-lg font-semibold">{t('onboarding.title')}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t('onboarding.subtitle')}</p>
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-muted-foreground">{t('onboarding.withCrm')}</h3>
          {can('apiKey.manage') ? (
            <PathCard icon={KeyRound} title={t('onboarding.apiKey')}>
              <p className="text-sm text-muted-foreground">{t('onboarding.apiKeyText')}</p>
              <Button asChild variant="outline" size="sm" className="self-start">
                <Link to="/settings/api-keys">{t('onboarding.apiKeyAction')}</Link>
              </Button>
            </PathCard>
          ) : null}
          {can('lead.import') ? (
            <PathCard icon={FileSpreadsheet} title={t('onboarding.csv')}>
              <p className="text-sm text-muted-foreground">{t('onboarding.csvText')}</p>
              <ImportCsvButton size="sm" className="self-start" />
            </PathCard>
          ) : null}
          <p className="text-xs text-subtle-foreground">{t('onboarding.crmPlanned')}</p>
        </section>
        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-muted-foreground">{t('onboarding.noCrm')}</h3>
          <PathCard icon={FileSpreadsheet} title={t('onboarding.firstLead')}>
            <p className="text-sm text-muted-foreground">{t('onboarding.firstLeadText')}</p>
            <CreateLeadButton size="sm" className="self-start" label={t('onboarding.firstLeadAction')} />
          </PathCard>
          {can('invitation.manage') ? (
            <PathCard icon={UserPlus} title={t('onboarding.invite')}>
              <p className="text-sm text-muted-foreground">{t('onboarding.inviteText')}</p>
              <Button asChild variant="outline" size="sm" className="self-start">
                <Link to="/team">{t('onboarding.inviteAction')}</Link>
              </Button>
            </PathCard>
          ) : null}
        </section>
      </div>
    </Card>
  );
}

export function LeadsPage() {
  const { t } = useTranslation();
  const can = useCan();
  const filters = useLeadFilters();
  const { state, update, reset, activeCount, filterQuery } = filters;
  const query = { ...filterQuery, page: state.page, pageSize: state.pageSize };
  const leads = useLeadList(query);
  const isManager = !can('lead.readAll');
  const onlyMine = activeCount === 1 && state.assigneeId === 'me';
  const unfiltered = activeCount === 0 || (isManager && onlyMine);

  let body: ReactNode;
  if (leads.isPending) {
    body = (
      <DelayedSkeleton>
        <div className="flex flex-col gap-2">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-11" />
          ))}
        </div>
      </DelayedSkeleton>
    );
  } else if (leads.isError && !leads.data) {
    body = <ErrorState message={errorMessage(leads.error, t)} onRetry={() => void leads.refetch()} />;
  } else if (leads.data.total === 0) {
    if (unfiltered && !isManager) body = <Onboarding />;
    else if (unfiltered) body = <EmptyState title={t('state.empty.leadsManager')} description={t('state.empty.leadsManagerText')} />;
    else
      body = (
        <EmptyState
          icon={SearchX}
          title={t('state.empty.filtered')}
          action={
            <Button variant="outline" onClick={reset}>
              {t('filters.reset')}
            </Button>
          }
        />
      );
  } else {
    body = (
      <>
        {leads.isError ? <ErrorState message={errorMessage(leads.error, t)} onRetry={() => void leads.refetch()} /> : null}
        <LeadsTable items={leads.data.items} sort={state.sort} onSort={(sort) => update({ sort })} />
        <Pagination
          page={leads.data.page}
          pageSize={leads.data.pageSize}
          total={leads.data.total}
          onPageChange={(page) => update({ page })}
          onPageSizeChange={(pageSize) => update({ pageSize })}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={t('nav.leads')}
        count={leads.data?.total}
        actions={
          <>
            <CreateLeadButton />
            {can('lead.import') ? <ImportCsvButton /> : null}
            {can('lead.export') ? <ExportCsvButton filters={filterQuery} /> : null}
          </>
        }
      />
      <FiltersBar filters={filters} />
      {body}
    </>
  );
}
