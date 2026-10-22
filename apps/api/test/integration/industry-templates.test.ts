import { INDUSTRY_TEMPLATES } from '@vippi/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { addMember, Client, createTestApp, PASSWORD, registerOrg, resetDb, uniqueEmail, type TestContext } from './helpers.js';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(async () => ctx.close());
beforeEach(async () => resetDb(ctx));

async function register(body: Record<string, unknown>): Promise<Client> {
  const c = new Client(ctx.server);
  const res = await c.post('/auth/register-organization', {
    organizationName: 'Biz',
    fullName: 'Owner Person',
    email: uniqueEmail('ind'),
    password: PASSWORD,
    ...body,
  });
  expect(res.status).toBe(201);
  c.userId = res.body.user.id;
  c.orgId = res.body.organization.id;
  return c;
}

async function audit(orgId: string, action: string) {
  const rows = await ctx.prisma.system.auditLog.findMany({ where: { organizationId: orgId, action }, orderBy: { createdAt: 'asc' } });
  return rows.map((r) => r.metadata);
}

const keys = (defs: Array<{ key: string }>) => defs.map((d) => d.key);
const dental = INDUSTRY_TEMPLATES.DENTAL_CLINIC;
const auto = INDUSTRY_TEMPLATES.AUTO;

describe('Industry templates at registration (ADR-025)', () => {
  it('DENTAL_CLINIC seeds template fields and status labels; a lead with template attributes works', async () => {
    const owner = await register({ industry: 'DENTAL_CLINIC' });
    const me = (await owner.get('/auth/me')).body;
    expect(me.organization).toMatchObject({
      industry: 'DENTAL_CLINIC',
      industryPreset: 'GENERIC',
      statusLabels: dental.statusLabels,
    });
    expect(me.organization.leadFields).toEqual(dental.fields);
    const lead = await owner.post('/leads', { fullName: 'Анна', source: 'INSTAGRAM', attributes: dental.sample.attributes });
    expect(lead.status).toBe(201);
    expect(lead.body.attributes).toEqual(dental.sample.attributes);
  });

  it('legacy presets: omitted → REAL_ESTATE without fields, GENERIC → OTHER without fields', async () => {
    const re = await registerOrg(ctx);
    expect((await re.get('/organization')).body).toMatchObject({ industry: 'REAL_ESTATE', industryPreset: 'REAL_ESTATE', leadFields: [], statusLabels: {} });
    const generic = await register({ industryPreset: 'GENERIC' });
    expect((await generic.get('/organization')).body).toMatchObject({ industry: 'OTHER', industryPreset: 'GENERIC', leadFields: [], statusLabels: {} });
  });

  it('rejects an unknown industry code', async () => {
    const res = await new Client(ctx.server).post('/auth/register-organization', {
      organizationName: 'Biz',
      fullName: 'Owner Person',
      email: uniqueEmail('bad'),
      password: PASSWORD,
      industry: 'SPACE_TRAVEL',
    });
    expect(res.status).toBe(400);
  });

  it('a legacy row (GENERIC preset, default industry column) is reported as OTHER', async () => {
    const owner = await register({ industryPreset: 'GENERIC' });
    await ctx.prisma.system.organization.update({ where: { id: owner.orgId }, data: { industry: 'REAL_ESTATE' } });
    expect((await owner.get('/auth/me')).body.organization).toMatchObject({ industry: 'OTHER', industryPreset: 'GENERIC' });
  });
});

describe('Switching industry and applying a template (ADR-025)', () => {
  it('merges without deleting: existing fields, stored values and customized labels are kept; audited', async () => {
    const owner = await register({ industry: 'DENTAL_CLINIC' });
    await owner.patch('/organization', { statusLabels: { WON: { ru: 'Пришёл' } } });
    await owner.post('/lead-fields', { key: 'insurance', label: { ru: 'Страховка' }, type: 'text' });
    const lead = (
      await owner.post('/leads', { fullName: 'Анна', source: 'PHONE', attributes: { service: 'implant', insurance: 'есть' } })
    ).body;

    const res = await owner.post('/organization/industry-template', { industry: 'AUTO' });
    expect(res.status).toBe(200);
    // 3 dental + 1 custom + 4 auto = 8 (limit).
    expect(res.body.addedFields).toEqual(keys(auto.fields));
    expect(res.body.skippedFields).toEqual([]);
    expect(res.body.statusLabelsChanged).toEqual(['LOST']);
    expect(res.body.organization).toMatchObject({
      industry: 'AUTO',
      industryPreset: 'GENERIC',
      statusLabels: { WON: { ru: 'Пришёл' }, LOST: auto.statusLabels.LOST },
    });
    expect(keys(res.body.organization.leadFields)).toEqual([...keys(dental.fields), 'insurance', ...keys(auto.fields)]);
    expect((await owner.get(`/leads/${lead.id}`)).body.attributes).toEqual({ service: 'implant', insurance: 'есть' });

    expect(await audit(owner.orgId, 'ORG_INDUSTRY_CHANGED')).toEqual([{ from: 'DENTAL_CLINIC', to: 'AUTO' }]);
    expect(await audit(owner.orgId, 'ORG_INDUSTRY_TEMPLATE_APPLIED')).toEqual([
      expect.objectContaining({ industry: 'AUTO', addedFields: keys(auto.fields), skippedFields: [], statusLabelsChanged: ['LOST'] }),
    ]);
    expect(await audit(owner.orgId, 'ORG_INDUSTRY_PRESET_CHANGED')).toEqual([]);
  });

  it('respects the 8-field limit and overwrites customized labels only when confirmed', async () => {
    const owner = await register({ industry: 'DENTAL_CLINIC' });
    await owner.patch('/organization', { statusLabels: { WON: { ru: 'Пришёл' }, LOST: { ru: 'Слился' } } });
    for (const k of ['a1', 'a2', 'a3', 'a4']) await owner.post('/lead-fields', { key: k, label: { ru: k }, type: 'text' });

    const res = await owner.post('/organization/industry-template', { industry: 'EDUCATION', overwriteStatusLabels: true });
    expect(res.status).toBe(200);
    expect(res.body.addedFields).toEqual(['course']);
    expect(res.body.skippedFields).toEqual(['studentAge', 'format', 'level']);
    expect(res.body.organization.leadFields).toHaveLength(8);
    expect(res.body.organization.statusLabels).toEqual(INDUSTRY_TEMPLATES.EDUCATION.statusLabels);
  });

  it('switching to REAL_ESTATE changes the preset, keeps custom fields; re-applying is a no-op', async () => {
    const owner = await register({ industry: 'BEAUTY_SALON' });
    const toRe = await owner.post('/organization/industry-template', { industry: 'REAL_ESTATE' });
    expect(toRe.body.organization).toMatchObject({ industry: 'REAL_ESTATE', industryPreset: 'REAL_ESTATE' });
    expect(toRe.body.organization.leadFields).toHaveLength(INDUSTRY_TEMPLATES.BEAUTY_SALON.fields.length);
    expect(await audit(owner.orgId, 'ORG_INDUSTRY_PRESET_CHANGED')).toEqual([{ from: 'GENERIC', to: 'REAL_ESTATE' }]);

    const again = await owner.post('/organization/industry-template', { industry: 'REAL_ESTATE' });
    expect(again.body).toMatchObject({ addedFields: [], skippedFields: [], statusLabelsChanged: [] });
    expect(await audit(owner.orgId, 'ORG_INDUSTRY_CHANGED')).toHaveLength(1);
  });

  it('PATCH industry changes only the industry (no fields); legacy industryPreset keeps a specific industry', async () => {
    const owner = await register({ industry: 'TOURISM' });
    const patched = await owner.patch('/organization', { industry: 'FITNESS_UNKNOWN' });
    expect(patched.status).toBe(400);
    const toAuto = await owner.patch('/organization', { industry: 'AUTO' });
    expect(toAuto.body).toMatchObject({ industry: 'AUTO', industryPreset: 'GENERIC' });
    expect(keys(toAuto.body.leadFields)).toEqual(keys(INDUSTRY_TEMPLATES.TOURISM.fields));
    expect((await owner.patch('/organization', { industryPreset: 'GENERIC' })).body.industry).toBe('AUTO');
    expect((await owner.patch('/organization', { industryPreset: 'REAL_ESTATE' })).body.industry).toBe('REAL_ESTATE');
    expect((await owner.patch('/organization', { industryPreset: 'GENERIC' })).body.industry).toBe('OTHER');
  });

  it('access: only the owner may apply a template; tenant-scoped', async () => {
    const owner = await register({ industry: 'OTHER' });
    const head = await addMember(ctx, owner, 'HEAD_OF_SALES');
    const manager = await addMember(ctx, owner, 'MANAGER');
    for (const actor of [head, manager]) {
      expect((await actor.post('/organization/industry-template', { industry: 'AUTO' })).status).toBe(403);
    }
    expect((await new Client(ctx.server).post('/organization/industry-template', { industry: 'AUTO' })).status).toBe(401);
    expect((await owner.post('/organization/industry-template', { industry: 'NOPE' })).status).toBe(400);

    const other = await register({ industry: 'OTHER' });
    await other.post('/organization/industry-template', { industry: 'AUTO' });
    expect((await owner.get('/organization')).body).toMatchObject({ industry: 'OTHER', leadFields: [] });
  });
});
