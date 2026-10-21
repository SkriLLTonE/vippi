/**
 * FR-095 demo seed: synthetic organization "Demo Realty Toshkent (DEMO)".
 * All people, phones (+99800… — non-existent operator range) and requests are fictional.
 * Re-running recreates only the demo organization and its demo users; `--if-missing` seeds only when it is absent.
 */
import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import {
  buildLeadSearchText,
  DISTRICT_CODES,
  type ContactChannel,
  type LeadSource,
  type LeadStatus,
  type LostReason,
  type PropertyType,
} from '@vippi/shared';
import { computeDueAt, historicalSlaState } from '../../src/modules/sla/domain/compute-due-at.js';

export const DEMO_ORG_NAME = 'Demo Realty Toshkent (DEMO)';
export const DEMO_EMAIL_DOMAIN = 'demo-realty.example';
const LEAD_COUNT = 180;
const DAYS = 30;

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20261021);
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)] as T;
function weighted<T>(items: ReadonlyArray<[T, number]>): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let r = rnd() * total;
  for (const [v, w] of items) {
    r -= w;
    if (r <= 0) return v;
  }
  return items[items.length - 1]![0];
}

const FIRST_NAMES = ['Aziz', 'Dilnoza', 'Jasur', 'Malika', 'Sardor', 'Nodira', 'Bekzod', 'Gulnora', 'Timur', 'Shahzoda', 'Rustam', 'Kamola', 'Anvar', 'Zarina', 'Otabek', 'Madina', 'Ирина', 'Сергей', 'Ольга', 'Алексей'];
const LAST_INITIALS = ['A.', 'B.', 'K.', 'M.', 'N.', 'R.', 'S.', 'T.', 'U.', 'Y.'];

const DISTRICT_RU: Record<string, string> = {
  YUNUSOBOD: 'Юнусабаде', CHILONZOR: 'Чиланзаре', MIRZO_ULUGBEK: 'Мирзо-Улугбеке', YAKKASAROY: 'Яккасарае',
  SERGELI: 'Сергели', OLMAZOR: 'Алмазаре', MIROBOD: 'Мирабаде', YASHNOBOD: 'Яшнабаде',
  SHAYXONTOHUR: 'Шайхантахуре', UCHTEPA: 'Учтепе', BEKTEMIR: 'Бектемире', YANGIHAYOT: 'Янгихаёте',
};
const DISTRICT_UZ: Record<string, string> = {
  YUNUSOBOD: 'Yunusobod', CHILONZOR: 'Chilonzor', MIRZO_ULUGBEK: "Mirzo Ulug'bek", YAKKASAROY: 'Yakkasaroy',
  SERGELI: 'Sergeli', OLMAZOR: 'Olmazor', MIROBOD: 'Mirobod', YASHNOBOD: 'Yashnobod',
  SHAYXONTOHUR: 'Shayxontohur', UCHTEPA: 'Uchtepa', BEKTEMIR: 'Bektemir', YANGIHAYOT: 'Yangihayot',
};

interface GeneratedMessage {
  text: string;
  district: string | null;
  rooms: number | null;
  propertyType: PropertyType | null;
}

function message(): GeneratedMessage {
  const district = rnd() < 0.7 ? pick(DISTRICT_CODES) : null;
  const rooms = rnd() < 0.7 ? 1 + Math.floor(rnd() * 4) : null;
  const usd = 30 + Math.floor(rnd() * 120);
  const budgetText = rnd() < 0.5 ? (rnd() < 0.6 ? `${usd} 000$` : `${usd * 12} mln so'm`) : '';
  const lang = weighted<'ru' | 'uz' | 'mixed'>([['ru', 4], ['uz', 4], ['mixed', 2]]);
  const urgent = rnd() < 0.2;
  let text: string;
  if (lang === 'ru') {
    text = [
      urgent ? 'Срочно!' : 'Здравствуйте!',
      rooms ? `Ищу ${rooms}-комнатную квартиру` : 'Интересует квартира',
      district ? `в ${DISTRICT_RU[district]}` : '',
      budgetText ? `, бюджет до ${budgetText}` : '',
      rnd() < 0.3 ? '. Можно в новостройке.' : '.',
    ].join(' ');
  } else if (lang === 'uz') {
    text = [
      urgent ? 'Shoshilinch!' : 'Assalomu alaykum!',
      district ? `${DISTRICT_UZ[district]} tumanida` : '',
      rooms ? `${rooms} xonali kvartira kerak` : 'kvartira kerak',
      budgetText ? `, ${budgetText} gacha` : '',
      rnd() < 0.3 ? ". Narxi qancha bo'ladi?" : '.',
    ].join(' ');
  } else {
    text = [
      'Salom, нужна',
      rooms ? `${rooms} xonali` : '',
      'kvartira',
      district ? `${DISTRICT_UZ[district]}` : '',
      budgetText ? `до ${budgetText}` : '',
      '. Narxi qancha?',
    ].join(' ');
  }
  const propertyType: PropertyType | null = rnd() < 0.9 ? 'APARTMENT' : pick(['HOUSE', 'COMMERCIAL', 'LAND'] as const);
  return { text: text.replace(/\s+([,.])/g, '$1').replace(/\s+/g, ' ').trim(), district, rooms, propertyType };
}

const SOURCES: ReadonlyArray<[LeadSource, number]> = [
  ['INSTAGRAM', 30], ['TELEGRAM', 25], ['OLX', 15], ['WEBSITE', 12], ['PHONE', 8], ['REFERRAL', 5], ['WALK_IN', 3], ['OTHER', 2],
];
const CHANNELS: ReadonlyArray<[ContactChannel, number]> = [
  ['CALL', 4], ['TELEGRAM', 3], ['WHATSAPP', 1], ['INSTAGRAM', 1], ['SMS', 1],
];

/** Response delay profile per assignee slot (minutes): fast, average, slow, unassigned. */
const DELAY_PROFILES: Array<() => number> = [
  () => 2 + rnd() * 12,
  () => (rnd() < 0.6 ? 4 + rnd() * 10 : 16 + rnd() * 40),
  () => (rnd() < 0.3 ? 8 + rnd() * 7 : 20 + rnd() * 160),
  () => 30 + rnd() * 300,
];

async function main(): Promise<void> {
  const password = process.env.DEMO_SEED_PASSWORD;
  if (!password || password.length < 10) {
    throw new Error('DEMO_SEED_PASSWORD (min 10 chars) is required to seed demo users');
  }
  const prisma = new PrismaClient();
  try {
    // `--if-missing` (used on container start, ADR-022): keep an existing demo org so wake-ups don't reset it.
    if (process.argv.includes('--if-missing')) {
      const existing = await prisma.organization.findFirst({ where: { isDemo: true, name: DEMO_ORG_NAME }, select: { id: true } });
      if (existing) {
        console.log(`Demo organization "${DEMO_ORG_NAME}" already exists — skipped (run without --if-missing to recreate).`);
        return;
      }
    }
    const hash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 });
    const now = new Date();
    const users = [
      { key: 'owner', email: `owner@${DEMO_EMAIL_DOMAIN}`, fullName: 'Shoxrux Owner (DEMO)', role: 'OWNER' as const },
      { key: 'head', email: `head@${DEMO_EMAIL_DOMAIN}`, fullName: 'Nilufar Head (DEMO)', role: 'HEAD_OF_SALES' as const },
      { key: 'm1', email: `manager1@${DEMO_EMAIL_DOMAIN}`, fullName: 'Aziza Tez (DEMO)', role: 'MANAGER' as const },
      { key: 'm2', email: `manager2@${DEMO_EMAIL_DOMAIN}`, fullName: 'Bobur Orta (DEMO)', role: 'MANAGER' as const },
      { key: 'm3', email: `manager3@${DEMO_EMAIL_DOMAIN}`, fullName: 'Davron Sekin (DEMO)', role: 'MANAGER' as const },
    ];

    await prisma.$transaction(
      async (tx) => {
        await tx.organization.deleteMany({ where: { isDemo: true, name: DEMO_ORG_NAME } });
        await tx.user.deleteMany({ where: { email: { in: users.map((u) => u.email) } } });

        const org = await tx.organization.create({
          data: { name: DEMO_ORG_NAME, isDemo: true, defaultLocale: 'ru', aiExternalProcessingEnabled: false },
        });
        const ids: Record<string, string> = {};
        for (const u of users) {
          const created = await tx.user.create({
            data: { email: u.email, fullName: u.fullName, passwordHash: hash, locale: u.key === 'm2' ? 'uz' : 'ru' },
          });
          ids[u.key] = created.id;
          await tx.membership.create({ data: { organizationId: org.id, userId: created.id, role: u.role } });
        }
        const policy = await tx.slaPolicy.create({ data: { organizationId: org.id, updatedById: ids.owner } });
        const managers = [ids.m1!, ids.m2!, ids.m3!];

        // Arrival times: business-hours biased, sorted ascending for sequential numbers.
        const times: Date[] = [];
        for (let i = 0; i < LEAD_COUNT - 6; i++) {
          const day = Math.floor(rnd() * DAYS);
          const hourTashkent = weighted<number>([[9, 2], [10, 4], [11, 5], [12, 4], [13, 3], [14, 4], [15, 4], [16, 4], [17, 3], [18, 3], [19, 2], [20, 2], [21, 1], [22, 1], [7, 1], [0, 1]]);
          const t = new Date(now.getTime() - day * 86_400_000);
          const base = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), hourTashkent - 5, Math.floor(rnd() * 60));
          if (base < now.getTime() - 40 * 60_000) times.push(new Date(base));
        }
        // Fresh leads for the live demo: two ticking timers and four already overdue.
        for (const minutesAgo of [3, 8, 25, 47, 95, 180]) times.push(new Date(now.getTime() - minutesAgo * 60_000));
        times.sort((a, b) => a.getTime() - b.getTime());

        const leads: Prisma.LeadCreateManyInput[] = [];
        const activities: Prisma.LeadActivityCreateManyInput[] = [];
        const notifications: Prisma.NotificationCreateManyInput[] = [];
        const phones: Array<{ phone: string; id: string; at: Date }> = [];

        times.forEach((receivedAt, idx) => {
          const id = randomUUID();
          const source = weighted(SOURCES);
          const msg = message();
          const fresh = now.getTime() - receivedAt.getTime() < 4 * 3_600_000;
          const slot = rnd() < 0.85 ? Math.floor(rnd() * 3) : 3;
          const assigneeId = slot < 3 ? managers[slot]! : null;
          const dueAt = computeDueAt(receivedAt, policy);

          let phone = `+99800${String(1_000_000 + Math.floor(rnd() * 8_999_999))}`;
          let duplicateOf: string | null = null;
          const prev = phones.find((p) => receivedAt.getTime() - p.at.getTime() < 30 * 86_400_000);
          if (prev && rnd() < 0.04) {
            phone = prev.phone;
            duplicateOf = prev.id;
          }
          phones.push({ phone, id, at: receivedAt });

          const spam = !fresh && rnd() < 0.04;
          const answered = !spam && (fresh ? false : rnd() < (slot === 3 ? 0.6 : 0.93));
          const firstResponseAt = answered
            ? new Date(Math.min(receivedAt.getTime() + DELAY_PROFILES[slot]!() * 60_000, now.getTime() - 60_000))
            : null;
          const sla = historicalSlaState(dueAt, firstResponseAt, now);
          let status: LeadStatus = answered ? 'CONTACTED' : 'NEW';
          let lostReason: LostReason | null = null;
          let closedAt: Date | null = null;
          const ageDays = (now.getTime() - receivedAt.getTime()) / 86_400_000;
          if (spam) {
            status = 'LOST';
            lostReason = rnd() < 0.5 ? 'SPAM' : 'DUPLICATE';
            closedAt = new Date(receivedAt.getTime() + 10 * 60_000);
          } else if (answered && ageDays > 1) {
            status = weighted<LeadStatus>([['CONTACTED', 3], ['QUALIFIED', 2], ['WON', ageDays > 5 ? 1.3 : 0.3], ['LOST', ageDays > 3 ? 2.5 : 0.8]]);
            if (status === 'LOST') lostReason = weighted<LostReason>([['NO_ANSWER', 3], ['TOO_EXPENSIVE', 3], ['BOUGHT_ELSEWHERE', 2], ['NOT_INTERESTED', 2], ['OTHER', 1]]);
            if (status === 'WON' || status === 'LOST') closedAt = new Date(receivedAt.getTime() + (1 + rnd() * Math.min(ageDays - 0.5, 10)) * 86_400_000);
          }
          const slaState = spam ? 'EXEMPT' : sla.slaState;
          const usd = /(\d+) 000\$/.exec(msg.text);
          const uzs = /(\d+) mln/.exec(msg.text);
          const budget = usd
            ? { amount: BigInt(Number(usd[1]) * 1000), currency: 'USD' as const }
            : uzs && rnd() < 0.5
              ? { amount: BigInt(Number(uzs[1]) * 1_000_000), currency: 'UZS' as const }
              : null;
          const fullName = rnd() < 0.9 ? `${pick(FIRST_NAMES)} ${pick(LAST_INITIALS)}` : null;
          const filled = rnd() < 0.5; // half of the leads already have structured fields filled in

          leads.push({
            id,
            organizationId: org.id,
            number: idx + 1,
            fullName,
            phone,
            source,
            sourceDetail: source === 'WEBSITE' ? 'landing (DEMO)' : null,
            message: msg.text,
            budgetAmount: filled ? (budget?.amount ?? null) : null,
            budgetCurrency: filled ? (budget?.currency ?? null) : null,
            district: filled ? msg.district : null,
            propertyType: filled ? msg.propertyType : null,
            rooms: filled ? msg.rooms : null,
            status,
            lostReason,
            assigneeId,
            createdVia: 'SEED',
            receivedAt,
            firstResponseDueAt: dueAt,
            firstResponseAt,
            firstResponseById: firstResponseAt ? (assigneeId ?? ids.head!) : null,
            firstResponseChannel: firstResponseAt ? weighted(CHANNELS) : null,
            slaState,
            slaBreachedAt: slaState === 'BREACHED' ? dueAt : null,
            possibleDuplicateOfId: duplicateOf,
            closedAt,
            searchText: buildLeadSearchText({ fullName, phone, message: msg.text }),
            createdAt: receivedAt,
          });

          const act = (type: Prisma.LeadActivityCreateManyInput['type'], at: Date, actorUserId: string | null, payload?: object, body?: string) =>
            activities.push({ organizationId: org.id, leadId: id, type, actorUserId, createdAt: at, payload: payload as Prisma.InputJsonValue, body: body ?? null });
          act('CREATED', receivedAt, null, { via: 'SEED' });
          if (assigneeId) act('ASSIGNED', new Date(receivedAt.getTime() + 30_000), ids.head!, { from: null, to: assigneeId });
          if (slaState === 'BREACHED') act('SLA_BREACHED', dueAt, null, { dueAt: dueAt.toISOString() });
          if (firstResponseAt) {
            act('FIRST_CONTACT', firstResponseAt, assigneeId ?? ids.head!, { channel: leads[leads.length - 1]!.firstResponseChannel, slaState, viaAiDraft: false });
            if (rnd() < 0.25) act('COMMENT', new Date(firstResponseAt.getTime() + 60_000), assigneeId ?? ids.head!, undefined, pick(['Перезвонить завтра', 'Mijoz ertaga qayta qo\'ng\'iroq qilishni so\'radi', 'Отправил подборку из 3 вариантов', 'Показ назначен на субботу']));
          }
          if (status !== 'NEW' && status !== 'CONTACTED') {
            act('STATUS_CHANGED', closedAt ?? new Date((firstResponseAt ?? receivedAt).getTime() + 3_600_000), assigneeId ?? ids.head!, {
              from: spam ? 'NEW' : 'CONTACTED',
              to: status,
              ...(lostReason ? { lostReason } : {}),
            });
          }
          if (slaState === 'BREACHED' && !firstResponseAt && now.getTime() - dueAt.getTime() < 3 * 86_400_000) {
            for (const userId of new Set([assigneeId, ids.head].filter((x): x is string => !!x))) {
              notifications.push({
                organizationId: org.id,
                userId,
                type: 'SLA_BREACHED',
                leadId: id,
                payload: { leadNumber: idx + 1, overdueMinutes: Math.floor((now.getTime() - dueAt.getTime()) / 60_000) },
                dedupeKey: `SLA_BREACHED:${id}:${userId}`,
                createdAt: dueAt,
              });
            }
          }
        });

        await tx.lead.createMany({ data: leads });
        await tx.leadActivity.createMany({ data: activities });
        await tx.notification.createMany({ data: notifications, skipDuplicates: true });
        await tx.organization.update({ where: { id: org.id }, data: { nextLeadNumber: leads.length + 1 } });
        await tx.auditLog.create({
          data: { organizationId: org.id, action: 'ORG_REGISTERED', actorType: 'SYSTEM', metadata: { seed: 'demo', leads: leads.length } },
        });

        console.log(`Demo organization "${DEMO_ORG_NAME}" created with ${leads.length} synthetic leads.`);
        console.log('Demo accounts (password = DEMO_SEED_PASSWORD from .env):');
        for (const u of users) console.log(`  ${u.role.padEnd(13)} ${u.email}`);
      },
      { timeout: 120_000 },
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
