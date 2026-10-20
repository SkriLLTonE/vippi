import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ACCESS_KEY } from '../../src/common/decorators.js';
import { SlaSchedulerService } from '../../src/modules/sla/sla-scheduler.service.js';
import { addMember, createLead, createTestApp, registerOrg, resetDb, type TestContext } from './helpers.js';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(async () => ctx.close());
beforeEach(async () => resetDb(ctx));

describe('tenant isolation (SEC-007, AC-067)', () => {
  it('foreign IDs answer 404 on every lead route; lists and dashboards never leak', async () => {
    ctx.clock.set('2026-10-19T05:00:00.000Z');
    const ownerA = await registerOrg(ctx, 'Org A');
    const managerA = await addMember(ctx, ownerA, 'MANAGER');
    const leadA = await createLead(managerA, { fullName: 'Secret A' });
    const ownerB = await registerOrg(ctx, 'Org B');
    const headB = await addMember(ctx, ownerB, 'HEAD_OF_SALES');
    await createLead(ownerB, { fullName: 'Lead B' });

    const ai = await ownerA.post(`/leads/${leadA.id}/ai/analysis`, {});
    const draft = await ownerA.post(`/leads/${leadA.id}/ai/reply-draft`, { language: 'ru', tone: 'FORMAL' });
    const id = leadA.id;
    for (const client of [ownerB, headB]) {
      const checks = await Promise.all([
        client.get(`/leads/${id}`),
        client.patch(`/leads/${id}`, { rooms: 2 }),
        client.get(`/leads/${id}/activities`),
        client.post(`/leads/${id}/comments`, { body: 'x' }),
        client.post(`/leads/${id}/first-contact`, { channel: 'CALL' }),
        client.post(`/leads/${id}/status`, { status: 'LOST', lostReason: 'SPAM' }),
        client.post(`/leads/${id}/assign`, { assigneeId: client.userId }),
        client.get(`/leads/${id}/ai`),
        client.post(`/leads/${id}/ai/analysis`, {}),
        client.post(`/leads/${id}/ai/reply-draft`, { language: 'uz', tone: 'FRIENDLY' }),
        client.post(`/leads/${id}/ai/apply-fields`, { insightId: ai.body.insightId, fields: ['rooms'] }),
        client.post(`/leads/${id}/ai/draft-sent`, { insightId: draft.body.insightId, channel: 'CALL', edited: false }),
      ]);
      checks.forEach((r, i) => expect(r.status, `check #${i}`).toBe(404));
    }
    expect((await ownerB.delete(`/leads/${id}`)).status).toBe(404);

    const listB = (await ownerB.get('/leads')).body;
    expect(listB.items.map((i: { fullName: string }) => i.fullName)).toEqual(['Lead B']);
    expect(await ownerB.get('/leads/export.csv').then((r) => r.text)).not.toContain('Secret A');
    expect((await ownerB.get('/analytics/dashboard?preset=7d')).body.kpis.totalLeads).toBe(1);

    // cross-tenant assignment and membership operations
    const assignForeign = await ownerB.post(`/leads/${listB.items[0].id}/assign`, { assigneeId: managerA.userId });
    expect(assignForeign.status).toBe(422);
    const membersA = (await ownerA.get('/members')).body as Array<{ id: string }>;
    expect((await ownerB.post(`/members/${membersA[0]?.id}/deactivate`)).status).toBe(404);
    expect((await ownerB.patch(`/members/${membersA[0]?.id}`, { role: 'MANAGER' })).status).toBe(404);
    const keyA = (await ownerA.post('/api-keys', { name: 'Key A' })).body;
    expect((await ownerB.post(`/api-keys/${keyA.id}/revoke`)).status).toBe(404);
    const invA = (await ownerA.post('/invitations', { email: 'someone@example.test', role: 'MANAGER' })).body;
    expect((await ownerB.post(`/invitations/${invA.id}/revoke`)).status).toBe(404);

    // notifications of org A are not visible / markable from org B
    ctx.clock.advance(30 * 60_000);
    await ctx.app.get(SlaSchedulerService).runOnce(ctx.clock.now());
    const notifA = (await managerA.get('/notifications')).body.items[0];
    expect(notifA).toBeDefined();
    expect((await ownerB.post(`/notifications/${notifA.id}/read`)).status).toBe(404);

    // audit of A is not visible to B
    const auditB = (await ownerB.get('/audit-logs')).body;
    expect(JSON.stringify(auditB)).not.toContain(ownerA.orgId);

    // intake key of A creates leads only in A
    const r = await request(ctx.server)
      .post('/api/v1/intake/leads')
      .set('X-Api-Key', keyA.key)
      .send({ fullName: 'Intake A', source: 'WEBSITE' });
    expect(r.status).toBe(201);
    expect((await ownerB.get(`/leads/${r.body.id}`)).status).toBe(404);
  });

  it('malformed IDs answer 404 too', async () => {
    const owner = await registerOrg(ctx);
    expect((await owner.get('/leads/not-a-uuid')).status).toBe(404);
  });
});

describe('route access policy (SEC-006)', () => {
  it('every route declares @Public, @ApiKeyAuth, @Authenticated or @RequirePermission', () => {
    const discovery = ctx.app.get(DiscoveryService);
    const scanner = ctx.app.get(MetadataScanner);
    const reflector = ctx.app.get(Reflector);
    const missing: string[] = [];
    let routes = 0;
    for (const wrapper of discovery.getControllers()) {
      const instance = wrapper.instance as Record<string, unknown> | undefined;
      if (!instance) continue;
      const proto = Object.getPrototypeOf(instance) as object;
      for (const name of scanner.getAllMethodNames(proto)) {
        const handler = (proto as Record<string, unknown>)[name] as (...args: unknown[]) => unknown;
        if (Reflect.getMetadata('method', handler) === undefined) continue;
        routes += 1;
        const access = reflector.getAllAndOverride<string | undefined>(ACCESS_KEY, [handler, wrapper.metatype as new () => unknown]);
        if (!access) missing.push(`${wrapper.name}.${name}`);
      }
    }
    expect(routes).toBeGreaterThan(40);
    expect(missing).toEqual([]);
  });
});
