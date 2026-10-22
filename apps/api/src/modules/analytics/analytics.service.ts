import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  addDaysToDateString,
  zonedDateString,
  zonedPeriodToUtc,
  type DailyRow,
  type DashboardQuery,
  type DashboardResponse,
  type LeadSource,
  type ManagerRow,
  type MyStatsQuery,
  type MyStatsResponse,
  type SourceRow,
} from '@vippi/shared';
import type { Actor } from '../../common/actor.js';
import { Clock } from '../../common/clock.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { ProductEvents } from '../../common/product-events.js';
import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import { SlaPolicyService } from '../sla/sla-policy.service.js';
import { teamAverage, toMyStatsKpis } from './domain/my-stats.js';

interface AggRow {
  key: string | null;
  leads: number;
  closed: number;
  median: number | null;
  met: number;
  breached: number;
  won: number;
  lost: number;
  forgotten: number;
}

const rate = (num: number, den: number): number | null => (den > 0 ? num / den : null);
const median = (v: number | null): number | null => (v === null ? null : Math.round(Number(v)));

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly sla: SlaPolicyService,
    private readonly events: ProductEvents,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  resolvePeriod(q: DashboardQuery, now: Date): { from: string; to: string } {
    const today = zonedDateString(now);
    switch (q.preset) {
      case 'today':
        return { from: today, to: today };
      case '7d':
        return { from: addDaysToDateString(today, -6), to: today };
      case '30d':
        return { from: addDaysToDateString(today, -29), to: today };
      default:
        return { from: q.from ?? today, to: q.to ?? today };
    }
  }

  private aggregate(orgId: string, start: Date, end: Date, forgottenBefore: Date, dim: Prisma.Sql) {
    return this.prisma.db.$queryRaw<AggRow[]>`
      SELECT ${dim} AS key,
        count(*)::int AS leads,
        (count(*) FILTER (WHERE "status" IN ('WON', 'LOST')))::int AS closed,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM ("firstResponseAt" - "receivedAt")))::float8 AS median,
        (count(*) FILTER (WHERE "slaState" = 'MET'))::int AS met,
        (count(*) FILTER (WHERE "slaState" = 'BREACHED'))::int AS breached,
        (count(*) FILTER (WHERE "status" = 'WON'))::int AS won,
        (count(*) FILTER (WHERE "status" = 'LOST' AND "lostReason" NOT IN ('DUPLICATE', 'SPAM')))::int AS lost,
        (count(*) FILTER (WHERE "firstResponseAt" IS NULL AND "status" = 'NEW' AND "receivedAt" < ${forgottenBefore}))::int AS forgotten
      FROM "Lead"
      WHERE "organizationId" = ${orgId}::uuid AND "deletedAt" IS NULL
        AND "receivedAt" >= ${start} AND "receivedAt" < ${end}
      GROUP BY 1`;
  }

  private noReaction(orgId: string, dim: Prisma.Sql) {
    return this.prisma.db.$queryRaw<Array<{ key: string | null; count: number }>>`
      SELECT ${dim} AS key, count(*)::int AS count
      FROM "Lead"
      WHERE "organizationId" = ${orgId}::uuid AND "deletedAt" IS NULL
        AND "slaState" = 'BREACHED' AND "firstResponseAt" IS NULL AND "status" NOT IN ('WON', 'LOST')
      GROUP BY 1`;
  }

  /** FR-050…FR-054 */
  async dashboard(actor: Actor, q: DashboardQuery): Promise<DashboardResponse> {
    const now = this.clock.now();
    const period = this.resolvePeriod(q, now);
    const { start, end } = zonedPeriodToUtc(period.from, period.to);
    const policy = await this.sla.getForOrg(actor.orgId);
    const forgottenBefore = new Date(now.getTime() - policy.forgottenAfterHours * 3_600_000);

    const total = Prisma.sql`'all'`;
    const byAssignee = Prisma.sql`"assigneeId"::text`;
    const bySource = Prisma.sql`"source"::text`;

    const [totals, noReactionTotal, managerAgg, managerNoReaction, sourceAgg, members, daily] = await Promise.all([
      this.aggregate(actor.orgId, start, end, forgottenBefore, total),
      this.noReaction(actor.orgId, total),
      this.aggregate(actor.orgId, start, end, forgottenBefore, byAssignee),
      this.noReaction(actor.orgId, byAssignee),
      this.aggregate(actor.orgId, start, end, forgottenBefore, bySource),
      this.prisma.db.membership.findMany({
        where: { organizationId: actor.orgId },
        select: { userId: true, role: true, status: true, user: { select: { fullName: true } } },
      }),
      this.config.features.DAILY_CHART ? this.daily(actor.orgId, start, end, period) : Promise.resolve(null),
    ]);

    const t = totals[0];
    const kpis: DashboardResponse['kpis'] = {
      totalLeads: t?.leads ?? 0,
      medianFirstResponseSeconds: median(t?.median ?? null),
      slaMetRate: t ? rate(t.met, t.met + t.breached) : null,
      breachedRate: t ? rate(t.breached, t.met + t.breached) : null,
      noReactionNow: noReactionTotal[0]?.count ?? 0,
      forgotten: t?.forgotten ?? 0,
      lost: t?.lost ?? 0,
      lostRate: t ? rate(t.lost, t.leads) : null,
      won: t?.won ?? 0,
      conversionRate: t ? rate(t.won, t.leads) : null,
    };

    const aggByUser = new Map(managerAgg.map((r) => [r.key, r]));
    const nrByUser = new Map(managerNoReaction.map((r) => [r.key, r.count]));
    const userIds = new Set<string | null>([
      ...members.filter((m) => m.status === 'ACTIVE' && m.role === 'MANAGER').map((m) => m.userId),
      ...managerAgg.map((r) => r.key),
      ...managerNoReaction.map((r) => r.key),
    ]);
    userIds.add(null);
    const names = new Map(members.map((m) => [m.userId, m.user.fullName]));
    const byManager: ManagerRow[] = [...userIds].map((userId) => {
      const a = aggByUser.get(userId);
      return {
        userId,
        fullName: userId ? (names.get(userId) ?? null) : null,
        leads: a?.leads ?? 0,
        medianFirstResponseSeconds: median(a?.median ?? null),
        slaMetRate: a ? rate(a.met, a.met + a.breached) : null,
        breachedRate: a ? rate(a.breached, a.met + a.breached) : null,
        breached: a?.breached ?? 0,
        noReactionNow: nrByUser.get(userId) ?? 0,
        won: a?.won ?? 0,
        lost: a?.lost ?? 0,
      };
    });
    byManager.sort((x, y) => (y.breachedRate ?? -1) - (x.breachedRate ?? -1) || y.leads - x.leads);

    const sources: SourceRow[] = sourceAgg.map((a) => ({
      source: a.key as LeadSource,
      leads: a.leads,
      medianFirstResponseSeconds: median(a.median),
      slaMetRate: rate(a.met, a.met + a.breached),
      breachedRate: rate(a.breached, a.met + a.breached),
      breached: a.breached,
      won: a.won,
      lost: a.lost,
    }));
    sources.sort((x, y) => y.leads - x.leads);

    this.events.emit('dashboard_viewed', { organizationId: actor.orgId, userId: actor.userId }, { preset: q.preset ?? 'custom' });
    return {
      period: { ...period, timezone: 'Asia/Tashkent' },
      kpis,
      byManager,
      bySource: sources,
      daily,
    };
  }

  /** FR-056: the caller's KPIs next to the team mean; colleagues appear only inside aggregates. */
  async myStats(actor: Actor, q: MyStatsQuery): Promise<MyStatsResponse> {
    const now = this.clock.now();
    const period = this.resolvePeriod(q, now);
    const { start, end } = zonedPeriodToUtc(period.from, period.to);
    const policy = await this.sla.getForOrg(actor.orgId);
    const forgottenBefore = new Date(now.getTime() - policy.forgottenAfterHours * 3_600_000);

    const [byAssignee, managers, dailyRows] = await Promise.all([
      this.aggregate(actor.orgId, start, end, forgottenBefore, Prisma.sql`"assigneeId"::text`),
      this.prisma.db.membership.findMany({
        where: { organizationId: actor.orgId, status: 'ACTIVE', role: 'MANAGER' },
        select: { userId: true },
      }),
      this.prisma.db.$queryRaw<Array<{ date: string; leads: number; breached: number; team: number }>>`
        SELECT to_char(("receivedAt" AT TIME ZONE 'Asia/Tashkent')::date, 'YYYY-MM-DD') AS date,
          (count(*) FILTER (WHERE "assigneeId" = ${actor.userId}::uuid))::int AS leads,
          (count(*) FILTER (WHERE "assigneeId" = ${actor.userId}::uuid AND "slaState" = 'BREACHED'))::int AS breached,
          (count(*) FILTER (WHERE "assigneeId" IS NOT NULL))::int AS team
        FROM "Lead"
        WHERE "organizationId" = ${actor.orgId}::uuid AND "deletedAt" IS NULL
          AND "receivedAt" >= ${start} AND "receivedAt" < ${end}
        GROUP BY 1`,
    ]);

    // Same population as the dashboard's manager table (FR-052), minus the "unassigned" row.
    const aggByUser = new Map(byAssignee.filter((r) => r.key !== null).map((r) => [r.key, r]));
    const team = new Set<string | null>([...managers.map((m) => m.userId), ...aggByUser.keys()]);
    const average = teamAverage([...team].map((userId) => toMyStatsKpis(aggByUser.get(userId))));

    const byDate = new Map(dailyRows.map((r) => [r.date, r]));
    const daily = this.days(period).map((date) => {
      const r = byDate.get(date);
      return {
        date,
        leads: r?.leads ?? 0,
        breached: r?.breached ?? 0,
        teamAverageLeads: average ? (r?.team ?? 0) / team.size : null,
      };
    });

    this.events.emit('my_stats_viewed', { organizationId: actor.orgId, userId: actor.userId }, { preset: q.preset });
    return {
      period: { ...period, timezone: 'Asia/Tashkent' },
      me: toMyStatsKpis(aggByUser.get(actor.userId)),
      team: { size: team.size, average },
      daily,
    };
  }

  private days(period: { from: string; to: string }): string[] {
    const out: string[] = [];
    for (let d = period.from; d <= period.to; d = addDaysToDateString(d, 1)) out.push(d);
    return out;
  }

  private async daily(orgId: string, start: Date, end: Date, period: { from: string; to: string }): Promise<DailyRow[]> {
    const rows = await this.prisma.db.$queryRaw<Array<{ date: string; leads: number; breached: number }>>`
      SELECT to_char(("receivedAt" AT TIME ZONE 'Asia/Tashkent')::date, 'YYYY-MM-DD') AS date,
        count(*)::int AS leads,
        (count(*) FILTER (WHERE "slaState" = 'BREACHED'))::int AS breached
      FROM "Lead"
      WHERE "organizationId" = ${orgId}::uuid AND "deletedAt" IS NULL
        AND "receivedAt" >= ${start} AND "receivedAt" < ${end}
      GROUP BY 1`;
    const byDate = new Map(rows.map((r) => [r.date, r]));
    return this.days(period).map((date) => {
      const r = byDate.get(date);
      return { date, leads: r?.leads ?? 0, breached: r?.breached ?? 0 };
    });
  }
}
