import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, ORIGIN, PASSWORD, resetDb, uniqueEmail, type TestContext } from './helpers.js';

/**
 * ADR-022 single-origin deployment: the API serves the built SPA (WEB_DIST_DIR) and sits behind
 * Render's proxies (TRUST_PROXY=3: Cloudflare → Render load balancer → in-instance proxy).
 */
describe('single-origin deployment (WEB_DIST_DIR, TRUST_PROXY)', () => {
  let ctx: TestContext;
  const dist = mkdtempSync(join(tmpdir(), 'vippi-web-'));
  const saved = { WEB_DIST_DIR: process.env.WEB_DIST_DIR, TRUST_PROXY: process.env.TRUST_PROXY };

  beforeAll(async () => {
    mkdirSync(join(dist, 'assets'));
    writeFileSync(join(dist, 'index.html'), '<!doctype html><title>Vippi SPA</title><div id="root"></div>');
    writeFileSync(join(dist, 'assets', 'index-abc123.js'), 'console.log("app")');
    writeFileSync(join(dist, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    process.env.WEB_DIST_DIR = dist;
    process.env.TRUST_PROXY = '3';
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    rmSync(dist, { recursive: true, force: true });
  });

  beforeEach(() => resetDb(ctx));

  const http = () => request(ctx.server);

  it('serves index.html with the SPA security headers', async () => {
    const res = await http().get('/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain('Vippi SPA');
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['cache-control']).toBe('no-cache');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('client-side routes fall back to index.html (deep links survive reload)', async () => {
    for (const path of ['/leads', '/leads/2f0c7c8e-1111-4a5e-9a9a-000000000000', '/settings/sla', '/invite/some-token']) {
      const res = await http().get(path);
      expect(res.status, path).toBe(200);
      expect(res.text, path).toContain('Vippi SPA');
    }
  });

  it('hashed assets are immutable; a missing asset is 404, not index.html', async () => {
    const js = await http().get('/assets/index-abc123.js');
    expect(js.status).toBe(200);
    expect(js.headers['content-type']).toMatch(/javascript/);
    expect(js.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    const missing = await http().get('/assets/missing-000.js');
    expect(missing.status).toBe(404);
    expect(missing.text).not.toContain('Vippi SPA');
    const favicon = await http().get('/favicon.svg');
    expect(favicon.status).toBe(200);
  });

  it('/api keeps JSON semantics: unknown routes are JSON 404, health works, non-GET is not swallowed', async () => {
    const unknown = await http().get('/api/v1/does-not-exist');
    expect(unknown.status).toBe(404);
    expect(unknown.headers['content-type']).toMatch(/application\/json/);
    expect(unknown.body.error.code).toBe('NOT_FOUND');
    expect((await http().get('/api/health')).body.status).toBe('ok');
    const post = await http().post('/leads').set('Origin', ORIGIN).send({});
    expect(post.status).toBe(404);
    expect(post.text).not.toContain('Vippi SPA');
  });

  it('client IP is taken 3 hops from the right of X-Forwarded-For; a spoofed left part is ignored', async () => {
    const agent = request.agent(ctx.server);
    const res = await agent
      .post('/api/v1/auth/register-organization')
      .set('Origin', ORIGIN)
      .set('X-Forwarded-For', '6.6.6.6, 203.0.113.9, 172.70.1.1, 10.226.0.1')
      .send({ organizationName: 'Proxy Org', fullName: 'Proxy Owner', email: uniqueEmail('proxy'), password: PASSWORD });
    expect(res.status).toBe(201);
    const audit = await agent.get('/api/v1/audit-logs');
    expect(audit.status).toBe(200);
    const ips = new Set((audit.body.items as Array<{ ip: string | null }>).map((i) => i.ip));
    expect([...ips]).toEqual(['203.0.113.9']);
  });

  it('auth rate limit counts the real client behind the proxy; rotating spoofed XFF does not bypass it', async () => {
    const attempt = (spoof: string, client: string) =>
      http()
        .post('/api/v1/auth/login')
        .set('Origin', ORIGIN)
        .set('X-Forwarded-For', `${spoof}, ${client}, 172.70.1.1, 10.226.0.1`)
        .send({ email: uniqueEmail('nobody'), password: 'Wrong-Password-1' });
    const statuses: number[] = [];
    for (let i = 0; i < 31; i++) statuses.push((await attempt(`9.9.9.${i}`, '198.51.100.7')).status);
    expect(statuses.slice(0, 30).every((s) => s === 401)).toBe(true);
    expect(statuses[30]).toBe(429);
    expect((await attempt('9.9.9.99', '198.51.100.8')).status).toBe(401);
  });
});
