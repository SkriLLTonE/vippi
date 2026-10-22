import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { EmailSender } from '../../src/modules/notifications/delivery/email-sender.js';
import type { EmailMessage, PushMessage } from '../../src/modules/notifications/delivery/messages.js';
import { NotificationDispatcherService } from '../../src/modules/notifications/delivery/notification-dispatcher.service.js';
import {
  PushSender,
  type PushResult,
  type PushTarget,
} from '../../src/modules/notifications/delivery/push-sender.js';
import { SlaSchedulerService } from '../../src/modules/sla/sla-scheduler.service.js';
import { createLead, createTestApp, registerOrg, resetDb, type Client, type TestContext } from './helpers.js';

class FakePush extends PushSender {
  sent: Array<{ endpoint: string; message: PushMessage; urgent: boolean }> = [];
  gone = new Set<string>();
  async send(target: PushTarget, message: PushMessage, urgent: boolean): Promise<PushResult> {
    if (this.gone.has(target.endpoint)) return 'gone';
    this.sent.push({ endpoint: target.endpoint, message, urgent });
    return 'sent';
  }
}

class FakeEmail extends EmailSender {
  sent: Array<{ to: string; message: EmailMessage; from?: string }> = [];
  async send(to: string, message: EmailMessage, from?: string): Promise<void> {
    this.sent.push({ to, message, from });
  }
}

const CHANNELS_ON = {
  VAPID_PUBLIC_KEY: 'test-vapid-public-key',
  VAPID_PRIVATE_KEY: 'test-vapid-private-key',
  SMTP_HOST: 'smtp.example.test',
  SMTP_FROM: 'Vippi <no-reply@example.test>',
};

const endpoint = (id: string) => `https://fcm.googleapis.com/fcm/send/${id}`;
const subscription = (id: string) => ({
  endpoint: endpoint(id),
  keys: { p256dh: `B${'a'.repeat(86)}`, auth: 'b'.repeat(22) },
});

async function breachFirstLead(ctx: TestContext, owner: Client) {
  const lead = await createLead(owner, { fullName: 'Secret Client', phone: '+998 90 111 22 33' });
  ctx.clock.advance(30 * 60_000);
  await ctx.app.get(SlaSchedulerService).runOnce(ctx.clock.now());
  return lead;
}

describe('push and email delivery (ADR-023)', () => {
  let ctx: TestContext;
  const push = new FakePush();
  const email = new FakeEmail();
  const dispatch = () => ctx.app.get(NotificationDispatcherService).runOnce(ctx.clock.now());

  beforeAll(async () => {
    ctx = await createTestApp({ env: CHANNELS_ON, pushSender: push, emailSender: email });
  });
  afterAll(async () => ctx.close());
  beforeEach(async () => {
    await resetDb(ctx);
    push.sent = [];
    push.gone.clear();
    email.sent = [];
  });

  it('settings: channels, VAPID key and the email opt-in', async () => {
    const owner = await registerOrg(ctx);
    const s = (await owner.get('/notifications/settings')).body;
    expect(s).toMatchObject({
      channels: { push: true, email: true },
      vapidPublicKey: CHANNELS_ON.VAPID_PUBLIC_KEY,
      emailEnabled: false,
      pushSubscriptions: 0,
    });
    const upd = await owner.patch('/notifications/settings', { emailEnabled: true });
    expect(upd.status).toBe(200);
    expect(upd.body.emailEnabled).toBe(true);
    expect((await owner.patch('/notifications/settings', { emailEnabled: true, extra: 1 })).status).toBe(400);
  });

  it('accepts only browser push service endpoints (no SSRF)', async () => {
    const owner = await registerOrg(ctx);
    for (const bad of [
      'https://evil.example/push',
      'http://fcm.googleapis.com/fcm/send/x',
      'https://fcm.googleapis.com:8443/fcm/send/x',
      'https://user@fcm.googleapis.com/fcm/send/x',
      'https://127.0.0.1/x',
    ]) {
      const res = await owner.post('/notifications/push-subscriptions', {
        ...subscription('x'),
        endpoint: bad,
      });
      expect(res.status, bad).toBe(400);
    }
    expect((await owner.post('/notifications/push-subscriptions', subscription('ok'))).status).toBe(204);
    expect((await owner.get('/notifications/settings')).body.pushSubscriptions).toBe(1);
  });

  it('a device endpoint moves to the account that subscribed last', async () => {
    const a = await registerOrg(ctx, 'Org A');
    const b = await registerOrg(ctx, 'Org B');
    await a.post('/notifications/push-subscriptions', subscription('shared-device'));
    await b.post('/notifications/push-subscriptions', subscription('shared-device'));
    expect((await a.get('/notifications/settings')).body.pushSubscriptions).toBe(0);
    expect((await b.get('/notifications/settings')).body.pushSubscriptions).toBe(1);
    // B cannot remove A's endpoints and vice versa: removal is scoped to the caller.
    await a.post('/notifications/push-subscriptions/remove', { endpoint: endpoint('shared-device') });
    expect((await b.get('/notifications/settings')).body.pushSubscriptions).toBe(1);
  });

  it('delivers an SLA breach once to push and email, without client data', async () => {
    const owner = await registerOrg(ctx, 'Acme Agency');
    await owner.post('/notifications/push-subscriptions', subscription('owner-laptop'));
    await owner.patch('/notifications/settings', { emailEnabled: true });
    const lead = await breachFirstLead(ctx, owner);

    const r = await dispatch();
    expect(r).toMatchObject({ locked: true, claimed: 1, push: 1, email: 1, failed: 0 });
    expect(push.sent[0]).toMatchObject({ endpoint: endpoint('owner-laptop'), urgent: true });
    expect(push.sent[0]?.message.body).toContain('#1');
    expect(push.sent[0]?.message.url).toBe(`http://localhost:8080/leads/${lead.id}`);
    const mail = email.sent[0];
    expect(mail?.to).toMatch(/^owner\./);
    expect(mail?.from).toBe('"Acme Agency" <no-reply@example.test>');
    expect(mail?.message.text).toContain(`/leads/${lead.id}`);
    const all = JSON.stringify([push.sent, email.sent]);
    expect(all).not.toContain('Secret Client');
    expect(all).not.toContain('901112233');

    expect(await dispatch()).toMatchObject({ claimed: 0, push: 0, email: 0 });
    expect(push.sent).toHaveLength(1);
  });

  it('uses Organization.emailFrom when set', async () => {
    const owner = await registerOrg(ctx, 'Brand Co');
    await owner.patch('/organization', { emailFrom: 'hello@brand.test' });
    await owner.patch('/notifications/settings', { emailEnabled: true });
    await breachFirstLead(ctx, owner);
    expect(await dispatch()).toMatchObject({ email: 1 });
    expect(email.sent[0]?.from).toBe('"Brand Co" <hello@brand.test>');
  });

  it('respects the email opt-out, demo organizations and expired subscriptions', async () => {
    const owner = await registerOrg(ctx);
    await owner.post('/notifications/push-subscriptions', subscription('old-phone'));
    await owner.post('/notifications/push-subscriptions', subscription('laptop'));
    push.gone.add(endpoint('old-phone'));
    await breachFirstLead(ctx, owner);

    const r = await dispatch();
    expect(r).toMatchObject({ claimed: 1, push: 1, email: 0 });
    expect(email.sent).toHaveLength(0);
    expect((await owner.get('/notifications/settings')).body.pushSubscriptions).toBe(1);

    await owner.patch('/notifications/settings', { emailEnabled: true });
    await ctx.prisma.system.organization.update({ where: { id: owner.orgId }, data: { isDemo: true } });
    await createLead(owner);
    ctx.clock.advance(30 * 60_000);
    await ctx.app.get(SlaSchedulerService).runOnce(ctx.clock.now());
    expect(await dispatch()).toMatchObject({ claimed: 1, push: 1, email: 0 });
  });

  it('skips stale notifications instead of sending them late', async () => {
    const owner = await registerOrg(ctx);
    await owner.post('/notifications/push-subscriptions', subscription('laptop'));
    await breachFirstLead(ctx, owner);
    const r = await ctx.app.get(NotificationDispatcherService).runOnce(new Date(Date.now() + 7 * 3600_000));
    expect(r).toMatchObject({ claimed: 1, push: 0 });
    expect(push.sent).toHaveLength(0);
  });

  it('test notification goes to every channel and is rate limited', async () => {
    const owner = await registerOrg(ctx);
    await owner.post('/notifications/push-subscriptions', subscription('laptop'));
    await owner.patch('/notifications/settings', { emailEnabled: true });
    const res = await owner.post('/notifications/test');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ push: 1, email: true });
    for (let i = 0; i < 4; i++) expect((await owner.post('/notifications/test')).status).toBe(200);
    expect((await owner.post('/notifications/test')).status).toBe(429);
  });
});

describe('notification channels without server configuration', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => ctx.close());
  beforeEach(async () => resetDb(ctx));

  it('reports channels as off and refuses to enable them', async () => {
    const owner = await registerOrg(ctx);
    const s = (await owner.get('/notifications/settings')).body;
    expect(s).toMatchObject({ channels: { push: false, email: false }, vapidPublicKey: null });
    expect((await owner.patch('/notifications/settings', { emailEnabled: true })).status).toBe(422);
    expect((await owner.patch('/notifications/settings', { emailEnabled: false })).status).toBe(200);
    expect((await owner.post('/notifications/push-subscriptions', subscription('x'))).status).toBe(422);
    const r = await ctx.app.get(NotificationDispatcherService).runOnce(ctx.clock.now());
    expect(r).toMatchObject({ push: 0, email: 0 });
  });
});
