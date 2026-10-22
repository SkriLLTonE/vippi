import type { MyStatsKpis } from '@vippi/shared';
import { formatDuration, formatNumber, formatPercent, type Translate } from '@/shared/lib';

export type MyStatsMetric = keyof MyStatsKpis;

/** Which direction is good; null — volume metrics that are not "better" or "worse". */
const BETTER: Record<MyStatsMetric, 'higher' | 'lower' | null> = {
  received: null,
  inWork: null,
  closed: null,
  medianFirstResponseSeconds: 'lower',
  slaMetRate: 'higher',
  breached: 'lower',
  won: 'higher',
  conversionRate: 'higher',
};

const oneDecimal = (v: number) => formatNumber(Math.round(v * 10) / 10).replace('.', ',');

export function formatMyStat(metric: MyStatsMetric, value: number | null, t: Translate): string {
  if (value === null) return '—';
  if (metric === 'slaMetRate' || metric === 'conversionRate') return formatPercent(value);
  if (metric === 'medianFirstResponseSeconds') return formatDuration(value, t);
  return Number.isInteger(value) ? formatNumber(value) : oneDecimal(value);
}

export function compareToTeam(
  metric: MyStatsMetric,
  mine: number | null,
  team: number | null,
): 'better' | 'worse' | null {
  const better = BETTER[metric];
  if (!better || mine === null || team === null || mine === team) return null;
  return (better === 'higher') === mine > team ? 'better' : 'worse';
}
