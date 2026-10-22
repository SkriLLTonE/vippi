import { z } from 'zod';
import type { LeadSource } from '../enums.js';
import { dateOnlySchema } from './common.js';
import { MAX_PERIOD_DAYS } from './leads.js';

export const DASHBOARD_PRESETS = ['today', '7d', '30d'] as const;
export type DashboardPreset = (typeof DASHBOARD_PRESETS)[number];

export const DashboardQuerySchema = z
  .object({
    preset: z.enum(DASHBOARD_PRESETS).optional(),
    from: dateOnlySchema.optional(),
    to: dateOnlySchema.optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (!v.preset && (!v.from || !v.to)) {
      ctx.addIssue({ code: 'custom', path: ['from'], message: 'period_required' });
      return;
    }
    if (v.from && v.to) {
      if (v.from > v.to) ctx.addIssue({ code: 'custom', path: ['from'], message: 'from_after_to' });
      const days = (Date.parse(`${v.to}T00:00:00Z`) - Date.parse(`${v.from}T00:00:00Z`)) / 86_400_000 + 1;
      if (days > MAX_PERIOD_DAYS) ctx.addIssue({ code: 'custom', path: ['to'], message: 'period_too_long' });
    }
  });
export type DashboardQuery = z.infer<typeof DashboardQuerySchema>;

export interface DashboardKpis {
  totalLeads: number;
  medianFirstResponseSeconds: number | null;
  slaMetRate: number | null;
  breachedRate: number | null;
  noReactionNow: number;
  forgotten: number;
  lost: number;
  lostRate: number | null;
  won: number;
  conversionRate: number | null;
}

export interface ManagerRow {
  userId: string | null;
  fullName: string | null;
  leads: number;
  medianFirstResponseSeconds: number | null;
  slaMetRate: number | null;
  breachedRate: number | null;
  breached: number;
  noReactionNow: number;
  won: number;
  lost: number;
}

export interface SourceRow {
  source: LeadSource;
  leads: number;
  medianFirstResponseSeconds: number | null;
  slaMetRate: number | null;
  breachedRate: number | null;
  breached: number;
  won: number;
  lost: number;
}

export interface DailyRow {
  date: string;
  leads: number;
  breached: number;
}

export interface DashboardResponse {
  period: { from: string; to: string; timezone: 'Asia/Tashkent' };
  kpis: DashboardKpis;
  byManager: ManagerRow[];
  bySource: SourceRow[];
  daily: DailyRow[] | null;
}

/** FR-056: personal statistics. The caller is always the subject — there is no user parameter. */
export const MyStatsQuerySchema = z.object({ preset: z.enum(DASHBOARD_PRESETS) }).strict();
export type MyStatsQuery = z.infer<typeof MyStatsQuerySchema>;

/** Team averages are hidden below this size so they cannot be reversed into a colleague's numbers. */
export const MY_STATS_MIN_TEAM_SIZE = 3;

export interface MyStatsKpis {
  received: number;
  inWork: number;
  closed: number;
  medianFirstResponseSeconds: number | null;
  slaMetRate: number | null;
  breached: number;
  won: number;
  conversionRate: number | null;
}

export interface MyStatsDailyRow {
  date: string;
  leads: number;
  breached: number;
  teamAverageLeads: number | null;
}

export interface MyStatsResponse {
  period: { from: string; to: string; timezone: 'Asia/Tashkent' };
  me: MyStatsKpis;
  /** Mean per team member; `average` is null when `size` < MY_STATS_MIN_TEAM_SIZE. */
  team: { size: number; average: MyStatsKpis | null };
  daily: MyStatsDailyRow[];
}
