import { ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { formatMyStat, TeamCompare, useMyStats, type MyStatsMetric } from '@/entities/personal-kpi';
import { Skeleton } from '@/shared/ui';

const METRICS: readonly MyStatsMetric[] = [
  'received',
  'medianFirstResponseSeconds',
  'slaMetRate',
  'conversionRate',
];

/** FR-056: 7-day personal KPIs above «My leads»; failures stay silent so the list remains usable. */
export function MyStatsStrip() {
  const { t } = useTranslation();
  const stats = useMyStats('7d');
  if (stats.isError) return null;
  return (
    <section
      aria-label={t('myStats.stripTitle')}
      className="mb-4 flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-sm md:flex-row md:items-center"
      data-testid="my-stats-strip"
    >
      <h2 className="text-sm font-semibold md:w-32 md:shrink-0">{t('myStats.stripTitle')}</h2>
      <dl className="grid flex-1 grid-cols-2 gap-x-6 gap-y-3 lg:grid-cols-4">
        {METRICS.map((m) => (
          <div key={m} className="flex min-w-0 flex-col">
            <dt className="truncate text-xs text-muted-foreground">{t(`myStats.kpi.${m}`)}</dt>
            <dd className="flex flex-col">
              {stats.data ? (
                <>
                  <span className="text-lg font-semibold tabular" data-testid={`strip-${m}`}>
                    {formatMyStat(m, stats.data.me[m], t)}
                  </span>
                  {stats.data.team.average ? (
                    <TeamCompare metric={m} mine={stats.data.me[m]} team={stats.data.team.average[m]} />
                  ) : null}
                </>
              ) : (
                <Skeleton className="mt-1 h-6 w-16" />
              )}
            </dd>
          </div>
        ))}
      </dl>
      <Link
        to="/my-stats"
        className="inline-flex items-center gap-1 self-start text-sm font-medium text-primary hover:underline md:self-center"
      >
        {t('myStats.stripLink')}
        <ArrowRight className="size-4" aria-hidden />
      </Link>
    </section>
  );
}
