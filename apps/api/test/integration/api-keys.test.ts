import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sha256Hex } from '../../src/common/crypto.js';
import { addMember, type Client, createTestApp, registerOrg, resetDb, type TestContext } from './helpers.js';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(async () => ctx.close());
beforeEach(async () => resetDb(ctx));

const intake = (key: string) =>
  request(ctx.server).post('/api/v1/intake/leads').set('X-Api-Key', key).send({ fullName: 'Web lead', source: 'WEBSITE' });

async function createKey(owner: Client, name = 'Website') {
  const r = await owner.post('/api-keys', { name });
  expect(r.status).toBe(201);
  return r.body as { id: string; key: string; prefix: string; last3: string; revealable: boolean };
}

describe('API keys: copy later, rotate, delete', () => {
  it('reveal returns the same full key, no-store, audited; the list and DB never hold it in clear', async () => {
    const owner = await registerOrg(ctx);
    const created = await createKey(owner);
    expect(created).toMatchObject({ revealable: true, last3: created.key.slice(-3) });

    const r = await owner.post(`/api-keys/${created.id}/reveal`);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ key: created.key });
    expect(r.headers['cache-control']).toBe('no-store');

    const list = (await owner.get('/api-keys')).body as Array<Record<string, unknown>>;
    expect(list).toEqual([expect.objectContaining({ id: created.id, last3: created.key.slice(-3), revealable: true })]);
    expect(JSON.stringify(list)).not.toContain(created.key);

    const row = await ctx.prisma.system.apiKey.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.keyCiphertext).toMatch(/^v1\./);
    expect(row.keyCiphertext).not.toContain(created.key.slice(4));

    const audit = (await owner.get('/audit-logs')).body.items as Array<{ action: string; entityId: string }>;
    expect(audit).toEqual(expect.arrayContaining([expect.objectContaining({ action: 'API_KEY_REVEALED', entityId: created.id })]));
    expect(JSON.stringify(audit)).not.toContain(created.key);
  });

  it('reveal of a foreign or deleted key is 404; managers and heads are forbidden', async () => {
    const ownerA = await registerOrg(ctx, 'Org A');
    const ownerB = await registerOrg(ctx, 'Org B');
    const keyA = await createKey(ownerA);
    expect((await ownerB.post(`/api-keys/${keyA.id}/reveal`)).status).toBe(404);
    expect((await ownerB.post(`/api-keys/${keyA.id}/rotate`)).status).toBe(404);
    for (const role of ['MANAGER', 'HEAD_OF_SALES'] as const) {
      const member = await addMember(ctx, ownerA, role);
      const res = await member.post(`/api-keys/${keyA.id}/reveal`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect((await member.post(`/api-keys/${keyA.id}/rotate`)).status).toBe(403);
    }
    expect((await ownerA.post(`/api-keys/${keyA.id}/revoke`)).status).toBe(204);
    expect((await ownerA.post(`/api-keys/${keyA.id}/reveal`)).status).toBe(404);
  });

  it('rotate: new key with the same name works, the old one gets 401 immediately', async () => {
    const owner = await registerOrg(ctx);
    const old = await createKey(owner, 'Telegram bot');
    expect((await intake(old.key)).status).toBe(201);

    const r = await owner.post(`/api-keys/${old.id}/rotate`);
    expect(r.status).toBe(201);
    expect(r.headers['cache-control']).toBe('no-store');
    const fresh = r.body as { id: string; key: string; name: string; revealable: boolean };
    expect(fresh).toMatchObject({ name: 'Telegram bot', revealable: true });
    expect(fresh.id).not.toBe(old.id);
    expect(fresh.key).not.toBe(old.key);

    const rejected = await intake(old.key);
    expect(rejected.status).toBe(401);
    expect(rejected.body.error.code).toBe('INVALID_API_KEY');
    expect((await intake(fresh.key)).status).toBe(201);
    expect((await owner.post(`/api-keys/${fresh.id}/reveal`)).body.key).toBe(fresh.key);
    expect((await owner.get('/api-keys')).body.map((k: { id: string }) => k.id)).toEqual([fresh.id]);
    expect((await owner.post(`/api-keys/${old.id}/rotate`)).status).toBe(404);

    const audit = (await owner.get('/audit-logs?action=API_KEY_ROTATED')).body.items as Array<{ entityId: string; metadata: Record<string, unknown> }>;
    expect(audit).toEqual([expect.objectContaining({ entityId: fresh.id, metadata: expect.objectContaining({ replacedKeyId: old.id }) })]);
  });

  it('rotate succeeds at the active-key limit and keeps the count', async () => {
    const owner = await registerOrg(ctx);
    const keys = [];
    for (let i = 0; i < 5; i++) keys.push(await createKey(owner, `Key ${i}`));
    expect((await owner.post('/api-keys', { name: 'Sixth' })).body.error.code).toBe('API_KEY_LIMIT');
    expect((await owner.post(`/api-keys/${keys[0]?.id}/rotate`)).status).toBe(201);
    expect((await owner.get('/api-keys')).body).toHaveLength(5);
  });

  it('legacy key without ciphertext: listed as non-revealable, reveal → 422 API_KEY_NOT_REVEALABLE, rotate fixes it', async () => {
    const owner = await registerOrg(ctx);
    const legacyKey = 'vpk_legacyLegacyLegacyLegacyLegacyLegacy0001';
    const legacy = await ctx.prisma.system.apiKey.create({
      data: { organizationId: owner.orgId, name: 'Old site', prefix: legacyKey.slice(0, 12), keyHash: sha256Hex(legacyKey) },
    });
    expect((await intake(legacyKey)).status).toBe(201);
    const listed = (await owner.get('/api-keys')).body as Array<{ id: string; last3: string | null; revealable: boolean }>;
    expect(listed).toEqual([expect.objectContaining({ id: legacy.id, last3: null, revealable: false })]);

    const r = await owner.post(`/api-keys/${legacy.id}/reveal`);
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe('API_KEY_NOT_REVEALABLE');

    const rotated = await owner.post(`/api-keys/${legacy.id}/rotate`);
    expect(rotated.status).toBe(201);
    expect((await owner.post(`/api-keys/${rotated.body.id}/reveal`)).body.key).toBe(rotated.body.key);
    expect((await intake(legacyKey)).status).toBe(401);
  });

  it('delete (soft revoke) hides the key from the list but keeps the row for audit', async () => {
    const owner = await registerOrg(ctx);
    const keep = await createKey(owner, 'Keep');
    const gone = await createKey(owner, 'Gone');
    expect((await owner.post(`/api-keys/${gone.id}/revoke`)).status).toBe(204);
    expect((await owner.get('/api-keys')).body.map((k: { id: string }) => k.id)).toEqual([keep.id]);
    const row = await ctx.prisma.system.apiKey.findUniqueOrThrow({ where: { id: gone.id } });
    expect(row.revokedAt).not.toBeNull();
    expect((await intake(gone.key)).status).toBe(401);
  });

  it('reveal is rate limited per user', async () => {
    const owner = await registerOrg(ctx);
    const created = await createKey(owner);
    for (let i = 0; i < 30; i++) expect((await owner.post(`/api-keys/${created.id}/reveal`)).status).toBe(200);
    const limited = await owner.post(`/api-keys/${created.id}/reveal`);
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
    expect(limited.headers['retry-after']).toBeDefined();
  });
});
