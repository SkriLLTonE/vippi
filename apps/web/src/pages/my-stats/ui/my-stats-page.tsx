import { MY_STATS_MIN_TEAM_SIZE, type DashboardPreset, type MyStatsKpis } from '@vippi/shared';
import { Info } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatMyStat, TeamCompare, useMyStats, type MyStatsMetric } from '@/entities/personal-kpi';
import { errorMessage } from '@/shared/lib';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DelayedSkeleton,
  ErrorState,
  PageHeader,
  Segmented,
  Skeleton,
  Tooltip,
} from '@/shared/ui';
import { TrendChart } from './trend-chart';

const METRICS: readonly MyStatsMetric[] = [
  'received',
  'inWork',
  'closed',
  'won',
  'medianFirstResponseSeconds',
  'slaMetRate',
  'breached',
  'conversionRate',
];

function KpiCard({ metric, me, team }: { metric: MyStatsMetric; me: MyStatsKpis; team: MyStatsKpis | null }) {
  const { t } = useTranslation();
  const hint = t(`myStats.hint.${metric}`);
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm text-muted-foreground">{t(`myStats.kpi.${metric}`)}</span>
        <Tooltip content={hint}>
          <button
            type="button"
            className="-m-1.5 inline-flex size-7 items-center justify-center rounded-md text-subtle-foreground hover:text-foreground"
            aria-label={hint}
          >
            <Info className="size-4" aria-hidden />
          </button>
        </Tooltip>
      </div>
      <span className="text-3xl font-semibold tabular" data-testid={`my-${metric}`}>
        {formatMyStat(metric, me[metric], t)}
      </span>
      {team ? <TeamCompare metric={metric} mine={me[metric]} team={team[metric]} /> : null}
    </div>
  );
}

/** FR-056: personal KPIs of the signed-in user next to the team average (UX §5.7.1). */
export function MyStatsPage() {
  const { t } = useTranslation();
  const [preset, setPreset] = useState<DashboardPreset>('7d');
  const stats = useMyStats(preset);

  const header = (
    <PageHeader
      title={t('myStats.title')}
      description={t('myStats.description')}
      actions={
        <Segmented
          label={t('filters.period')}
          value={preset}
          onChange={setPreset}
          options={[
            { value: 'today', label: t('period.today') },
            { value: '7d', label: t('period.7d') },
            { value: '30d', label: t('period.30d') },
          ]}
        />
      }
    />
  );

  if (stats.isPending) {
    return (
      <>
        {header}
        <DelayedSkeleton>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {METRICS.map((m) => (
              <Skeleton key={m} className="h-32" />
            ))}
          </div>
        </DelayedSkeleton>
      </>
    );
  }
  if (stats.isError && !stats.data) {
    return (
      <>
        {header}
        <ErrorState message={errorMessage(stats.error, t)} onRetry={() => void stats.refetch()} />
      </>
    );
  }

  const { me, team, daily } = stats.data;
  return (
    <>
      {header}
      {stats.isError ? (
        <ErrorState message={errorMessage(stats.error, t)} onRetry={() => void stats.refetch()} />
      ) : null}
      <section
        aria-label={t('myStats.kpis')}
        className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4"
      >
        {METRICS.map((m) => (
          <KpiCard key={m} metric={m} me={me} team={team.average} />
        ))}
      </section>
      <p className="mt-3 text-xs text-muted-foreground" data-testid="team-note">
        {team.average ? t('myStats.teamNote') : t('myStats.teamHidden', { count: MY_STATS_MIN_TEAM_SIZE })}
      </p>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{t('myStats.trend')}</CardTitle>
        </CardHeader>
        <CardContent>
          {daily.every((d) => d.leads === 0) ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t('myStats.noData')}</p>
          ) : (
            <TrendChart rows={daily} />
          )}
        </CardContent>
      </Card>
    </>
  );
}
