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
