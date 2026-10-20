import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { addMember, Client, createTestApp, PASSWORD, registerOrg, resetDb, uniqueEmail, type TestContext } from './helpers.js';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(async () => ctx.close());
beforeEach(async () => resetDb(ctx));

describe('auth', () => {
  it('registers an organization with owner, default SLA policy and session (AC-001)', async () => {
    const owner = await registerOrg(ctx, 'Alpha Realty');
    const me = await owner.get('/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.role).toBe('OWNER');
    expect(me.body.organization.aiExternalProcessingEnabled).toBe(false);
    expect(me.body.features.CSV_IMPORT_PREVIEW).toBe(true);
    const sla = await owner.get('/sla-policy');
    expect(sla.body.firstResponseMinutes).toBe(15);
  });

  it('rejects duplicate email with 409 EMAIL_TAKEN', async () => {
    const email = uniqueEmail('dup');
    const body = { organizationName: 'Org', fullName: 'Some One', email, password: PASSWORD };
    expect((await new Client(ctx.server).post('/auth/register-organization', body)).status).toBe(201);
    const res = await new Client(ctx.server).post('/auth/register-organization', body);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('validates input with field details (400 VALIDATION_FAILED)', async () => {
    const res = await new Client(ctx.server).post('/auth/register-organization', {
      organizationName: 'O',
      fullName: 'X',
      email: 'bad',
      password: 'short',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.requestId).toBeTruthy();
    const paths = res.body.error.details.map((d: { path: string }) => d.path);
    expect(paths).toEqual(expect.arrayContaining(['email', 'password']));
  });

  it('rejects state-changing requests from a foreign Origin (SEC-005)', async () => {
    const res = await request(ctx.server)
      .post('/api/v1/auth/login')
      .set('Origin', 'https://evil.example')
      .send({ email: 'a@b.cd', password: 'x' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ORIGIN_MISMATCH');
  });

  it('logs in, logs out and invalidates the session', async () => {
    const owner = await registerOrg(ctx);
    const me = await owner.get('/auth/me');
    const c = new Client(ctx.server);
    const login = await c.post('/auth/login', { email: me.body.user.email, password: PASSWORD });
    expect(login.status).toBe(200);
    const cookie = login.headers['set-cookie']?.[0] ?? '';
    expect(cookie).toMatch(/vippi_sid=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect((await c.post('/auth/logout')).status).toBe(204);
    expect((await c.get('/auth/me')).status).toBe(401);
  });

  it('locks login after 5 failed attempts (SEC-004)', async () => {
    const owner = await registerOrg(ctx);
    const email = (await owner.get('/auth/me')).body.user.email as string;
    const c = new Client(ctx.server);
    for (let i = 0; i < 5; i++) {
      const r = await c.post('/auth/login', { email, password: 'wrong-password' });
      expect(r.status).toBe(401);
      expect(r.body.error.code).toBe('INVALID_CREDENTIALS');
    }
    const locked = await c.post('/auth/login', { email, password: PASSWORD });
    expect(locked.status).toBe(429);
    expect(locked.headers['retry-after']).toBeTruthy();
  });

  it('invites a manager who accepts and gets MANAGER permissions; managers cannot invite', async () => {
    const owner = await registerOrg(ctx);
    const manager = await addMember(ctx, owner, 'MANAGER');
    const me = await manager.get('/auth/me');
    expect(me.body.role).toBe('MANAGER');
    expect(me.body.permissions).not.toContain('lead.readAll');
    const res = await manager.post('/invitations', { email: uniqueEmail('x'), role: 'MANAGER' });
    expect(res.status).toBe(403);
  });

  it('head of sales cannot invite another head of sales', async () => {
    const owner = await registerOrg(ctx);
    const head = await addMember(ctx, owner, 'HEAD_OF_SALES');
    const res = await head.post('/invitations', { email: uniqueEmail('h2'), role: 'HEAD_OF_SALES' });
    expect(res.status).toBe(403);
  });

  it('deactivating a member revokes sessions and unassigns open leads (FR-008)', async () => {
    const owner = await registerOrg(ctx);
    const manager = await addMember(ctx, owner, 'MANAGER');
    const lead = (await manager.post('/leads', { fullName: 'L', source: 'PHONE' })).body;
    const members = (await owner.get('/members')).body as Array<{ id: string; userId: string }>;
    const m = members.find((x) => x.userId === manager.userId);
    expect((await owner.post(`/members/${m?.id}/deactivate`)).status).toBe(200);
    expect((await manager.get('/auth/me')).status).toBe(401);
    const after = await owner.get(`/leads/${lead.id}`);
    expect(after.body.assignee).toBeNull();
  });
});
