// NFR-001 load data: two SYNTHETIC organizations (isDemo=true, names say so) with 10 000 and 50 000 leads.
// Run against a dedicated database, never the demo one:
//   DATABASE_URL=postgresql://…/vippi_load LOAD_API=http://localhost:3100 LOAD_ORIGIN=http://localhost:4173 node scripts/load/seed.mjs
import { PrismaClient } from '@prisma/client';
import { DISTRICT_CODES, buildLeadSearchText } from '@vippi/shared';
import { LOAD_API as API, LOAD_ORGS, LOAD_ORIGIN as ORIGIN, LOAD_PASSWORD, loadEmail } from './config.mjs';

if (!/load/.test(process.env.DATABASE_URL ?? '')) {
  throw new Error('DATABASE_URL must point to a dedicated load-test database (name containing "load")');
}

const SOURCES = ['INSTAGRAM', 'TELEGRAM', 'WEBSITE', 'OLX', 'PHONE', 'WALK_IN', 'REFERRAL', 'OTHER'];
const CHANNELS = ['CALL', 'TELEGRAM', 'INSTAGRAM', 'WHATSAPP'];
const MESSAGES = [
  'Ищу 2-комнатную квартиру, бюджет до 60 000 $. Когда можно посмотреть?',
  "Chilonzorda 3 xonali kvartira kerak, narxi qancha?",
  'Нужен дом с участком, рассмотрю варианты до 150 000 $.',
  'Ofis kerak, 100 m2 atrofida, markazda.',
  'Просто интересуюсь ценами в новостройках.',
];

// Deterministic PRNG so repeated seeds produce the same data set.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function api(path, init = {}) {
  const res = await fetch(`${API}/api/v1${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', origin: ORIGIN, ...(init.headers ?? {}) },
  });
  return res;
}

async function ensureOrg(key) {
  const email = loadEmail(key);
  let res = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password: LOAD_PASSWORD }) });
  if (res.status === 401) {
    res = await api('/auth/register-organization', {
      method: 'POST',
      body: JSON.stringify({
        organizationName: `Нагрузочный тест — синтетические данные ${key}`,
        fullName: `Load Owner ${key}`,
        email,
        password: LOAD_PASSWORD,
        locale: 'ru',
      }),
    });
  }
  if (!res.ok) throw new Error(`auth for ${email} failed: ${res.status} ${await res.text()}`);
  const me = await res.json();
  return { orgId: me.organization.id, userId: me.user.id };
}

const prisma = new PrismaClient();
const now = Date.now();
const DAY = 86_400_000;

for (const spec of LOAD_ORGS) {
  const { orgId, userId } = await ensureOrg(spec.key);
  await prisma.organization.update({ where: { id: orgId }, data: { isDemo: true } });
  const existing = await prisma.lead.count({ where: { organizationId: orgId } });
  if (existing >= spec.leads) {
    console.log(`${spec.key}: already has ${existing} leads, skipping`);
    continue;
  }
  await prisma.lead.deleteMany({ where: { organizationId: orgId } });
  const rand = rng(spec.leads);
  const started = Date.now();
  const BATCH = 2_000;
  for (let offset = 0; offset < spec.leads; offset += BATCH) {
    const rows = [];
    for (let i = offset; i < Math.min(spec.leads, offset + BATCH); i++) {
      const receivedAt = new Date(now - Math.floor(rand() * 60 * DAY));
      const due = new Date(receivedAt.getTime() + 15 * 60_000);
      const fullName = `Синтетический клиент ${i + 1}`;
      const phone = `+99890${String(1_000_000 + i).slice(-7)}`;
      const message = MESSAGES[i % MESSAGES.length];
      const responded = rand() < 0.7;
      const respondedAt = responded ? new Date(receivedAt.getTime() + Math.floor(1 + rand() * 40) * 60_000) : null;
      const breached = responded ? respondedAt > due : due.getTime() < now;
      const closedRoll = rand();
      const status = !responded ? 'NEW' : closedRoll < 0.1 ? 'WON' : closedRoll < 0.25 ? 'LOST' : closedRoll < 0.5 ? 'QUALIFIED' : 'CONTACTED';
      rows.push({
        organizationId: orgId,
        number: i + 1,
        fullName,
        phone,
        source: SOURCES[i % SOURCES.length],
        message,
        budgetAmount: i % 3 === 0 ? BigInt(40_000 + (i % 50) * 1_000) : null,
        budgetCurrency: i % 3 === 0 ? 'USD' : null,
        district: DISTRICT_CODES[i % DISTRICT_CODES.length],
        status,
        lostReason: status === 'LOST' ? 'TOO_EXPENSIVE' : null,
        assigneeId: rand() < 0.8 ? userId : null,
        createdById: userId,
        createdVia: 'SEED',
        receivedAt,
        firstResponseDueAt: due,
        firstResponseAt: respondedAt,
        firstResponseById: responded ? userId : null,
        firstResponseChannel: responded ? CHANNELS[i % CHANNELS.length] : null,
        slaState: responded ? (breached ? 'BREACHED' : 'MET') : breached ? 'BREACHED' : 'PENDING',
        slaBreachedAt: breached ? due : null,
        closedAt: status === 'WON' || status === 'LOST' ? new Date(respondedAt.getTime() + DAY) : null,
        searchText: buildLeadSearchText({ fullName, phone, message }),
      });
    }
    await prisma.lead.createMany({ data: rows });
  }
  await prisma.organization.update({ where: { id: orgId }, data: { nextLeadNumber: spec.leads + 1 } });
  await prisma.$executeRawUnsafe('ANALYZE "Lead"');
  console.log(`${spec.key}: inserted ${spec.leads} leads in ${((Date.now() - started) / 1000).toFixed(1)} s`);
}
await prisma.$disconnect();
