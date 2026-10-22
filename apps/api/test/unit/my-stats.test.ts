import { describe, expect, it } from 'vitest';
import { teamAverage, toMyStatsKpis } from '../../src/modules/analytics/domain/my-stats.js';

describe('personal statistics math (FR-056)', () => {
  it('maps an aggregate row with dashboard definitions', () => {
    expect(toMyStatsKpis({ leads: 4, closed: 3, median: 899.6, met: 1, breached: 3, won: 2 })).toEqual({
      received: 4,
      inWork: 1,
      closed: 3,
      medianFirstResponseSeconds: 900,
      slaMetRate: 0.25,
      breached: 3,
      won: 2,
      conversionRate: 0.5,
    });
    expect(toMyStatsKpis({ leads: 1, closed: 0, median: null, met: 0, breached: 0, won: 0 })).toMatchObject({
      medianFirstResponseSeconds: null,
      slaMetRate: null,
      conversionRate: 0,
    });
    expect(toMyStatsKpis(undefined)).toMatchObject({ received: 0, slaMetRate: null, conversionRate: null });
  });

  it('averages counts over everyone and rates over members where defined', () => {
    const a = toMyStatsKpis({ leads: 2, closed: 1, median: 1200, met: 1, breached: 1, won: 1 });
    const b = toMyStatsKpis({ leads: 1, closed: 1, median: 600, met: 1, breached: 0, won: 0 });
    const idle = toMyStatsKpis(undefined);
    const avg = teamAverage([a, b, idle]);
    expect(avg?.received).toBeCloseTo(1);
    expect(avg?.closed).toBeCloseTo(2 / 3);
    expect(avg?.medianFirstResponseSeconds).toBe(900);
    expect(avg?.slaMetRate).toBeCloseTo(0.75);
    expect(avg?.conversionRate).toBeCloseTo(0.25);
    expect(teamAverage([idle, idle, idle])).toMatchObject({
      received: 0,
      slaMetRate: null,
      medianFirstResponseSeconds: null,
    });
  });

  it('hides the average for teams below the minimum size', () => {
    const a = toMyStatsKpis({ leads: 2, closed: 1, median: 10, met: 1, breached: 1, won: 1 });
    expect(teamAverage([])).toBeNull();
    expect(teamAverage([a, a])).toBeNull();
  });
});
