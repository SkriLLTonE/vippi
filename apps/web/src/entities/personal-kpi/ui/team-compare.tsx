import { useTranslation } from 'react-i18next';
import { cn } from '@/shared/lib';
import { compareToTeam, formatMyStat, type MyStatsMetric } from '../lib/metrics';

/** "Team average: X" under a personal KPI; colored only for metrics with a good direction. */
export function TeamCompare({
  metric,
  mine,
  team,
  className,
}: {
  metric: MyStatsMetric;
  mine: number | null;
  team: number | null;
  className?: string;
}) {
  const { t } = useTranslation();
  const verdict = compareToTeam(metric, mine, team);
  return (
    <span
      className={cn(
        'text-xs text-muted-foreground',
        verdict === 'better' && 'text-success',
        verdict === 'worse' && 'text-danger',
        className,
      )}
      data-testid={`team-${metric}`}
    >
      {t('myStats.teamAverage', { value: formatMyStat(metric, team, t) })}
      {verdict ? (
        <span className="sr-only"> ({t(verdict === 'better' ? 'myStats.better' : 'myStats.worse')})</span>
      ) : null}
    </span>
  );
}
