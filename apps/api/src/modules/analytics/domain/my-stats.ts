import { MY_STATS_MIN_TEAM_SIZE, type MyStatsKpis } from '@vippi/shared';

export interface MemberAgg {
  leads: number;
  closed: number;
  median: number | null;
  met: number;
  breached: number;
  won: number;
}

const rate = (num: number, den: number): number | null => (den > 0 ? num / den : null);

/** Same definitions as the owner dashboard (FR-051): SLA rate = MET / (MET + BREACHED), conversion = WON / leads. */
export function toMyStatsKpis(a: MemberAgg | undefined): MyStatsKpis {
  return {
    received: a?.leads ?? 0,
    inWork: a ? a.leads - a.closed : 0,
    closed: a?.closed ?? 0,
    medianFirstResponseSeconds: !a || a.median === null ? null : Math.round(Number(a.median)),
    slaMetRate: a ? rate(a.met, a.met + a.breached) : null,
    breached: a?.breached ?? 0,
    won: a?.won ?? 0,
    conversionRate: a ? rate(a.won, a.leads) : null,
  };
}

const mean = (values: number[]): number => values.reduce((s, v) => s + v, 0) / values.length;
const meanDefined = (values: Array<number | null>): number | null => {
  const defined = values.filter((v): v is number => v !== null);
  return defined.length > 0 ? mean(defined) : null;
};

/**
 * Mean per team member. Counts average over everyone (members without leads count as 0);
 * rates and the median average over members for whom they are defined.
 * Returns null for teams smaller than MY_STATS_MIN_TEAM_SIZE (the average would reveal a colleague).
 */
export function teamAverage(members: MyStatsKpis[]): MyStatsKpis | null {
  if (members.length < MY_STATS_MIN_TEAM_SIZE) return null;
  const median = meanDefined(members.map((m) => m.medianFirstResponseSeconds));
  return {
    received: mean(members.map((m) => m.received)),
    inWork: mean(members.map((m) => m.inWork)),
    closed: mean(members.map((m) => m.closed)),
    medianFirstResponseSeconds: median === null ? null : Math.round(median),
    slaMetRate: meanDefined(members.map((m) => m.slaMetRate)),
    breached: mean(members.map((m) => m.breached)),
    won: mean(members.map((m) => m.won)),
    conversionRate: meanDefined(members.map((m) => m.conversionRate)),
  };
}
