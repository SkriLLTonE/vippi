import { RequestMethod } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants.js';
import { hasPermission, type Permission, type Role } from '@vippi/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ACCESS_KEY, PERMISSION_KEY } from '../../src/common/decorators.js';
import { SlaSchedulerService } from '../../src/modules/sla/sla-scheduler.service.js';
import {
  addMember,
  type Client,
  createLead,
  createTestApp,
  registerOrg,
  resetDb,
  type TestContext,
} from './helpers.js';

interface Route {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  access: string;
  permission?: Permission;
}

const METHODS: Partial<Record<RequestMethod, Route['method']>> = {
  [RequestMethod.GET]: 'GET',
  [RequestMethod.POST]: 'POST',
  [RequestMethod.PUT]: 'PUT',
  [RequestMethod.PATCH]: 'PATCH',
  [RequestMethod.DELETE]: 'DELETE',
};

function routeTable(ctx: TestContext): Route[] {
  const discovery = ctx.app.get(DiscoveryService);
  const scanner = ctx.app.get(MetadataScanner);
  const reflector = ctx.app.get(Reflector);
  const routes: Route[] = [];
  for (const wrapper of discovery.getControllers()) {
    const instance = wrapper.instance as Record<string, unknown> | undefined;
    if (!instance || !wrapper.metatype) continue;
    const base = String(Reflect.getMetadata(PATH_METADATA, wrapper.metatype) ?? '').replace(/^\/|\/$/g, '');
    const proto = Object.getPrototypeOf(instance) as object;
    for (const name of scanner.getAllMethodNames(proto)) {
      const handler = (proto as Record<string, unknown>)[name] as (...args: unknown[]) => unknown;
      const verb = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
      if (verb === undefined) continue;
      const method = METHODS[verb];
      if (!method) throw new Error(`Unsupported HTTP method on ${wrapper.name}.${name}`);
      const sub = String(Reflect.getMetadata(PATH_METADATA, handler) ?? '').replace(/^\/|\/$/g, '');
      const targets = [handler, wrapper.metatype as new () => unknown];
      routes.push({
        method,
        path: [base, sub].filter(Boolean).join('/'),
        access: reflector.getAllAndOverride<string>(ACCESS_KEY, targets),
        permission: reflector.getAllAndOverride<Permission | undefined>(PERMISSION_KEY, targets),
      });
    }
  }
  return routes;
}

const key = (r: Pick<Route, 'method' | 'path'>) => `${r.method} ${r.path}`;

function call(client: Client, method: Route['method'], url: string, body?: object) {
  switch (method) {
    case 'GET':
      return client.get(url);
    case 'POST':
      return client.post(url, body ?? {});
    case 'PUT':
      return client.put(url, body ?? {});
    case 'PATCH':
      return client.patch(url, body ?? {});
    case 'DELETE':
      return client.delete(url);
  }
}

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(async () => ctx.close());
beforeEach(async () => resetDb(ctx));

/** Organization A with every kind of tenant-scoped resource, plus marker strings that must never leak. */
async function seedOrgA() {
  ctx.clock.set('2026-10-19T05:00:00.000Z');
  const owner = await registerOrg(ctx, 'ZETA Agency A');
  const head = await addMember(ctx, owner, 'HEAD_OF_SALES', 'ZETA Head A');
  const manager = await addMember(ctx, owner, 'MANAGER', 'ZETA Manager A');
  const manager2 = await addMember(ctx, owner, 'MANAGER', 'ZETA Manager A2');
  const lead = await createLead(owner, {
    fullName: 'ZETA Secret Lead',
    assigneeId: manager.userId,
    message: 'ZETA secret message',
  });
  await owner.post(`/leads/${lead.id}/comments`, { body: 'ZETA secret comment' });
  const analysis = await owner.post(`/leads/${lead.id}/ai/analysis`, {});
  const draft = await owner.post(`/leads/${lead.id}/ai/reply-draft`, { language: 'ru', tone: 'FORMAL' });
  const apiKey = (await owner.post('/api-keys', { name: 'ZETA key' })).body as {
    id: string;
    key: string;
    prefix: string;
  };
  const invitation = (
    await owner.post('/invitations', { email: 'zeta.invitee@example.test', role: 'MANAGER' })
  ).body as {
    id: string;
  };
  const slaRes = await owner.put('/sla-policy', {
    firstResponseMinutes: 7,
    forgottenAfterHours: 24,
    businessHoursEnabled: false,
    workdays: [1, 2, 3, 4, 5],
    workStart: '09:00',
    workEnd: '18:00',
  });
  ctx.clock.advance(30 * 60_000);
  await ctx.app.get(SlaSchedulerService).runOnce(ctx.clock.now());
  const notification = (await manager.get('/notifications')).body.items[0] as { id: string };
  const members = (await owner.get('/members')).body as Array<{ id: string; userId: string }>;
  const managerMembership = members.find((m) => m.userId === manager.userId);
  if (
    slaRes.status !== 200 ||
    !apiKey.key ||
    !notification ||
    !managerMembership ||
    !analysis.body.insightId ||
    !draft.body.insightId
  ) {
    throw new Error('seedOrgA: fixture incomplete');
  }
  return {
    owner,
    head,
    manager,
    manager2,
    lead,
    apiKey,
    invitation,
    notification,
    membershipId: managerMembership.id,
    analysisInsightId: analysis.body.insightId as string,
    draftInsightId: draft.body.insightId as string,
    markers: [
      'ZETA',
      lead.id,
      owner.orgId,
      owner.userId,
      manager.userId,
      apiKey.id,
      apiKey.prefix,
      invitation.id,
      notification.id,
      'zeta.invitee',
    ],
  };
}

type OrgA = Awaited<ReturnType<typeof seedOrgA>>;

/**
 * Every route with an :id parameter must be listed here: a new route without an entry fails the
 * coverage assertion, so isolation cannot be forgotten.
 */
function foreignTargets(a: OrgA, actor: Client): Record<string, { id: string; body?: object }> {
  const lead = a.lead.id;
  return {
    'GET leads/:id': { id: lead },
    'PATCH leads/:id': { id: lead, body: { rooms: 2 } },
    'DELETE leads/:id': { id: lead },
    'POST leads/:id/assign': { id: lead, body: { assigneeId: actor.userId } },
    'POST leads/:id/take': { id: lead },
    'POST leads/:id/first-contact': { id: lead, body: { channel: 'CALL' } },
    'POST leads/:id/status': { id: lead, body: { status: 'LOST', lostReason: 'SPAM' } },
    'GET leads/:id/activities': { id: lead },
    'POST leads/:id/comments': { id: lead, body: { body: 'x' } },
    'GET leads/:id/ai': { id: lead },
    'POST leads/:id/ai/analysis': { id: lead, body: {} },
    'POST leads/:id/ai/reply-draft': { id: lead, body: { language: 'uz', tone: 'FRIENDLY' } },
    'POST leads/:id/ai/apply-fields': {
      id: lead,
      body: { insightId: a.analysisInsightId, fields: ['rooms'] },
    },
    'POST leads/:id/ai/draft-sent': {
      id: lead,
      body: { insightId: a.draftInsightId, channel: 'CALL', edited: false },
    },
    'PATCH members/:id': { id: a.membershipId, body: { role: 'HEAD_OF_SALES' } },
    'POST members/:id/deactivate': { id: a.membershipId },
    'POST invitations/:id/revoke': { id: a.invitation.id },
    'POST api-keys/:id/revoke': { id: a.apiKey.id },
    'POST notifications/:id/read': { id: a.notification.id },
  };
}

describe('tenant isolation: every :id route (SEC-007, AC-067)', () => {
  it('foreign IDs answer 404 for every role of another organization, and nothing changes in A', async () => {
    const a = await seedOrgA();
    const ownerB = await registerOrg(ctx, 'Org B');
    const headB = await addMember(ctx, ownerB, 'HEAD_OF_SALES');
    const managerB = await addMember(ctx, ownerB, 'MANAGER');
    const idRoutes = routeTable(ctx).filter((r) => r.path.includes(':id'));

    for (const actor of [ownerB, headB, managerB]) {
      const targets = foreignTargets(a, actor);
      expect(Object.keys(targets).sort()).toEqual(idRoutes.map(key).sort());
      for (const route of idRoutes) {
        const t = targets[key(route)];
        if (!t) throw new Error(`no isolation target for ${key(route)}`);
        const res = await call(actor, route.method, `/${route.path.replace(':id', t.id)}`, t.body);
        // 403 is acceptable only when the role lacks the permission entirely (checked before lookup).
        const allowed =
          !route.permission ||
          hasPermission(
            actor === ownerB ? 'OWNER' : actor === headB ? 'HEAD_OF_SALES' : 'MANAGER',
            route.permission,
          );
        expect(
          res.status,
          `${key(route)} as ${actor === ownerB ? 'owner' : actor === headB ? 'head' : 'manager'} B`,
        ).toBe(allowed ? 404 : 403);
      }
    }

    const leadA = await a.owner.get(`/leads/${a.lead.id}`);
    expect(leadA.status).toBe(200);
    expect(leadA.body).toMatchObject({ status: 'NEW', fullName: 'ZETA Secret Lead', rooms: null });
    expect(leadA.body.assignee?.id).toBe(a.manager.userId);
    const membersA = (await a.owner.get('/members')).body as Array<{
      id: string;
      role: string;
      status: string;
    }>;
    expect(membersA.find((m) => m.id === a.membershipId)).toMatchObject({
      role: 'MANAGER',
      status: 'ACTIVE',
    });
    expect(
      (await a.owner.get('/api-keys')).body.find((k: { id: string }) => k.id === a.apiKey.id).revokedAt,
    ).toBeNull();
    expect(
      (await a.owner.get('/invitations')).body.some((i: { id: string }) => i.id === a.invitation.id),
    ).toBe(true);
    expect((await a.manager.get('/notifications/unread-count')).body.count).toBeGreaterThan(0);
  });

  it('managers cannot reach leads of other managers in the same organization (FR-018)', async () => {
    const a = await seedOrgA();
    const targets = foreignTargets(a, a.manager2);
    const leadRoutes = routeTable(ctx).filter((r) => r.path.startsWith('leads/:id'));
    for (const route of leadRoutes) {
      const t = targets[key(route)];
      if (!t) throw new Error(`no target for ${key(route)}`);
      const res = await call(a.manager2, route.method, `/${route.path.replace(':id', t.id)}`, t.body);
      const allowed = !route.permission || hasPermission('MANAGER', route.permission);
      expect(res.status, key(route)).toBe(allowed ? 404 : 403);
    }
    expect((await a.manager2.post(`/notifications/${a.notification.id}/read`)).status).toBe(404);
  });

  it('nested IDs from another organization are rejected (insights, assignees)', async () => {
    const a = await seedOrgA();
    const ownerB = await registerOrg(ctx, 'Org B');
    const leadB = await createLead(ownerB, { fullName: 'Lead B' });
    const apply = await ownerB.post(`/leads/${leadB.id}/ai/apply-fields`, {
      insightId: a.analysisInsightId,
      fields: ['rooms'],
    });
    expect([404, 422]).toContain(apply.status);
    const sent = await ownerB.post(`/leads/${leadB.id}/ai/draft-sent`, {
      insightId: a.draftInsightId,
      channel: 'CALL',
      edited: false,
    });
    expect([404, 422]).toContain(sent.status);
    expect((await ownerB.get(`/leads/${leadB.id}`)).body.firstResponseAt).toBeNull();
    expect((await ownerB.post(`/leads/${leadB.id}/assign`, { assigneeId: a.manager.userId })).status).toBe(
      422,
    );
    expect(
      (await ownerB.post('/leads', { fullName: 'X', source: 'WEBSITE', assigneeId: a.manager.userId }))
        .status,
    ).toBe(422);
  });
});

describe('tenant isolation: lists, exports and aggregates never leak (SEC-007)', () => {
  it('every parameterless GET route and the weekly summary show only own data', async () => {
    const a = await seedOrgA();
    const ownerB = await registerOrg(ctx, 'Org B');
    const headB = await addMember(ctx, ownerB, 'HEAD_OF_SALES');
    const managerB = await addMember(ctx, ownerB, 'MANAGER');
    await createLead(ownerB, { fullName: 'Lead B', assigneeId: managerB.userId });

    const gets = routeTable(ctx).filter(
      (r) => r.method === 'GET' && !r.path.includes(':') && r.access !== 'public',
    );
    expect(gets.length).toBeGreaterThan(10);
    for (const actor of [ownerB, headB, managerB]) {
      for (const route of gets) {
        const res = await actor.get(
          `/${route.path}${route.path === 'analytics/dashboard' ? '?preset=30d' : ''}`,
        );
        const text = res.text ?? JSON.stringify(res.body);
        for (const marker of a.markers) expect(text, `${route.path} leaks ${marker}`).not.toContain(marker);
      }
      const weekly = await actor.post('/analytics/weekly-summary', {});
      for (const marker of a.markers) expect(weekly.text).not.toContain(marker);
    }

    const dash = (await ownerB.get('/analytics/dashboard?preset=30d')).body;
    expect(dash.kpis.totalLeads).toBe(1);
    expect(dash.byManager.map((m: { userId: string }) => m.userId)).not.toContain(a.manager.userId);
    expect((await ownerB.get('/leads/overdue')).body.items ?? []).toHaveLength(0);
    expect((await ownerB.get('/notifications/unread-count')).body.count).toBe(0);
    const sla = (await ownerB.get('/sla-policy')).body;
    expect(sla.firstResponseMinutes).toBe(15);
    const csv = (await ownerB.get('/leads/export.csv')).text;
    expect(csv).toContain('Lead B');
  });

  it('bulk and settings mutations in B do not touch A', async () => {
    const a = await seedOrgA();
    const ownerB = await registerOrg(ctx, 'Org B');
    const unreadA = (await a.manager.get('/notifications/unread-count')).body.count as number;

    expect((await ownerB.post('/notifications/read-all')).status).toBeLessThan(300);
    expect(
      (
        await ownerB.put('/sla-policy', {
          firstResponseMinutes: 60,
          forgottenAfterHours: 24,
          businessHoursEnabled: false,
          workdays: [1, 2, 3, 4, 5],
          workStart: '09:00',
          workEnd: '18:00',
        })
      ).status,
    ).toBe(200);
    expect((await ownerB.patch('/organization', { name: 'Renamed B' })).status).toBe(200);
    const csv = 'name,phone,source,message\nImported B,+998001112233,WEBSITE,hello\n';
    const imp = await ownerB.agent
      .post('/api/v1/leads/import')
      .set('Origin', 'http://localhost:8080')
      .attach('file', Buffer.from(csv, 'utf8'), { filename: 'b.csv', contentType: 'text/csv' });
    expect(imp.status).toBe(200);

    expect((await a.manager.get('/notifications/unread-count')).body.count).toBe(unreadA);
    expect((await a.owner.get('/sla-policy')).body.firstResponseMinutes).toBe(7);
    expect((await a.owner.get('/organization')).body.name).toBe('ZETA Agency A');
    const listA = (await a.owner.get('/leads?pageSize=100')).body.items as Array<{ fullName: string }>;
    expect(listA.map((l) => l.fullName)).not.toContain('Imported B');
    const auditA = JSON.stringify((await a.owner.get('/audit-logs')).body);
    expect(auditA).not.toContain(ownerB.orgId);
    expect(auditA).not.toContain(ownerB.userId);
  });

  it('API key of A writes only into A; revoked or foreign keys are rejected', async () => {
    const a = await seedOrgA();
    const ownerB = await registerOrg(ctx, 'Org B');
    const r = await request(ctx.server)
      .post('/api/v1/intake/leads')
      .set('X-Api-Key', a.apiKey.key)
      .send({ fullName: 'Intake via A', source: 'WEBSITE', externalId: 'ext-1' });
    expect(r.status).toBe(201);
    expect((await ownerB.get(`/leads/${r.body.id}`)).status).toBe(404);
    expect(JSON.stringify((await ownerB.get('/leads')).body)).not.toContain('Intake via A');
    // Same externalId from another organization's key creates a separate lead, not a dedupe hit on A.
    const keyB = (await ownerB.post('/api-keys', { name: 'Key B' })).body as { key: string };
    const rb = await request(ctx.server)
      .post('/api/v1/intake/leads')
      .set('X-Api-Key', keyB.key)
      .send({ fullName: 'Intake via B', source: 'WEBSITE', externalId: 'ext-1' });
    expect(rb.status).toBe(201);
    expect(rb.body.id).not.toBe(r.body.id);
    expect((await a.owner.get(`/leads/${r.body.id}`)).body.fullName).toBe('Intake via A');
  });
});

describe('role permissions on every protected route (PRD §14, SEC-006)', () => {
  it('roles without the permission get 403; roles with it pass the guard', async () => {
    const owner = await registerOrg(ctx, 'Org R');
    const clients: Record<Role, Client> = {
      OWNER: owner,
      HEAD_OF_SALES: await addMember(ctx, owner, 'HEAD_OF_SALES'),
      MANAGER: await addMember(ctx, owner, 'MANAGER'),
    };
    const missingId = '00000000-0000-4000-8000-000000000000';
    const protectedRoutes = routeTable(ctx).filter((r) => r.access === 'permission');
    expect(protectedRoutes.length).toBeGreaterThan(30);
    for (const route of protectedRoutes) {
      if (!route.permission) throw new Error(`${key(route)} has no permission metadata`);
      for (const role of ['HEAD_OF_SALES', 'MANAGER'] as const) {
        const res = await call(clients[role], route.method, `/${route.path.replace(':id', missingId)}`, {});
        const label = `${key(route)} [${route.permission}] as ${role}`;
        if (hasPermission(role, route.permission)) expect(res.status, label).not.toBe(403);
        else {
          expect(res.status, label).toBe(403);
          expect(res.body.error?.code ?? res.body.code, label).toBe('FORBIDDEN');
        }
      }
    }
  });

  it('protected business rules inside allowed routes', async () => {
    const owner = await registerOrg(ctx, 'Org R');
    const head = await addMember(ctx, owner, 'HEAD_OF_SALES');
    const head2 = await addMember(ctx, owner, 'HEAD_OF_SALES', 'Head Two');
    const manager = await addMember(ctx, owner, 'MANAGER');
    const members = (await owner.get('/members')).body as Array<{ id: string; userId: string; role: string }>;
    const ownerMembership = members.find((m) => m.role === 'OWNER');
    if (!ownerMembership) throw new Error('owner membership missing');

    // owner cannot be demoted or deactivated, even by the owner
    expect((await owner.patch(`/members/${ownerMembership.id}`, { role: 'MANAGER' })).status).toBe(422);
    expect((await owner.post(`/members/${ownerMembership.id}/deactivate`)).status).toBe(422);
    // head of sales invites managers only and revokes only own invitations
    expect(
      (await head.post('/invitations', { email: 'h3@example.test', role: 'HEAD_OF_SALES' })).status,
    ).toBe(403);
    const invByHead2 = (await head2.post('/invitations', { email: 'm9@example.test', role: 'MANAGER' }))
      .body as { id: string };
    expect((await head.post(`/invitations/${invByHead2.id}/revoke`)).status).toBe(403);
    expect((await owner.post(`/invitations/${invByHead2.id}/revoke`)).status).toBeLessThan(300);
    // manager edits only own leads, head edits any, only owner deletes
    const leadOfHead = await createLead(head, { fullName: 'Head lead', assigneeId: head.userId });
    expect((await manager.patch(`/leads/${leadOfHead.id}`, { rooms: 3 })).status).toBe(404);
    expect((await head2.patch(`/leads/${leadOfHead.id}`, { rooms: 3 })).status).toBe(200);
    expect((await head.delete(`/leads/${leadOfHead.id}`)).status).toBe(403);
    expect((await owner.delete(`/leads/${leadOfHead.id}`)).status).toBeLessThan(300);
    // manager cannot reopen a closed lead; head can
    const own = await createLead(manager, { fullName: 'Own lead' });
    await manager.post(`/leads/${own.id}/first-contact`, { channel: 'CALL' });
    expect(
      (await manager.post(`/leads/${own.id}/status`, { status: 'LOST', lostReason: 'NO_ANSWER' })).status,
    ).toBe(200);
    expect((await manager.post(`/leads/${own.id}/status`, { status: 'CONTACTED' })).status).toBe(403);
    expect((await head.post(`/leads/${own.id}/status`, { status: 'CONTACTED' })).status).toBe(200);
  });
});
