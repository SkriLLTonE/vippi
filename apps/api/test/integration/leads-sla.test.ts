import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SlaSchedulerService } from '../../src/modules/sla/sla-scheduler.service.js';
import { addMember, createLead, createTestApp, registerOrg, resetDb, type TestContext } from './helpers.js';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(async () => ctx.close());
beforeEach(async () => resetDb(ctx));

const T0 = '2026-10-19T05:00:00.000Z'; // Monday 10:00 Asia/Tashkent

describe('leads', () => {
  it('creates a lead with number, normalized phone, SLA deadline and history (FR-010, FR-011, FR-032)', async () => {
    ctx.clock.set(T0);
    const owner = await registerOrg(ctx);
    const lead = await createLead(owner, { phone: '00 123-45-67' });
    expect(lead.number).toBe(1);
    const dto = (await owner.get(`/leads/${lead.id}`)).body;
    expect(dto.phone).toBe('+998001234567');
    expect(dto.status).toBe('NEW');
    expect(dto.slaState).toBe('PENDING');
    expect(dto.firstResponseDueAt).toBe('2026-10-19T05:15:00.000Z');
    const second = await createLead(owner, { phone: '+998001234567' });
    expect(second.number).toBe(2);
    const dup = (await owner.get(`/leads/${second.id}`)).body;
    expect(dup.possibleDuplicateOf).toEqual({ id: lead.id, number: 1 });
    const acts = (await owner.get(`/leads/${lead.id}/activities`)).body;
    expect(acts.map((a: { type: string }) => a.type)).toContain('CREATED');
  });

  it('requires name or phone and validates phone', async () => {
    const owner = await registerOrg(ctx);
    const r1 = await owner.post('/leads', { source: 'PHONE' });
    expect(r1.status).toBe(400);
    const r2 = await owner.post('/leads', { source: 'PHONE', phone: 'abc' });
    expect(r2.status).toBe(400);
    expect(r2.body.error.details[0].code).toBe('invalid_phone');
  });

  it('manager sees own and unassigned leads only, takes unassigned, cannot see others (FR-018)', async () => {
    const owner = await registerOrg(ctx);
    const m1 = await addMember(ctx, owner, 'MANAGER', 'Manager One');
    const m2 = await addMember(ctx, owner, 'MANAGER', 'Manager Two');
    const unassigned = await createLead(owner, { fullName: 'Unassigned' });
    const forM2 = await createLead(owner, { fullName: 'For M2', assigneeId: m2.userId });
    const own = await createLead(m1, { fullName: 'Own' });

    const list = (await m1.get('/leads')).body;
    const ids = list.items.map((i: { id: string }) => i.id);
    expect(ids).toEqual(expect.arrayContaining([unassigned.id, own.id]));
    expect(ids).not.toContain(forM2.id);
    expect((await m1.get(`/leads/${forM2.id}`)).status).toBe(404);

    expect((await m1.post(`/leads/${unassigned.id}/first-contact`, { channel: 'CALL' })).status).toBe(403);
    const taken = await m1.post(`/leads/${unassigned.id}/take`);
    expect(taken.status).toBe(200);
    expect(taken.body.assignee.id).toBe(m1.userId);
    expect((await m2.get(`/leads/${unassigned.id}`)).status).toBe(404);
    expect((await m1.post(`/leads/${forM2.id}/assign`, { assigneeId: m1.userId })).status).toBe(403);
  });

  it('assigning notifies the assignee and audits reassignment (FR-012)', async () => {
    const owner = await registerOrg(ctx);
    const m1 = await addMember(ctx, owner, 'MANAGER', 'Manager One');
    const m2 = await addMember(ctx, owner, 'MANAGER', 'Manager Two');
    const lead = await createLead(owner);
    expect((await owner.post(`/leads/${lead.id}/assign`, { assigneeId: m1.userId })).status).toBe(200);
    const n = (await m1.get('/notifications')).body.items;
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ type: 'LEAD_ASSIGNED', leadId: lead.id, payload: { leadNumber: 1 } });
    await owner.post(`/leads/${lead.id}/assign`, { assigneeId: m2.userId });
    const audit = (await owner.get('/audit-logs?action=LEAD_REASSIGNED')).body;
    expect(audit.total).toBe(1);
    const bad = await owner.post(`/leads/${lead.id}/assign`, {
      assigneeId: '00000000-0000-4000-8000-000000000000',
    });
    expect(bad.status).toBe(422);
    expect(bad.body.error.code).toBe('ASSIGNEE_INVALID');
  });

  it('first contact within SLA → MET and cannot be repeated (FR-014, AC-025)', async () => {
    ctx.clock.set(T0);
    const owner = await registerOrg(ctx);
    const m = await addMember(ctx, owner, 'MANAGER');
    const lead = await createLead(m);
    ctx.clock.advance(10 * 60_000);
    const r = await m.post(`/leads/${lead.id}/first-contact`, {
      channel: 'TELEGRAM',
      comment: 'Wrote in Telegram',
    });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: 'CONTACTED', slaState: 'MET', firstResponseChannel: 'TELEGRAM' });
    const again = await m.post(`/leads/${lead.id}/first-contact`, { channel: 'CALL' });
    expect(again.status).toBe(422);
    expect(again.body.error.code).toBe('FIRST_CONTACT_ALREADY_RECORDED');
  });

  it('status machine: reasons, forbidden transitions, manager cannot reopen (FR-013)', async () => {
    const owner = await registerOrg(ctx);
    const m = await addMember(ctx, owner, 'MANAGER');
    const lead = await createLead(m);
    const direct = await m.post(`/leads/${lead.id}/status`, { status: 'QUALIFIED' });
    expect(direct.status).toBe(422);
    expect(direct.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    const noReason = await m.post(`/leads/${lead.id}/status`, { status: 'LOST' });
    expect(noReason.status).toBe(400);
    const spam = await m.post(`/leads/${lead.id}/status`, { status: 'LOST', lostReason: 'SPAM' });
    expect(spam.status).toBe(200);
    expect(spam.body).toMatchObject({ status: 'LOST', slaState: 'EXEMPT', lostReason: 'SPAM' });
    expect((await m.post(`/leads/${lead.id}/status`, { status: 'CONTACTED' })).status).toBe(403);
    const reopened = await owner.post(`/leads/${lead.id}/status`, { status: 'CONTACTED' });
    expect(reopened.status).toBe(200);
    expect(reopened.body.lostReason).toBeNull();
  });

  it('updates fields with history; manager cannot edit leads of others; only owner deletes', async () => {
    const owner = await registerOrg(ctx);
    const head = await addMember(ctx, owner, 'HEAD_OF_SALES');
    const m = await addMember(ctx, owner, 'MANAGER');
    const lead = await createLead(owner);
    expect((await m.patch(`/leads/${lead.id}`, { rooms: 3 })).status).toBe(403);
    const upd = await head.patch(`/leads/${lead.id}`, {
      rooms: 3,
      budget: { amount: '60000', currency: 'USD' },
    });
    expect(upd.status).toBe(200);
    expect(upd.body.budget).toEqual({ amount: '60000', currency: 'USD' });
    const acts = (await owner.get(`/leads/${lead.id}/activities`)).body;
    expect(acts[0]).toMatchObject({
      type: 'FIELDS_UPDATED',
      payload: { fields: ['rooms', 'budget'], source: 'USER' },
    });
    expect((await head.delete(`/leads/${lead.id}`)).status).toBe(403);
    expect((await owner.delete(`/leads/${lead.id}`)).status).toBe(204);
    expect((await owner.get(`/leads/${lead.id}`)).status).toBe(404);
  });

  it('comments and search with apostrophe normalization (FR-015, FR-017)', async () => {
    const owner = await registerOrg(ctx);
    const lead = await createLead(owner, { message: 'Mirzo Ulugʻbek tumanida uy kerak' });
    await createLead(owner, { message: 'Квартира в Чиланзаре', phone: '+998001111111' });
    const c = await owner.post(`/leads/${lead.id}/comments`, { body: 'Called, no answer' });
    expect(c.status).toBe(201);
    const found = (await owner.get(`/leads?q=${encodeURIComponent("ulug'bek")}`)).body;
    expect(found.total).toBe(1);
    expect(found.items[0].id).toBe(lead.id);
    const byPhone = (await owner.get('/leads?q=1111111')).body;
    expect(byPhone.total).toBe(1);
  });

  it('validates list filters (period too long → 400)', async () => {
    const owner = await registerOrg(ctx);
    const r = await owner.get('/leads?from=2024-01-01&to=2026-01-01');
    expect(r.status).toBe(400);
  });
});

describe('SLA scheduler and notifications', () => {
  it('marks overdue leads BREACHED, notifies assignee + heads, idempotent (FR-033, AC-031, AC-032)', async () => {
    ctx.clock.set(T0);
    const owner = await registerOrg(ctx);
    const head = await addMember(ctx, owner, 'HEAD_OF_SALES');
    const m = await addMember(ctx, owner, 'MANAGER');
    const lead = await createLead(m);
    const unassigned = await createLead(owner, { phone: '+998002222222' });
    const scheduler = ctx.app.get(SlaSchedulerService);

    ctx.clock.advance(14 * 60_000);
    expect((await scheduler.runOnce(ctx.clock.now())).breached).toBe(0);

    ctx.clock.advance(2 * 60_000);
    const first = await scheduler.runOnce(ctx.clock.now());
    expect(first.breached).toBe(2);
    // lead → manager + head; unassigned → head only
    expect(first.notifications).toBe(3);
    const second = await scheduler.runOnce(ctx.clock.now());
    expect(second).toMatchObject({ breached: 0, notifications: 0 });

    const dto = (await m.get(`/leads/${lead.id}`)).body;
    expect(dto.slaState).toBe('BREACHED');
    expect(dto.slaBreachedAt).toBe(dto.firstResponseDueAt);
    const mn = (await m.get('/notifications')).body.items;
    expect(mn[0]).toMatchObject({ type: 'SLA_BREACHED', leadId: lead.id, payload: { leadNumber: 1 } });
    expect((await head.get('/notifications/unread-count')).body.count).toBe(2);
    expect((await owner.get('/notifications/unread-count')).body.count).toBe(0);

    const overdue = (await head.get('/leads/overdue')).body;
    expect(overdue.total).toBe(2);
    expect(overdue.items[0].overdueMinutes).toBeGreaterThanOrEqual(1);
    expect((await m.get('/leads/overdue')).body.total).toBe(2);

    const late = await m.post(`/leads/${lead.id}/first-contact`, { channel: 'CALL' });
    expect(late.body.slaState).toBe('BREACHED');
    expect((await head.get('/leads/overdue')).body.total).toBe(1);
    expect(unassigned.id).toBeTruthy();

    const read = await head.post('/notifications/read-all');
    expect(read.status).toBeLessThan(300);
    expect((await head.get('/notifications/unread-count')).body.count).toBe(0);
  });

  it('notifies the owner when there is no head of sales', async () => {
    ctx.clock.set(T0);
    const owner = await registerOrg(ctx);
    await createLead(owner);
    ctx.clock.advance(20 * 60_000);
    await ctx.app.get(SlaSchedulerService).runOnce(ctx.clock.now());
    expect((await owner.get('/notifications/unread-count')).body.count).toBe(1);
  });

  it('catch-up after a long sleep (ADR-022): one scan breaches everything overdue with slaBreachedAt = deadline', async () => {
    ctx.clock.set(T0);
    const owner = await registerOrg(ctx);
    const m = await addMember(ctx, owner, 'MANAGER');
    const early = await createLead(m, { phone: '+998004000001' });
    ctx.clock.advance(5 * 60_000);
    const later = await createLead(m, { phone: '+998004000002' });
    // Instance asleep for 3 days: no cron ticks at all. Then it wakes and runs once.
    ctx.clock.advance(3 * 24 * 60 * 60_000);
    const fresh = await createLead(m, { phone: '+998004000003' });
    const scheduler = ctx.app.get(SlaSchedulerService);
    expect(await scheduler.runOnce(ctx.clock.now())).toMatchObject({ breached: 2 });
    for (const lead of [early, later]) {
      const row = await ctx.prisma.system.lead.findUniqueOrThrow({ where: { id: lead.id as string } });
      expect(row.slaState).toBe('BREACHED');
      expect(row.slaBreachedAt?.toISOString()).toBe(row.firstResponseDueAt.toISOString());
    }
    const freshRow = await ctx.prisma.system.lead.findUniqueOrThrow({ where: { id: fresh.id as string } });
    expect(freshRow.slaState).toBe('PENDING');
    const items = (await m.get('/notifications')).body.items as Array<{ type: string; payload: { overdueMinutes: number } }>;
    expect(items.filter((n) => n.type === 'SLA_BREACHED').map((n) => n.payload.overdueMinutes).sort((a, b) => a - b)).toEqual([
      3 * 24 * 60 - 15,
      3 * 24 * 60 - 15 + 5,
    ]);
    expect(await scheduler.runOnce(ctx.clock.now())).toMatchObject({ breached: 0, notifications: 0 });
  });

  it('parallel runs breach each lead once and never duplicate notifications (NFR-003)', async () => {
    ctx.clock.set(T0);
    const owner = await registerOrg(ctx);
    const head = await addMember(ctx, owner, 'HEAD_OF_SALES');
    const m = await addMember(ctx, owner, 'MANAGER');
    for (let i = 0; i < 5; i++) await createLead(m, { phone: `+99800300000${i}` });
    ctx.clock.advance(20 * 60_000);
    const scheduler = ctx.app.get(SlaSchedulerService);
    const runs = await Promise.all([1, 2, 3, 4].map(() => scheduler.runOnce(ctx.clock.now())));
    expect(runs.reduce((s, r) => s + r.breached, 0)).toBe(5);
    expect(runs.reduce((s, r) => s + r.notifications, 0)).toBe(10);
    expect(await scheduler.runOnce(ctx.clock.now())).toMatchObject({ breached: 0, notifications: 0 });
    expect((await m.get('/notifications/unread-count')).body.count).toBe(5);
    expect((await head.get('/notifications/unread-count')).body.count).toBe(5);
    const events = await ctx.prisma.system.leadActivity.count({ where: { type: 'SLA_BREACHED' } });
    expect(events).toBe(5);
  });

  it('deactivated assignee: lead is unassigned, breach goes to supervisors only (FR-008, FR-033)', async () => {
    ctx.clock.set(T0);
    const owner = await registerOrg(ctx);
    const head = await addMember(ctx, owner, 'HEAD_OF_SALES');
    const m = await addMember(ctx, owner, 'MANAGER');
    const lead = await createLead(m);
    const membership = ((await owner.get('/members')).body as Array<{ id: string; userId: string }>).find(
      (x) => x.userId === m.userId,
    );
    expect((await owner.post(`/members/${membership?.id}/deactivate`)).status).toBeLessThan(300);
    const after = (await owner.get(`/leads/${lead.id}`)).body;
    expect(after.assignee).toBeNull();
    expect(after.firstResponseDueAt).toBe(lead.firstResponseDueAt);
    ctx.clock.advance(20 * 60_000);
    const run = await ctx.app.get(SlaSchedulerService).runOnce(ctx.clock.now());
    expect(run).toMatchObject({ breached: 1, notifications: 1 });
    expect((await head.get('/notifications')).body.items[0]).toMatchObject({
      type: 'SLA_BREACHED',
      leadId: lead.id,
    });
    const toManager = await ctx.prisma.system.notification.count({ where: { userId: m.userId } });
    expect(toManager).toBe(0);
  });

  it('first contact racing the scheduler leaves one consistent outcome (T-013)', async () => {
    ctx.clock.set(T0);
    const owner = await registerOrg(ctx);
    const m = await addMember(ctx, owner, 'MANAGER');
    const scheduler = ctx.app.get(SlaSchedulerService);
    for (let round = 0; round < 5; round++) {
      const lead = await createLead(m, { phone: `+99800400000${round}` });
      ctx.clock.set(new Date(new Date(lead.firstResponseDueAt).getTime() + 1_000));
      const [contact] = await Promise.all([
        m.post(`/leads/${lead.id}/first-contact`, { channel: 'CALL' }),
        scheduler.runOnce(ctx.clock.now()),
      ]);
      expect(contact.status).toBe(200);
      const dto = (await m.get(`/leads/${lead.id}`)).body;
      expect(dto.slaState).toBe('BREACHED');
      expect(dto.firstResponseAt).not.toBeNull();
      expect(dto.slaBreachedAt).toBe(dto.firstResponseDueAt);
      const breachEvents = await ctx.prisma.system.leadActivity.count({
        where: { leadId: lead.id, type: 'SLA_BREACHED' },
      });
      expect(breachEvents).toBeLessThanOrEqual(1);
      expect(await scheduler.runOnce(ctx.clock.now())).toMatchObject({ breached: 0 });
      ctx.clock.set(T0);
    }
  });

  it('first contact before the deadline is MET and the scheduler skips it', async () => {
    ctx.clock.set(T0);
    const owner = await registerOrg(ctx);
    const lead = await createLead(owner);
    ctx.clock.advance(14 * 60_000 + 59_000);
    expect((await owner.post(`/leads/${lead.id}/first-contact`, { channel: 'TELEGRAM' })).body.slaState).toBe(
      'MET',
    );
    ctx.clock.advance(60 * 60_000);
    expect(await ctx.app.get(SlaSchedulerService).runOnce(ctx.clock.now())).toMatchObject({
      breached: 0,
      notifications: 0,
    });
  });

  it('changing the SLA threshold affects new leads only (FR-030)', async () => {
    ctx.clock.set(T0);
    const owner = await registerOrg(ctx);
    const before = await createLead(owner);
    const put = await owner.put('/sla-policy', {
      firstResponseMinutes: 60,
      forgottenAfterHours: 24,
      businessHoursEnabled: false,
      workdays: [1, 2, 3, 4, 5],
      workStart: '09:00',
      workEnd: '18:00',
    });
    expect(put.status).toBe(200);
    const after = await createLead(owner, { phone: '+998005555555' });
    expect(before.firstResponseDueAt).toBe('2026-10-19T05:15:00.000Z');
    expect(after.firstResponseDueAt).toBe('2026-10-19T06:00:00.000Z');
    expect((await owner.get(`/leads/${before.id}`)).body.firstResponseDueAt).toBe('2026-10-19T05:15:00.000Z');
  });

  it('business hours: lead received at night is due 15 min after the workday starts (FR-031)', async () => {
    const owner = await registerOrg(ctx);
    const put = await owner.put('/sla-policy', {
      firstResponseMinutes: 15,
      forgottenAfterHours: 24,
      businessHoursEnabled: true,
      workdays: [1, 2, 3, 4, 5],
      workStart: '09:00',
      workEnd: '18:00',
    });
    expect(put.status).toBe(200);
    ctx.clock.set('2026-10-19T17:00:00.000Z'); // Monday 22:00 Tashkent
    const lead = await createLead(owner);
    expect(lead.firstResponseDueAt).toBe('2026-10-20T04:15:00.000Z'); // Tuesday 09:15 Tashkent
    const audit = (await owner.get('/audit-logs?action=SLA_POLICY_UPDATED')).body;
    expect(audit.items[0].metadata.to.businessHoursEnabled).toBe(true);
  });
});
