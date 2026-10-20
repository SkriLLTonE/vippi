import { describe, expect, it } from 'vitest';
import { hasPermission, invitableRoles } from './permissions.js';
import { parseDisabledFeatures } from './features.js';
import { RegisterOrganizationSchema } from './schemas/auth.js';
import { ChangeStatusSchema, CommentSchema, CreateLeadSchema, LeadListQuerySchema } from './schemas/leads.js';
import { SlaPolicySchema } from './schemas/sla.js';
import { addDaysToDateString, formatDateTimeTz, startOfZonedDay, zonedDateString } from './time.js';
import { scoreBand } from './schemas/ai.js';

describe('schemas', () => {
  it('register: short password and password = email rejected (AC-003)', () => {
    const base = { organizationName: 'Org', fullName: 'Owner', email: 'a@b.uz', password: 'short' };
    expect(RegisterOrganizationSchema.safeParse(base).success).toBe(false);
    expect(RegisterOrganizationSchema.safeParse({ ...base, password: 'a@b.uz' }).success).toBe(false);
    expect(RegisterOrganizationSchema.safeParse({ ...base, password: 'long-enough-1' }).success).toBe(true);
  });

  it('register: unknown fields (organizationId) rejected', () => {
    const r = RegisterOrganizationSchema.safeParse({
      organizationName: 'Org',
      fullName: 'Owner',
      email: 'a@b.uz',
      password: 'long-enough-1',
      organizationId: '00000000-0000-0000-0000-000000000000',
    });
    expect(r.success).toBe(false);
  });

  it('create lead: name or phone required, phone normalized (AC-018)', () => {
    expect(CreateLeadSchema.safeParse({ source: 'PHONE' }).success).toBe(false);
    const ok = CreateLeadSchema.parse({ source: 'PHONE', phone: '90 123-45-67' });
    expect(ok.phone).toBe('+998901234567');
    const bad = CreateLeadSchema.safeParse({ source: 'PHONE', phone: '12345' });
    expect(bad.success).toBe(false);
  });

  it('list query parses CSV enums and validates period', () => {
    const q = LeadListQuerySchema.parse({ status: 'NEW,CONTACTED', page: '2', pageSize: '50' });
    expect(q.status).toEqual(['NEW', 'CONTACTED']);
    expect(q.page).toBe(2);
    expect(q.sort).toBe('-receivedAt');
    expect(LeadListQuerySchema.safeParse({ pageSize: '30' }).success).toBe(false);
    expect(LeadListQuerySchema.safeParse({ from: '2026-10-10', to: '2026-10-01' }).success).toBe(false);
    expect(LeadListQuerySchema.safeParse({ from: '2025-01-01', to: '2026-10-01' }).success).toBe(false);
  });

  it('status: LOST needs reason, OTHER needs comment', () => {
    expect(ChangeStatusSchema.safeParse({ status: 'LOST' }).success).toBe(false);
    expect(ChangeStatusSchema.safeParse({ status: 'LOST', lostReason: 'OTHER' }).success).toBe(false);
    expect(ChangeStatusSchema.safeParse({ status: 'LOST', lostReason: 'OTHER', lostComment: 'abc' }).success).toBe(
      true,
    );
  });

  it('comment length (AC-029)', () => {
    expect(CommentSchema.safeParse({ body: 'x'.repeat(2000) }).success).toBe(true);
    expect(CommentSchema.safeParse({ body: 'x'.repeat(2001) }).success).toBe(false);
  });

  it('SLA policy ranges (AC-052)', () => {
    const base = {
      firstResponseMinutes: 15,
      forgottenAfterHours: 24,
      businessHoursEnabled: false,
      workdays: [1, 2, 3, 4, 5],
      workStart: '09:00',
      workEnd: '18:00',
    };
    expect(SlaPolicySchema.safeParse(base).success).toBe(true);
    expect(SlaPolicySchema.safeParse({ ...base, firstResponseMinutes: 0 }).success).toBe(false);
    expect(SlaPolicySchema.safeParse({ ...base, firstResponseMinutes: 1441 }).success).toBe(false);
    expect(SlaPolicySchema.safeParse({ ...base, workStart: '18:00', workEnd: '09:00' }).success).toBe(false);
    expect(SlaPolicySchema.safeParse({ ...base, workStart: '09:10' }).success).toBe(false);
  });
});

describe('permissions and features', () => {
  it('matrix', () => {
    expect(hasPermission('MANAGER', 'dashboard.read')).toBe(false);
    expect(hasPermission('HEAD_OF_SALES', 'dashboard.read')).toBe(true);
    expect(hasPermission('HEAD_OF_SALES', 'apiKey.manage')).toBe(false);
    expect(hasPermission('OWNER', 'audit.read')).toBe(true);
    expect(hasPermission('MANAGER', 'lead.export')).toBe(true);
    expect(invitableRoles('HEAD_OF_SALES')).toEqual(['MANAGER']);
    expect(invitableRoles('MANAGER')).toEqual([]);
  });

  it('feature flags', () => {
    const f = parseDisabledFeatures('audit_log_ui, WEEKLY_SUMMARY');
    expect(f.AUDIT_LOG_UI).toBe(false);
    expect(f.WEEKLY_SUMMARY).toBe(false);
    expect(f.DAILY_CHART).toBe(true);
    expect(parseDisabledFeatures(undefined).DEAL_SCORE).toBe(true);
  });
});

describe('time (Asia/Tashkent)', () => {
  it('local midnight → UTC (AC-047)', () => {
    expect(startOfZonedDay('2026-10-21').toISOString()).toBe('2026-10-20T19:00:00.000Z');
  });
  it('00:30 Tashkent belongs to the same local day', () => {
    expect(zonedDateString(new Date('2026-10-20T19:30:00Z'))).toBe('2026-10-21');
  });
  it('formats DD.MM.YYYY HH:mm independent of process TZ', () => {
    expect(formatDateTimeTz('2026-10-21T05:14:00.000Z')).toBe('21.10.2026 10:14');
  });
  it('adds days across months', () => {
    expect(addDaysToDateString('2026-10-31', 1)).toBe('2026-11-01');
  });
  it('score band', () => {
    expect(scoreBand(70)).toBe('HOT');
    expect(scoreBand(69)).toBe('WARM');
    expect(scoreBand(39)).toBe('COLD');
  });
});
