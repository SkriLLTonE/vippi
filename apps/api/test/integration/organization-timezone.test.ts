import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { addMember, createTestApp, registerOrg, resetDb, type TestContext } from './helpers.js';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(async () => ctx.close());
beforeEach(async () => resetDb(ctx));

describe('Organization time zone', () => {
  it('owner picks a zone from the list; others cannot; unlisted zones are rejected; change is audited', async () => {
    const owner = await registerOrg(ctx);
    const head = await addMember(ctx, owner, 'HEAD_OF_SALES');
    expect((await owner.get('/organization')).body.timezone).toBe('Asia/Tashkent');

    expect((await head.patch('/organization', { timezone: 'Asia/Almaty' })).status).toBe(403);
    const bad = await owner.patch('/organization', { timezone: 'America/New_York' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.details[0]).toMatchObject({ path: 'timezone' });

    const res = await owner.patch('/organization', { timezone: 'Asia/Almaty' });
    expect(res.status).toBe(200);
    expect(res.body.timezone).toBe('Asia/Almaty');
    expect((await head.get('/auth/me')).body.organization.timezone).toBe('Asia/Almaty');
    await owner.patch('/organization', { timezone: 'Asia/Almaty' });

    const settings = await ctx.prisma.system.auditLog.findMany({ where: { organizationId: owner.orgId, action: 'ORG_SETTINGS_UPDATED' } });
    expect(settings.map((r) => r.metadata)).toEqual([{ fields: ['timezone'] }]);
  });

  it('a stored zone outside the list is still returned and does not block other edits', async () => {
    const owner = await registerOrg(ctx);
    await ctx.prisma.system.organization.update({ where: { id: owner.orgId }, data: { timezone: 'Europe/Berlin' } });
    expect((await owner.get('/organization')).body.timezone).toBe('Europe/Berlin');
    const res = await owner.patch('/organization', { name: 'Renamed Agency' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'Renamed Agency', timezone: 'Europe/Berlin' });
  });
});
