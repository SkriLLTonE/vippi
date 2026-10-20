import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { DashboardPreset, DashboardResponse, ManagerRow } from '@vippi/shared';
import { ArrowUpRight, Info } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { SourceLabel } from '@/entities/lead';
import { useFeature } from '@/entities/session';
import { apiRequest, type QueryParams } from '@/shared/api';
import { cn, errorMessage, formatDuration, formatNumber, formatPercent, todayTashkent } from '@/shared/lib';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DelayedSkeleton,
  ErrorState,
  Input,
  NativeSelect,
  PageHeader,
  Skeleton,
  SortableTh,
  Table,
  Td,
  Th,
  Tooltip,
  Tr,
} from '@/shared/ui';
import { DailyChart } from './daily-chart';
import { WeeklySummaryCard } from './weekly-summary-card';

type PeriodChoice = DashboardPreset | 'custom';

function KpiCard({
  label,
  value,
  hint,
  to,
  accent,
  testId,
}: {
  label: string;
  value: ReactNode;
  hint: string;
  to?: string;
  accent?: boolean;
  testId?: string;
}) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="flex items-center gap-1">
          <Tooltip content={hint}>
            <button type="button" className="text-subtle-foreground hover:text-foreground" aria-label={hint} onClick={(e) => e.preventDefault()}>
              <Info className="size-4" aria-hidden />
            </button>
          </Tooltip>
          {to ? <ArrowUpRight className="size-4 text-muted-foreground" aria-hidden /> : null}
        </span>
      </div>
      <span className={cn('text-3xl font-semibold tabular', accent && 'text-danger')} data-testid={testId}>
        {value}
      </span>
    </>
  );
  const className = cn('flex flex-col gap-2 rounded-lg border border-border bg-surface p-4 shadow-sm', accent && 'border-danger-border');
  return to ? (
    <Link to={to} className={cn(className, 'hover:bg-background-subtle')}>
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}

type ManagerSortKey = 'leads' | 'breachedRate' | 'medianFirstResponseSeconds' | 'noReactionNow' | 'won';

function ManagersTable({ rows, period }: { rows: ManagerRow[]; period: { from: string; to: string } }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [sort, setSort] = useState<{ key: ManagerSortKey; dir: 'asc' | 'desc' }>({ key: 'breachedRate', dir: 'desc' });
  const sorted = [...rows].sort((a, b) => {
    const av = a[sort.key] ?? -1;
    const bv = b[sort.key] ?? -1;
    return sort.dir === 'asc' ? av - bv : bv - av;
  });
  const th = (key: ManagerSortKey, label: string) => (
    <SortableTh
      className="text-right"
      label={label}
      direction={sort.key === key ? sort.dir : null}
      onToggle={() => setSort((s) => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }))}
    />
  );
  if (rows.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">{t('dashboard.noData')}</p>;
  return (
    <Table caption={t('dashboard.byManager')}>
      <thead>
        <tr>
          <Th>{t('dashboard.manager')}</Th>
          {th('leads', t('dashboard.leads'))}
          {th('medianFirstResponseSeconds', t('dashboard.median'))}
          {th('breachedRate', t('dashboard.breachedRate'))}
          {th('noReactionNow', t('dashboard.noReaction'))}
          {th('won', t('dashboard.won'))}
        </tr>
      </thead>
      <tbody>
        {sorted.map((r) => {
          const href = `/leads?assigneeId=${r.userId ?? 'none'}&from=${period.from}&to=${period.to}`;
          return (
            <Tr key={r.userId ?? 'none'} className="cursor-pointer hover:bg-background-subtle" onClick={() => void navigate(href)}>
              <Td>
                <Link to={href} className="font-medium text-primary hover:underline">
                  {r.fullName ?? t('lead.unassigned')}
                </Link>
              </Td>
              <Td className="text-right tabular">{r.leads}</Td>
              <Td className="text-right tabular">
                {r.medianFirstResponseSeconds === null ? '—' : formatDuration(r.medianFirstResponseSeconds, t)}
              </Td>
              <Td className={cn('text-right tabular', (r.breachedRate ?? 0) > 0.2 && 'font-semibold text-danger')}>
                {formatPercent(r.breachedRate)}
              </Td>
              <Td className={cn('text-right tabular', r.noReactionNow > 0 && 'text-danger')}>{r.noReactionNow}</Td>
              <Td className="text-right tabular">{r.won}</Td>
            </Tr>
          );
        })}
      </tbody>
    </Table>
  );
}

export function DashboardPage() {
  const { t } = useTranslation();
  const showDaily = useFeature('DAILY_CHART');
  const showWeekly = useFeature('WEEKLY_SUMMARY');
  const today = todayTashkent();
  const [choice, setChoice] = useState<PeriodChoice>('7d');
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const query: QueryParams = choice === 'custom' ? { from, to } : { preset: choice };
  const dash = useQuery({
    queryKey: ['analytics', 'dashboard', query],
    queryFn: ({ signal }) => apiRequest<DashboardResponse>('/analytics/dashboard', { query, signal }),
    placeholderData: keepPreviousData,
    enabled: choice !== 'custom' || (from !== '' && to !== '' && from <= to),
  });

  const header = (
    <PageHeader
      title={t('nav.dashboard')}
      description={t('dashboard.timezone')}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <NativeSelect aria-label={t('filters.period')} className="w-auto" value={choice} onChange={(e) => setChoice(e.target.value as PeriodChoice)}>
            <option value="today">{t('period.today')}</option>
            <option value="7d">{t('period.7d')}</option>
            <option value="30d">{t('period.30d')}</option>
            <option value="custom">{t('period.custom')}</option>
          </NativeSelect>
          {choice === 'custom' ? (
            <>
              <Input type="date" aria-label={t('period.from')} className="w-40" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
              <Input type="date" aria-label={t('period.to')} className="w-40" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} />
            </>
          ) : null}
        </div>
      }
    />
  );

  if (dash.isPending) {
    return (
      <>
        {header}
        <DelayedSkeleton>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-28" />
            ))}
          </div>
        </DelayedSkeleton>
      </>
    );
  }
  if (dash.isError && !dash.data) {
    return (
      <>
        {header}
        <ErrorState message={errorMessage(dash.error, t)} onRetry={() => void dash.refetch()} />
      </>
    );
  }
  const { kpis, period } = dash.data;
  const median = kpis.medianFirstResponseSeconds;

  return (
    <>
      {header}
      {dash.isError ? <ErrorState message={errorMessage(dash.error, t)} onRetry={() => void dash.refetch()} /> : null}
      <section aria-label={t('dashboard.kpis')} className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard label={t('dashboard.kpi.total')} value={formatNumber(kpis.totalLeads)} hint={t('dashboard.hint.total')} testId="kpi-total" />
        <KpiCard
          label={t('dashboard.kpi.median')}
          value={median === null ? '—' : formatDuration(median, t)}
          hint={t('dashboard.hint.median')}
        />
        <KpiCard label={t('dashboard.kpi.slaMet')} value={formatPercent(kpis.slaMetRate)} hint={t('dashboard.hint.slaMet')} />
        <KpiCard label={t('dashboard.kpi.breached')} value={formatPercent(kpis.breachedRate)} hint={t('dashboard.hint.breached')} />
        <KpiCard
          label={t('dashboard.kpi.noReaction')}
          value={kpis.noReactionNow}
          hint={t('dashboard.hint.noReaction')}
          to="/overdue"
          accent={kpis.noReactionNow > 0}
          testId="kpi-no-reaction"
        />
        <KpiCard label={t('dashboard.kpi.forgotten')} value={kpis.forgotten} hint={t('dashboard.hint.forgotten')} />
        <KpiCard
          label={t('dashboard.kpi.lost')}
          value={`${kpis.lost} (${formatPercent(kpis.lostRate)})`}
          hint={t('dashboard.hint.lost')}
        />
        <KpiCard
          label={t('dashboard.kpi.won')}
          value={`${kpis.won} (${formatPercent(kpis.conversionRate)})`}
          hint={t('dashboard.hint.won')}
        />
      </section>

      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('dashboard.byManager')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ManagersTable rows={dash.data.byManager} period={period} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t('dashboard.bySource')}</CardTitle>
          </CardHeader>
          <CardContent>
            {dash.data.bySource.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">{t('dashboard.noData')}</p>
            ) : (
              <Table caption={t('dashboard.bySource')}>
                <thead>
                  <tr>
                    <Th>{t('lead.field.source')}</Th>
                    <Th className="text-right">{t('dashboard.leads')}</Th>
                    <Th className="text-right">{t('dashboard.median')}</Th>
                    <Th className="text-right">{t('dashboard.slaMetRate')}</Th>
                    <Th className="text-right">{t('dashboard.won')}</Th>
                  </tr>
                </thead>
                <tbody>
                  {dash.data.bySource.map((r) => (
                    <Tr key={r.source}>
                      <Td>
                        <SourceLabel source={r.source} />
                      </Td>
                      <Td className="text-right tabular">{r.leads}</Td>
                      <Td className="text-right tabular">
                        {r.medianFirstResponseSeconds === null ? '—' : formatDuration(r.medianFirstResponseSeconds, t)}
                      </Td>
                      <Td className="text-right tabular">{formatPercent(r.slaMetRate)}</Td>
                      <Td className="text-right tabular">{r.won}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {showDaily && dash.data.daily ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>{t('dashboard.daily')}</CardTitle>
          </CardHeader>
          <CardContent>
            {dash.data.daily.every((d) => d.leads === 0) ? (
              <p className="py-6 text-center text-sm text-muted-foreground">{t('dashboard.noData')}</p>
            ) : (
              <DailyChart rows={dash.data.daily} />
            )}
          </CardContent>
        </Card>
      ) : null}

      {showWeekly ? (
        <div className="mt-6">
          <WeeklySummaryCard />
        </div>
      ) : null}
    </>
  );
}
