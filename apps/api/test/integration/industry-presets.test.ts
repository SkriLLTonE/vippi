import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { addMember, Client, createLead, createTestApp, PASSWORD, registerOrg, resetDb, uniqueEmail, type TestContext } from './helpers.js';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(async () => ctx.close());
beforeEach(async () => resetDb(ctx));

async function registerGeneric(name = 'Smile Dent'): Promise<Client> {
  const c = new Client(ctx.server);
  const res = await c.post('/auth/register-organization', {
    organizationName: name,
    fullName: 'Clinic Owner',
    email: uniqueEmail('clinic'),
    password: PASSWORD,
    industryPreset: 'GENERIC',
  });
  expect(res.status).toBe(201);
  c.userId = res.body.user.id;
  c.orgId = res.body.organization.id;
  return c;
}

const SERVICE_FIELD = {
  key: 'service',
  label: { ru: 'Услуга', uz: 'Xizmat' },
  type: 'single_select',
  required: true,
  options: [
    { value: 'cleaning', label: { ru: 'Чистка' } },
    { value: 'implant', label: { ru: 'Имплант' } },
  ],
};
const TIME_FIELD = { key: 'preferredTime', label: { ru: 'Удобное время' }, type: 'text' };

async function auditActions(orgId: string): Promise<string[]> {
  const rows = await ctx.prisma.system.auditLog.findMany({ where: { organizationId: orgId }, orderBy: { createdAt: 'asc' } });
  return rows.map((r) => r.action);
}

describe('Industry preset (ADR-024, slice 1)', () => {
  it('registers a GENERIC organization; /auth/me exposes the lead configuration', async () => {
    const owner = await registerGeneric();
    const me = (await owner.get('/auth/me')).body;
    expect(me.organization).toMatchObject({ industryPreset: 'GENERIC', leadFields: [], statusLabels: {} });
    expect(me.permissions).toContain('leadFields.manage');
  });

  it('defaults to REAL_ESTATE when the preset is omitted', async () => {
    const owner = await registerOrg(ctx);
    expect((await owner.get('/organization')).body.industryPreset).toBe('REAL_ESTATE');
  });

  it('creates a lead without district/property fields in GENERIC', async () => {
    const owner = await registerGeneric();
    const res = await owner.post('/leads', { fullName: 'Анна', phone: '+998 90 123 45 67', source: 'INSTAGRAM', message: 'Хочу на чистку' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ district: null, propertyType: null, rooms: null, attributes: {} });
  });

  it('switching the preset keeps real-estate data; only the owner may switch; the change is audited', async () => {
    const owner = await registerOrg(ctx);
    const lead = await createLead(owner, { district: 'YUNUSOBOD', propertyType: 'APARTMENT', rooms: 2, budget: { amount: '60000', currency: 'USD' } });
    const head = await addMember(ctx, owner, 'HEAD_OF_SALES');
    expect((await head.patch('/organization', { industryPreset: 'GENERIC' })).status).toBe(403);

    const toGeneric = await owner.patch('/organization', { industryPreset: 'GENERIC' });
    expect(toGeneric.status).toBe(200);
    expect(toGeneric.body.industryPreset).toBe('GENERIC');
    expect((await owner.get(`/leads/${lead.id}`)).body).toMatchObject({ district: 'YUNUSOBOD', rooms: 2 });

    await owner.patch('/organization', { industryPreset: 'REAL_ESTATE' });
    expect((await owner.get(`/leads/${lead.id}`)).body).toMatchObject({
      district: 'YUNUSOBOD',
      propertyType: 'APARTMENT',
      rooms: 2,
      budget: { amount: '60000', currency: 'USD' },
    });
    const preset = await ctx.prisma.system.auditLog.findMany({
      where: { organizationId: owner.orgId, action: 'ORG_INDUSTRY_PRESET_CHANGED' },
    });
    expect(preset.map((r) => r.metadata)).toEqual(
      expect.arrayContaining([
        { from: 'REAL_ESTATE', to: 'GENERIC' },
        { from: 'GENERIC', to: 'REAL_ESTATE' },
      ]),
    );
    expect(preset).toHaveLength(2);
  });

  it('rule-based AI for GENERIC: no district/rooms questions, fields null, generic prompt version', async () => {
    const owner = await registerGeneric();
    const lead = await createLead(owner, { message: '2 xonali kvartira kerak, Yunusobod, 60 000$ gacha' });
    const res = await owner.post(`/leads/${lead.id}/ai/analysis`, {});
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ source: 'RULE_BASED', promptVersion: 'lead-analysis-generic@2' });
    const a = res.body.result;
    expect(a).toMatchObject({ district: null, propertyType: null, rooms: null, budget: { amount: 60000, currency: 'USD' } });
    expect(JSON.stringify(a.nextQuestions)).not.toMatch(/район|комнат|tuman|xona/i);

    const draft = await owner.post(`/leads/${lead.id}/ai/reply-draft`, { language: 'ru', tone: 'FORMAL' });
    expect(draft.status).toBe(200);
    expect(draft.body.promptVersion).toBe('reply-draft-generic@2');
    expect(draft.body.result.text).not.toMatch(/район|комнат|квартир/i);

    const apply = await owner.post(`/leads/${lead.id}/ai/apply-fields`, { insightId: res.body.insightId, fields: ['district', 'rooms'] });
    expect(apply.status).toBe(400);
  });

  it('REAL_ESTATE keeps the original prompts and extraction', async () => {
    const owner = await registerOrg(ctx);
    const lead = await createLead(owner);
    const res = await owner.post(`/leads/${lead.id}/ai/analysis`, {});
    expect(res.body).toMatchObject({ promptVersion: 'lead-analysis@2', result: { district: 'YUNUSOBOD', rooms: 2 } });
  });
});

describe('Custom lead fields (ADR-024, slice 2)', () => {
  it('CRUD by owner and head of sales; managers are forbidden; limit and key conflicts', async () => {
    const owner = await registerGeneric();
    const head = await addMember(ctx, owner, 'HEAD_OF_SALES');
    const manager = await addMember(ctx, owner, 'MANAGER');

    expect((await manager.post('/lead-fields', TIME_FIELD)).status).toBe(403);
    const created = await head.post('/lead-fields', SERVICE_FIELD);
    expect(created.status).toBe(201);
    expect(created.body).toEqual([expect.objectContaining({ key: 'service', required: true, showInCreate: true })]);
    expect((await owner.post('/lead-fields', { ...TIME_FIELD, key: 'Service' })).status).toBe(409);
    expect((await owner.post('/lead-fields', { key: 'bad key', label: { ru: 'X' }, type: 'text' })).status).toBe(400);
    expect((await owner.post('/lead-fields', { key: 'sel', label: { ru: 'X' }, type: 'single_select' })).status).toBe(400);

    const patched = await owner.patch('/lead-fields/service', { label: { ru: 'Услуга клиники' }, showInCreate: false });
    expect(patched.status).toBe(200);
    expect(patched.body[0]).toMatchObject({ label: { ru: 'Услуга клиники' }, showInCreate: false, type: 'single_select' });
    expect((await owner.patch('/lead-fields/service', { type: 'text' })).status).toBe(400);
    expect((await owner.patch('/lead-fields/nope', { required: true })).status).toBe(404);
    expect((await manager.get('/lead-fields')).body).toHaveLength(1);

    for (let i = 1; i < 8; i++) expect((await owner.post('/lead-fields', { key: `f${i}`, label: { ru: `F${i}` }, type: 'text' })).status).toBe(201);
    const ninth = await owner.post('/lead-fields', { key: 'f9', label: { ru: 'F9' }, type: 'text' });
    expect(ninth.status).toBe(422);
    expect(ninth.body.error.code).toBe('LEAD_FIELDS_LIMIT');

    expect((await manager.delete('/lead-fields/f1')).status).toBe(403);
    expect((await owner.delete('/lead-fields/f1')).status).toBe(204);
    expect((await owner.delete('/lead-fields/f1')).status).toBe(404);
    expect((await auditActions(owner.orgId)).filter((a) => a === 'LEAD_FIELDS_UPDATED')).toHaveLength(10);
  });

  it('validates attributes on create/update: wrong type, unknown key, required; returns them on read', async () => {
    const owner = await registerGeneric();
    await owner.post('/lead-fields', SERVICE_FIELD);
    await owner.post('/lead-fields', TIME_FIELD);
    await owner.post('/lead-fields', { key: 'visits', label: { ru: 'Визиты' }, type: 'number' });

    const base = { fullName: 'Анна', source: 'INSTAGRAM' };
    const missing = await owner.post('/leads', base);
    expect(missing.status).toBe(400);
    expect(missing.body.error.details).toEqual([expect.objectContaining({ path: 'attributes.service', code: 'required' })]);

    const wrong = await owner.post('/leads', { ...base, attributes: { service: 'surgery', visits: 'two' } });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.details.map((d: { path: string; code: string }) => `${d.path}:${d.code}`).sort()).toEqual([
      'attributes.service:invalid_value',
      'attributes.visits:invalid_value',
    ]);

    const unknown = await owner.post('/leads', { ...base, attributes: { service: 'implant', district: 'YUNUSOBOD' } });
    expect(unknown.status).toBe(400);
    expect(unknown.body.error.details).toEqual([expect.objectContaining({ path: 'attributes.district', code: 'unknown_field' })]);

    const ok = await owner.post('/leads', { ...base, attributes: { service: 'implant', preferredTime: 'после 18:00', visits: 1 } });
    expect(ok.status).toBe(201);
    expect(ok.body.attributes).toEqual({ service: 'implant', preferredTime: 'после 18:00', visits: 1 });

    const upd = await owner.patch(`/leads/${ok.body.id}`, { attributes: { preferredTime: null, visits: 2 } });
    expect(upd.status).toBe(200);
    expect(upd.body.attributes).toEqual({ service: 'implant', visits: 2 });
    expect((await owner.patch(`/leads/${ok.body.id}`, { attributes: { service: null } })).status).toBe(400);
    const activities = (await owner.get(`/leads/${ok.body.id}/activities`)).body as Array<{ type: string; payload: { fields?: string[] } }>;
    expect(activities.find((a) => a.type === 'FIELDS_UPDATED')?.payload.fields).toEqual(['attributes']);
  });

  it('removing a definition hides stored values; re-adding the key shows them again', async () => {
    const owner = await registerGeneric();
    await owner.post('/lead-fields', TIME_FIELD);
    const lead = (await owner.post('/leads', { fullName: 'Анна', source: 'PHONE', attributes: { preferredTime: 'утро' } })).body;
    await owner.delete('/lead-fields/preferredTime');
    expect((await owner.get(`/leads/${lead.id}`)).body.attributes).toEqual({});
    const stored = await ctx.prisma.system.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(stored.attributes).toEqual({ preferredTime: 'утро' });
    await owner.post('/lead-fields', TIME_FIELD);
    expect((await owner.get(`/leads/${lead.id}`)).body.attributes).toEqual({ preferredTime: 'утро' });
  });

  it('intake accepts attributes without enforcing required; rejects unknown keys', async () => {
    const owner = await registerGeneric();
    await owner.post('/lead-fields', SERVICE_FIELD);
    const key = (await owner.post('/api-keys', { name: 'Site' })).body.key as string;
    const intake = (body: object) => request(ctx.server).post('/api/v1/intake/leads').set('X-Api-Key', key).send(body);
    const noAttrs = await intake({ fullName: 'Web', source: 'WEBSITE' });
    expect(noAttrs.status).toBe(201);
    const withAttrs = await intake({ fullName: 'Web 2', source: 'WEBSITE', attributes: { service: 'cleaning' } });
    expect(withAttrs.status).toBe(201);
    expect((await owner.get(`/leads/${withAttrs.body.id}`)).body.attributes).toEqual({ service: 'cleaning' });
    expect((await intake({ fullName: 'Web 3', source: 'WEBSITE', attributes: { other: 1 } })).status).toBe(400);
  });

  it('CSV export keeps the fixed headers and appends one column per active custom field', async () => {
    const owner = await registerGeneric();
    await owner.post('/lead-fields', SERVICE_FIELD);
    await owner.post('/lead-fields', { key: 'deposit', label: { ru: 'Предоплата' }, type: 'money' });
    await owner.post('/leads', {
      fullName: 'Анна',
      source: 'PHONE',
      attributes: { service: 'implant', deposit: { amount: '500000', currency: 'UZS' } },
    });
    const res = await owner.get('/leads/export.csv');
    expect(res.status).toBe(200);
    const lines = res.text.replace(/^\uFEFF/, '').split('\r\n');
    expect(lines[0]).toMatch(/,possibleDuplicate,attr:service,attr:deposit$/);
    expect(lines[1]).toMatch(/,implant,500000 UZS$/);
  });

  it('tenant isolation: definitions of one organization never apply to another', async () => {
    const a = await registerGeneric('Clinic A');
    const b = await registerGeneric('Clinic B');
    await a.post('/lead-fields', SERVICE_FIELD);
    expect((await b.get('/lead-fields')).body).toEqual([]);
    const cross = await b.post('/leads', { fullName: 'X', source: 'PHONE', attributes: { service: 'implant' } });
    expect(cross.status).toBe(400);
    expect(cross.body.error.details[0]).toMatchObject({ path: 'attributes.service', code: 'unknown_field' });
    const leadA = (await a.post('/leads', { fullName: 'Y', source: 'PHONE', attributes: { service: 'implant' } })).body;
    expect((await b.patch(`/leads/${leadA.id}`, { attributes: {} })).status).toBe(404);
    expect((await b.patch('/lead-fields/service', { required: false })).status).toBe(404);
    expect((await b.delete('/lead-fields/service')).status).toBe(404);
    expect((await a.get('/lead-fields')).body).toHaveLength(1);
  });
});

describe('Status labels (ADR-024, slice 3)', () => {
  it('owner sets WON/LOST labels; codes stay; validation and audit', async () => {
    const owner = await registerGeneric();
    const head = await addMember(ctx, owner, 'HEAD_OF_SALES');
    const labels = { WON: { ru: 'Записался', uz: 'Yozildi' }, LOST: { ru: 'Не пришёл' } };
    expect((await head.patch('/organization', { statusLabels: labels })).status).toBe(403);
    const res = await owner.patch('/organization', { statusLabels: labels });
    expect(res.status).toBe(200);
    expect(res.body.statusLabels).toEqual(labels);
    expect((await head.get('/auth/me')).body.organization.statusLabels).toEqual(labels);
    expect((await owner.patch('/organization', { statusLabels: { NEW: { ru: 'X' } } })).status).toBe(400);
    expect((await owner.patch('/organization', { statusLabels: { WON: { ru: '' } } })).status).toBe(400);
    const settings = await ctx.prisma.system.auditLog.findMany({ where: { organizationId: owner.orgId, action: 'ORG_SETTINGS_UPDATED' } });
    expect(settings.map((r) => r.metadata)).toEqual([{ fields: ['statusLabels'] }]);

    const lead = await createLead(owner);
    await owner.post(`/leads/${lead.id}/first-contact`, { channel: 'CALL' });
    const won = await owner.post(`/leads/${lead.id}/status`, { status: 'WON' });
    expect(won.body.status).toBe('WON');
    expect((await owner.patch('/organization', { statusLabels: {} })).body.statusLabels).toEqual({});
  });
});
