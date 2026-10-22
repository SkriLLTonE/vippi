import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SlaSchedulerService } from '../../src/modules/sla/sla-scheduler.service.js';
import { addMember, createLead, createTestApp, registerOrg, resetDb, type TestContext } from './helpers.js';

describe('personal statistics GET /analytics/me (FR-056)', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => ctx.close());
  beforeEach(async () => resetDb(ctx));

  /** me: 1 MET+WON, 1 BREACHED (open); m2: 1 MET+LOST; m3: no leads; 1 unassigned lead. */
  async function seed() {
    ctx.clock.set('2026-10-19T05:00:00.000Z');
    const owner = await registerOrg(ctx);
    const me = await addMember(ctx, owner, 'MANAGER', 'Manager Me');
    const m2 = await addMember(ctx, owner, 'MANAGER', 'Colleague Two');
    const m3 = await addMember(ctx, owner, 'MANAGER', 'Colleague Three');
    const met = await createLead(me, { phone: '+998001000001' });
    const breached = await createLead(me, { phone: '+998001000002' });
    const other = await createLead(m2, { phone: '+998001000003' });
    await createLead(owner, { phone: '+998001000004' });
    ctx.clock.advance(10 * 60_000);
    await me.post(`/leads/${met.id}/first-contact`, { channel: 'CALL' });
    await m2.post(`/leads/${other.id}/first-contact`, { channel: 'CALL' });
    ctx.clock.advance(20 * 60_000);
    await ctx.app.get(SlaSchedulerService).runOnce(ctx.clock.now());
    await me.post(`/leads/${breached.id}/first-contact`, { channel: 'CALL' });
    await me.post(`/leads/${met.id}/status`, { status: 'WON' });
    await m2.post(`/leads/${other.id}/status`, { status: 'LOST', lostReason: 'NO_ANSWER' });
    return { owner, me, m2, m3 };
  }

  it('returns own KPIs, team averages and the daily trend with dashboard definitions', async () => {
    const { me } = await seed();
    const r = await me.get('/analytics/me?preset=7d');
    expect(r.status).toBe(200);
    expect(r.body.period).toEqual({ from: '2026-10-13', to: '2026-10-19', timezone: 'Asia/Tashkent' });
    expect(r.body.me).toEqual({
      received: 2,
      inWork: 1,
      closed: 1,
      medianFirstResponseSeconds: 1200,
      slaMetRate: 0.5,
      breached: 1,
      won: 1,
      conversionRate: 0.5,
    });
    expect(r.body.team.size).toBe(3);
    const avg = r.body.team.average;
    expect(avg.received).toBeCloseTo(1);
    expect(avg.inWork).toBeCloseTo(1 / 3);
    expect(avg.closed).toBeCloseTo(2 / 3);
    expect(avg.medianFirstResponseSeconds).toBe(900);
    expect(avg.slaMetRate).toBeCloseTo(0.75);
    expect(avg.breached).toBeCloseTo(1 / 3);
    expect(avg.won).toBeCloseTo(1 / 3);
    expect(avg.conversionRate).toBeCloseTo(0.25);
    expect(r.body.daily).toHaveLength(7);
    expect(r.body.daily[0]).toEqual({ date: '2026-10-13', leads: 0, breached: 0, teamAverageLeads: 0 });
    expect(r.body.daily[6]).toEqual({ date: '2026-10-19', leads: 2, breached: 1, teamAverageLeads: 1 });
  });

  it('never exposes colleagues: no ids or names, no way to ask for another user', async () => {
    const { owner, me, m2, m3 } = await seed();
    const r = await me.get('/analytics/me?preset=30d');
    for (const marker of [m2.userId, m3.userId, owner.userId, 'Colleague Two', 'Colleague Three']) {
      expect(r.text).not.toContain(marker);
    }
    expect((await me.get(`/analytics/me?preset=7d&assigneeId=${m2.userId}`)).status).toBe(400);
    expect((await me.get(`/analytics/me?preset=7d&userId=${m2.userId}`)).status).toBe(400);
    expect((await me.get('/analytics/me')).status).toBe(400);
    expect((await me.get('/analytics/dashboard?preset=7d')).status).toBe(403);

    const theirs = (await m2.get('/analytics/me?preset=7d')).body;
    expect(theirs.me).toMatchObject({
      received: 1,
      inWork: 0,
      closed: 1,
      won: 0,
      conversionRate: 0,
      breached: 0,
    });
    expect(theirs.team).toEqual((await me.get('/analytics/me?preset=7d')).body.team);
  });

  it('hides team averages for small teams and works for owners without leads', async () => {
    ctx.clock.set('2026-10-19T05:00:00.000Z');
    const owner = await registerOrg(ctx);
    const me = await addMember(ctx, owner, 'MANAGER');
    await createLead(me);
    const r = (await me.get('/analytics/me?preset=today')).body;
    expect(r.me.received).toBe(1);
    expect(r.team).toEqual({ size: 1, average: null });
    expect(r.daily).toEqual([{ date: '2026-10-19', leads: 1, breached: 0, teamAverageLeads: null }]);

    const own = await owner.get('/analytics/me?preset=today');
    expect(own.status).toBe(200);
    expect(own.body.me).toEqual({
      received: 0,
      inWork: 0,
      closed: 0,
      medianFirstResponseSeconds: null,
      slaMetRate: null,
      breached: 0,
      won: 0,
      conversionRate: null,
    });
  });
});
