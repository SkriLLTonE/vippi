import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { APP_CONFIG, type AppConfig } from '../../src/config/env.js';
import { addMember, createLead, createTestApp, registerOrg, resetDb, type Client, type TestContext } from './helpers.js';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(async () => ctx.close());
beforeEach(async () => resetDb(ctx));

const NOW = '2026-10-20T07:00:00.000Z'; // 12:00 Tashkent

function upload(client: Client, path: string, content: Buffer | string, filename = 'leads.csv') {
  return client.agent
    .post(`/api/v1${path}`)
    .set('Origin', 'http://localhost:8080')
    .attach('file', Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8'), {
      filename,
      contentType: 'text/csv',
    });
}

const CSV = [
  'name;phone;source;message;budgetAmount;budgetCurrency;district;propertyType;rooms;assigneeEmail;receivedAt;firstResponseAt;externalId',
  'Ali;+998 00 111 22 33;insta;2 xonali;60000;USD;Юнусабад;APARTMENT;2;;2026-10-19 10:00;2026-10-19 10:40;ext-1',
  'Vali;+998 00 111 22 44;telegram;;;;;;;;2026-10-19 10:00;2026-10-19 10:05;ext-2',
  'Bad;12;nowhere;;;;;;;;;;ext-3',
  'Dup;+998 00 111 22 55;OLX;;;;;;;;;;ext-1',
  'Fresh;+998 00 111 22 66;WEBSITE;;;;;;;;2026-10-20 11:55;;',
].join('\r\n');

describe('CSV import (FR-060, FR-061)', () => {
  it('downloads the template with BOM and the FR-060 headers', async () => {
    const owner = await registerOrg(ctx);
    const res = await owner.get('/leads/import/template').buffer(true).parse((r, cb) => {
      let data = '';
      r.on('data', (c: Buffer) => (data += c.toString('utf8')));
      r.on('end', () => cb(null, data));
    });
    expect(res.status).toBe(200);
    expect(res.body.startsWith('\uFEFFname,phone,source,message,budgetAmount')).toBe(true);
  });

  it('previews and imports valid rows with historical SLA, no notifications (AC-054…AC-056)', async () => {
    ctx.clock.set(NOW);
    const owner = await registerOrg(ctx);
    const preview = await upload(owner, '/leads/import/preview', `\uFEFF${CSV}`);
    expect(preview.status).toBe(200);
    expect(preview.body).toMatchObject({ totalRows: 5, validRows: 3, invalidRows: 1, duplicateRows: 1 });
    expect(preview.body.errors).toEqual(
      expect.arrayContaining([
        { row: 4, column: 'phone', code: 'invalid_phone' },
        { row: 4, column: 'source', code: 'invalid_source' },
      ]),
    );
    expect(preview.body.sample[0]).toMatchObject({ source: 'INSTAGRAM', district: 'YUNUSOBOD', phone: '+998001112233' });

    const imp = await upload(owner, '/leads/import', CSV);
    expect(imp.status).toBe(200);
    expect(imp.body).toMatchObject({ imported: 3, skipped: 2 });

    const list = (await owner.get('/leads?sort=receivedAt')).body;
    expect(list.total).toBe(3);
    const byName = Object.fromEntries(list.items.map((i: { fullName: string }) => [i.fullName, i]));
    expect(byName.Ali).toMatchObject({ slaState: 'BREACHED', status: 'CONTACTED' });
    expect(byName.Vali).toMatchObject({ slaState: 'MET', status: 'CONTACTED' });
    expect(byName.Fresh).toMatchObject({ slaState: 'PENDING', status: 'NEW' });
    expect((await owner.get('/notifications/unread-count')).body.count).toBe(0);
    const audit = (await owner.get('/audit-logs?action=CSV_IMPORTED')).body;
    expect(audit.items[0].metadata).toMatchObject({ imported: 3, skipped: 2 });

    const again = await upload(owner, '/leads/import', CSV);
    expect(again.body.imported).toBe(1); // only "Fresh" (no externalId) is new again
  });

  it('rejects non-UTF-8 files (AC-057) and missing headers', async () => {
    const owner = await registerOrg(ctx);
    const cp1251 = Buffer.from([0x6e, 0x61, 0x6d, 0x65, 0x2c, 0x73, 0x6f, 0x75, 0x72, 0x63, 0x65, 0x0d, 0x0a, 0xc8, 0xec, 0xff, 0x2c, 0x4f]);
    const bad = await upload(owner, '/leads/import', cp1251);
    expect(bad.status).toBe(415);
    expect(bad.body.error.code).toBe('UNSUPPORTED_FILE');
    const noHeaders = await upload(owner, '/leads/import', 'foo,bar\r\n1,2');
    expect(noHeaders.status).toBe(400);
    expect(noHeaders.body.error.code).toBe('CSV_INVALID');
    const notCsv = await upload(owner, '/leads/import', 'x', 'leads.xlsx');
    expect(notCsv.status).toBe(415);
  });

  it('rejects files larger than 5 MB with 413', async () => {
    const owner = await registerOrg(ctx);
    const big = Buffer.alloc(5 * 1024 * 1024 + 10, 'a');
    const res = await upload(owner, '/leads/import', big);
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('managers cannot import', async () => {
    const owner = await registerOrg(ctx);
    const m = await addMember(ctx, owner, 'MANAGER');
    expect((await upload(m, '/leads/import', CSV)).status).toBe(403);
  });
});

function text(res: request.Response): string {
  return typeof res.body === 'string' ? res.body : (res.text ?? '');
}

describe('CSV export (FR-064, AC-070…AC-072)', () => {
  it('exports filtered leads with BOM, Tashkent dates, formula escaping and audit', async () => {
    ctx.clock.set(NOW);
    const owner = await registerOrg(ctx);
    await createLead(owner, { fullName: '=HYPERLINK("x")', source: 'INSTAGRAM' });
    await createLead(owner, { fullName: 'Other', source: 'OLX', phone: '+998003333333' });
    const res = await owner.get('/leads/export.csv?source=INSTAGRAM');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="leads-20261020-1200\.csv"/);
    const body = text(res);
    expect(body.charCodeAt(0)).toBe(0xfeff);
    const lines = body.slice(1).split('\r\n').filter(Boolean);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe(
      'number,receivedAt,name,phone,source,sourceDetail,message,budgetAmount,budgetCurrency,district,propertyType,rooms,status,lostReason,slaState,firstResponseDueAt,firstResponseAt,firstResponseChannel,assigneeEmail,assigneeName,createdVia,externalId,possibleDuplicate',
    );
    expect(lines[1]).toContain('20.10.2026 12:00');
    expect(lines[1]).toContain(`"'=HYPERLINK(""x"")"`);
    const audit = (await owner.get('/audit-logs?action=LEADS_EXPORTED')).body;
    expect(audit.items[0].metadata).toMatchObject({ rows: 1, hasSearch: false, filters: { source: ['INSTAGRAM'] } });
  });

  it('manager export contains only own and unassigned leads', async () => {
    const owner = await registerOrg(ctx);
    const m1 = await addMember(ctx, owner, 'MANAGER', 'Manager One');
    const m2 = await addMember(ctx, owner, 'MANAGER', 'Manager Two');
    await createLead(owner, { fullName: 'Unassigned' });
    await createLead(owner, { fullName: 'OfM2', assigneeId: m2.userId, phone: '+998004444444' });
    await createLead(m1, { fullName: 'OfM1', phone: '+998005555555' });
    const body = text(await m1.get('/leads/export.csv'));
    expect(body).toContain('Unassigned');
    expect(body).toContain('OfM1');
    expect(body).not.toContain('OfM2');
  });

  it('returns 422 EXPORT_TOO_LARGE above EXPORT_MAX_ROWS', async () => {
    const owner = await registerOrg(ctx);
    const cfg = ctx.app.get<AppConfig>(APP_CONFIG);
    const prev = cfg.EXPORT_MAX_ROWS;
    cfg.EXPORT_MAX_ROWS = 1;
    try {
      await createLead(owner);
      await createLead(owner, { phone: '+998006666666' });
      const res = await owner.get('/leads/export.csv');
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('EXPORT_TOO_LARGE');
    } finally {
      cfg.EXPORT_MAX_ROWS = prev;
    }
  });
});

describe('Intake API (FR-062, FR-063, AC-058…AC-060)', () => {
  async function createKey(owner: Client) {
    const r = await owner.post('/api-keys', { name: 'Website' });
    expect(r.status).toBe(201);
    expect(r.body.key).toMatch(/^vpk_/);
    return r.body as { id: string; key: string; prefix: string };
  }

  it('creates leads by API key, idempotent by externalId; no cookie/origin needed', async () => {
    const owner = await registerOrg(ctx);
    const { key, prefix } = await createKey(owner);
    const list = (await owner.get('/api-keys')).body;
    expect(list[0].prefix).toBe(prefix);
    expect(JSON.stringify(list)).not.toContain(key);

    const body = { fullName: 'Web Lead', phone: '+99800 123 45 67', source: 'WEBSITE', externalId: 'form-1' };
    const r1 = await request(ctx.server).post('/api/v1/intake/leads').set('X-Api-Key', key).send(body);
    expect(r1.status).toBe(201);
    expect(r1.body).toMatchObject({ number: 1, duplicate: false });
    const r2 = await request(ctx.server).post('/api/v1/intake/leads').set('X-Api-Key', key).send(body);
    expect(r2.status).toBe(200);
    expect(r2.body).toMatchObject({ id: r1.body.id, duplicate: true });
    const dto = (await owner.get(`/leads/${r1.body.id}`)).body;
    expect(dto.createdVia).toBe('API');

    const invalid = await request(ctx.server).post('/api/v1/intake/leads').set('X-Api-Key', key).send({ source: 'X' });
    expect(invalid.status).toBe(400);
  });

  it('rejects unknown and revoked keys with 401; limits 5 active keys', async () => {
    const owner = await registerOrg(ctx);
    const { id, key } = await createKey(owner);
    const body = { fullName: 'X', source: 'WEBSITE' };
    expect((await request(ctx.server).post('/api/v1/intake/leads').set('X-Api-Key', 'vpk_nope').send(body)).status).toBe(401);
    expect((await owner.post(`/api-keys/${id}/revoke`)).status).toBeLessThan(300);
    const revoked = await request(ctx.server).post('/api/v1/intake/leads').set('X-Api-Key', key).send(body);
    expect(revoked.status).toBe(401);
    expect(revoked.body.error.code).toBe('INVALID_API_KEY');
    for (let i = 0; i < 5; i++) await createKey(owner);
    const sixth = await owner.post('/api-keys', { name: 'Sixth' });
    expect(sixth.status).toBe(422);
    expect(sixth.body.error.code).toBe('API_KEY_LIMIT');
  });

  it('rate limits intake per key (61st request → 429)', async () => {
    const owner = await registerOrg(ctx);
    const { key } = await createKey(owner);
    let last = 0;
    for (let i = 0; i < 61; i++) {
      const r = await request(ctx.server)
        .post('/api/v1/intake/leads')
        .set('X-Api-Key', key)
        .send({ fullName: `L${i}`, source: 'WEBSITE', externalId: `e-${i}` });
      last = r.status;
    }
    expect(last).toBe(429);
  });
});
