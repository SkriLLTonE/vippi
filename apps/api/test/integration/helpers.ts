import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { Role } from '@vippi/shared';
import request from 'supertest';

type TestAgent = ReturnType<typeof request.agent>;
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import { Clock } from '../../src/common/clock.js';
import { PrismaService } from '../../src/common/prisma/prisma.service.js';
import { RateLimiter } from '../../src/common/rate-limiter.js';
import { AI_PROVIDER, type AiProvider } from '../../src/modules/ai/providers/ai-provider.interface.js';

export const ORIGIN = 'http://localhost:8080';
export const PASSWORD = 'test-password-123';

export class TestClock extends Clock {
  private current: Date | null = null;
  override now(): Date {
    return this.current ? new Date(this.current) : new Date();
  }
  set(date: Date | string): void {
    this.current = new Date(date);
  }
  advance(ms: number): void {
    this.current = new Date(this.now().getTime() + ms);
  }
  reset(): void {
    this.current = null;
  }
}

export interface TestContext {
  app: INestApplication;
  clock: TestClock;
  prisma: PrismaService;
  server: Parameters<typeof request>[0];
  close: () => Promise<void>;
}

export async function createTestApp(opts: { aiProvider?: AiProvider | null } = {}): Promise<TestContext> {
  const clock = new TestClock();
  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(Clock)
    .useValue(clock);
  if (opts.aiProvider !== undefined) builder = builder.overrideProvider(AI_PROVIDER).useValue(opts.aiProvider);
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false, bufferLogs: true });
  configureApp(app);
  await app.listen(0, '127.0.0.1');
  const prisma = app.get(PrismaService);
  return {
    app,
    clock,
    prisma,
    server: app.getHttpServer(),
    close: () => app.close(),
  };
}

export async function resetDb(ctx: TestContext): Promise<void> {
  const tables = await ctx.prisma.system.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await ctx.prisma.system.$executeRawUnsafe(
    `TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`,
  );
  ctx.app.get(RateLimiter).reset();
  ctx.clock.reset();
}

/** Cookie-keeping HTTP client that sends the Origin header like a browser. */
export class Client {
  readonly agent: TestAgent;
  userId = '';
  orgId = '';
  constructor(server: TestContext['server']) {
    this.agent = request.agent(server);
  }
  get(url: string) {
    return this.agent.get(`/api/v1${url}`);
  }
  post(url: string, body?: object) {
    return this.agent.post(`/api/v1${url}`).set('Origin', ORIGIN).send(body);
  }
  patch(url: string, body?: object) {
    return this.agent.patch(`/api/v1${url}`).set('Origin', ORIGIN).send(body);
  }
  put(url: string, body?: object) {
    return this.agent.put(`/api/v1${url}`).set('Origin', ORIGIN).send(body);
  }
  delete(url: string) {
    return this.agent.delete(`/api/v1${url}`).set('Origin', ORIGIN);
  }
}

let seq = 0;
export const uniqueEmail = (prefix: string) => `${prefix}.${Date.now()}.${++seq}@example.test`;

export async function registerOrg(ctx: TestContext, name = 'Test Agency'): Promise<Client> {
  const c = new Client(ctx.server);
  const res = await c.post('/auth/register-organization', {
    organizationName: name,
    fullName: 'Owner Person',
    email: uniqueEmail('owner'),
    password: PASSWORD,
  });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  const me = await c.get('/auth/me');
  c.userId = me.body.user.id;
  c.orgId = me.body.organization.id;
  return c;
}

export async function addMember(
  ctx: TestContext,
  inviter: Client,
  role: Exclude<Role, 'OWNER'>,
  fullName = role === 'MANAGER' ? 'Manager Person' : 'Head Person',
): Promise<Client> {
  const email = uniqueEmail(role.toLowerCase());
  const inv = await inviter.post('/invitations', { email, role });
  if (inv.status !== 201) throw new Error(`invite failed: ${inv.status} ${JSON.stringify(inv.body)}`);
  const token = new URL(inv.body.inviteUrl as string).pathname.split('/').pop();
  const c = new Client(ctx.server);
  const acc = await c.post('/invitations/accept', { token, fullName, password: PASSWORD });
  if (acc.status !== 200 && acc.status !== 201) throw new Error(`accept failed: ${acc.status} ${JSON.stringify(acc.body)}`);
  const me = await c.get('/auth/me');
  c.userId = me.body.user.id;
  c.orgId = me.body.organization.id;
  return c;
}

export async function createLead(client: Client, body: Record<string, unknown> = {}) {
  const res = await client.post('/leads', {
    fullName: 'Test Lead',
    phone: '+998 00 123 45 67',
    source: 'INSTAGRAM',
    message: '2 xonali kvartira kerak, Yunusobod, 60 000$ gacha',
    ...body,
  });
  if (res.status !== 201) throw new Error(`create lead failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body as { id: string; number: number; firstResponseDueAt: string };
}
