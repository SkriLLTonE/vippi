import { describe, expect, it } from 'vitest';
import { assertTenantScoped, TenantGuardError } from '../../src/common/prisma/tenant-guard.js';
import {
  budgetAppearsInText,
  detectLanguage,
  extractBudget,
  extractDistrict,
  extractPropertyType,
  extractRooms,
  ruleBasedAnalysis,
} from '../../src/modules/ai/fallback/rules.js';
import { templateReply, templateWeeklySummary } from '../../src/modules/ai/fallback/templates.js';
import { checkReplyDraft, checkWeeklySummary } from '../../src/modules/ai/post-validation/checks.js';
import { csvCell, csvLine } from '../../src/modules/leads/domain/csv-export.js';
import {
  parseCsvDate,
  parseLeadsCsv,
  resolveDistrict,
  resolveSource,
} from '../../src/modules/leads/domain/csv-import.js';
import { computeDueAt, historicalSlaState } from '../../src/modules/sla/domain/compute-due-at.js';

const policy = (o: Partial<Parameters<typeof computeDueAt>[1]> = {}) => ({
  firstResponseMinutes: 15,
  businessHoursEnabled: false,
  workdays: [1, 2, 3, 4, 5],
  workStart: '09:00',
  workEnd: '18:00',
  ...o,
});

describe('computeDueAt (FR-030, FR-031)', () => {
  it('24/7: adds minutes', () => {
    expect(computeDueAt(new Date('2026-10-19T05:00:00Z'), policy()).toISOString()).toBe(
      '2026-10-19T05:15:00.000Z',
    );
  });
  it('business hours: inside the window', () => {
    // Mon 10:00 Tashkent → 10:15
    expect(
      computeDueAt(new Date('2026-10-19T05:00:00Z'), policy({ businessHoursEnabled: true })).toISOString(),
    ).toBe('2026-10-19T05:15:00.000Z');
  });
  it('business hours: spills over the end of day into next workday', () => {
    // Mon 17:55 Tashkent → Tue 09:10
    expect(
      computeDueAt(new Date('2026-10-19T12:55:00Z'), policy({ businessHoursEnabled: true })).toISOString(),
    ).toBe('2026-10-20T04:10:00.000Z');
  });
  it('business hours: Friday night → Monday 09:15', () => {
    expect(
      computeDueAt(new Date('2026-10-23T17:00:00Z'), policy({ businessHoursEnabled: true })).toISOString(),
    ).toBe('2026-10-26T04:15:00.000Z');
  });
  it('historical SLA state (AC-056)', () => {
    const due = new Date('2026-10-19T05:15:00Z');
    const now = new Date('2026-10-20T00:00:00Z');
    expect(historicalSlaState(due, new Date('2026-10-19T05:40:00Z'), now).slaState).toBe('BREACHED');
    expect(historicalSlaState(due, new Date('2026-10-19T05:05:00Z'), now).slaState).toBe('MET');
    expect(historicalSlaState(due, null, now)).toEqual({ slaState: 'BREACHED', slaBreachedAt: due });
    expect(historicalSlaState(due, null, new Date('2026-10-19T05:10:00Z')).slaState).toBe('PENDING');
  });
});

describe('CSV import parsing', () => {
  const now = new Date('2026-10-20T07:00:00Z');
  it('detects ; delimiter, strips BOM, maps synonyms and validates rows', () => {
    const csv =
      '\uFEFFname;phone;source;district;rooms\r\nAli;901234567;Инстаграм;Mirzo Ulugʻbek;3\r\nBad;;;;99\r\n\r\n';
    const r = parseLeadsCsv(Buffer.from(csv), now);
    expect(r.totalRows).toBe(2);
    expect(r.rows[0]).toMatchObject({
      row: 2,
      phone: '+998901234567',
      source: 'INSTAGRAM',
      district: 'MIRZO_ULUGBEK',
      rooms: 3,
    });
    expect(r.errors).toEqual(
      expect.arrayContaining([
        { row: 3, column: 'source', code: 'required' },
        { row: 3, column: 'rooms', code: 'invalid_rooms' },
      ]),
    );
  });
  it('rejects non-UTF-8 and missing headers', () => {
    expect(() => parseLeadsCsv(Buffer.from([0x6e, 0x2c, 0xff, 0xfe, 0x0a]), now)).toThrow(/UTF-8/);
    expect(() => parseLeadsCsv(Buffer.from('a,b\n1,2'), now)).toThrow();
  });
  it('parses Tashkent local and ISO dates', () => {
    expect(parseCsvDate('2026-10-19 10:00')?.toISOString()).toBe('2026-10-19T05:00:00.000Z');
    expect(parseCsvDate('2026-10-19T10:00:00+05:00')?.toISOString()).toBe('2026-10-19T05:00:00.000Z');
    expect(parseCsvDate('19.10.2026')).toBeNull();
  });
  it('rejects dates in the future, older than 365 days and response before receipt', () => {
    const csv = [
      'name,source,receivedAt,firstResponseAt',
      'A,PHONE,2027-01-01 10:00,',
      'B,PHONE,2024-01-01 10:00,',
      'C,PHONE,2026-10-19 10:00,2026-10-19 09:00',
    ].join('\n');
    const codes = parseLeadsCsv(Buffer.from(csv), now).errors.map((e) => e.code);
    expect(codes).toEqual(['in_future', 'too_old', 'before_received']);
  });
  it('resolves sources and districts', () => {
    expect(resolveSource('tg')).toBe('TELEGRAM');
    expect(resolveSource('walk-in')).toBe('WALK_IN');
    expect(resolveSource('???')).toBeNull();
    expect(resolveDistrict('Чиланзар')).toBe('CHILONZOR');
    expect(resolveDistrict('yunusobod')).toBe('YUNUSOBOD');
  });
});

describe('CSV export escaping (ADR-019)', () => {
  it('quotes per RFC 4180 and neutralizes formulas', () => {
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvCell('+998901234567')).toBe("'+998901234567");
    expect(csvCell('-5')).toBe("'-5");
    expect(csvCell('@cmd')).toBe("'@cmd");
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('line\nbreak')).toBe('"line\nbreak"');
    expect(csvCell(null)).toBe('');
    expect(csvCell(42)).toBe('42');
    expect(csvLine(['a', 1, true])).toBe('a,1,true\r\n');
  });
});

describe('rule-based fallback (SPEC §17.6)', () => {
  it('detects language', () => {
    expect(detectLanguage('Здравствуйте, нужна квартира')).toBe('ru');
    expect(detectLanguage('Assalomu alaykum, 2 xonali uy kerak')).toBe('uz');
    expect(detectLanguage('Здравствуйте, нужна квартира, narxi qancha?')).toBe('mixed');
    expect(detectLanguage('123')).toBe('unknown');
  });
  it('extracts budgets with currencies and multipliers', () => {
    expect(extractBudget('до 60 000$')).toEqual({ amount: 60000, currency: 'USD' });
    expect(extractBudget('$85000')).toEqual({ amount: 85000, currency: 'USD' });
    expect(extractBudget('бюджет 800 млн')).toEqual({ amount: 800_000_000, currency: 'UZS' });
    expect(extractBudget("1,5 mln so'm")).toEqual({ amount: 1_500_000, currency: 'UZS' });
    expect(extractBudget('70k у.е.')).toEqual({ amount: 70000, currency: 'USD' });
    expect(extractBudget('около 70 тысяч')).toBeNull();
    expect(budgetAppearsInText(800_000_000, 'бюджет 800 млн')).toBe(true);
    expect(budgetAppearsInText(99999, 'бюджет 800 млн')).toBe(false);
  });
  it('extracts district, rooms and property type', () => {
    expect(extractDistrict('Квартира в Юнусабаде')).toBe('YUNUSOBOD');
    expect(extractDistrict("Mirzo Ulug'bek tumani")).toBe('MIRZO_ULUGBEK');
    expect(extractRooms('3-комнатная')).toBe(3);
    expect(extractRooms('2 xonali')).toBe(2);
    expect(extractRooms('студия')).toBe(1);
    expect(extractPropertyType('ищу офис')).toBe('COMMERCIAL');
    expect(extractPropertyType('hovli kerak')).toBe('HOUSE');
  });
  it('scores and explains deterministically', () => {
    const a = ruleBasedAnalysis(
      {
        source: 'WEBSITE',
        message: 'Срочно нужна 2-комнатная квартира в Юнусабаде до 60 000$',
        name: 'A',
        hasPhone: true,
      },
      'ru',
    );
    expect(a.score).toBe(100);
    expect(a.reasons.length).toBeLessThanOrEqual(4);
    expect(a.missingInfo).toEqual([]);
    const weak = ruleBasedAnalysis(
      { source: 'OTHER', message: 'просто интересуюсь', name: null, hasPhone: false },
      'uz',
    );
    expect(weak.score).toBe(5);
    expect(weak.reasons.length).toBeGreaterThanOrEqual(2);
    expect(weak.nextQuestions).toHaveLength(3);
  });
  it('builds reply drafts that pass post-checks', () => {
    for (const language of ['ru', 'uz'] as const) {
      for (const tone of ['FORMAL', 'FRIENDLY'] as const) {
        const d = templateReply(
          { name: 'Aziz', companyName: 'Demo Realty', managerName: 'Dilnoza', analysis: null },
          language,
          tone,
        );
        expect(d.text.length).toBeGreaterThanOrEqual(20);
        expect(checkReplyDraft(d, language)).toBe(true);
      }
    }
  });
  it('weekly summary template uses only aggregate numbers', () => {
    const agg = {
      periodDays: 7,
      totalLeads: 42,
      medianFirstResponseMinutes: 18,
      slaThresholdMinutes: 15,
      breachedPercent: 37,
      noReactionNow: 4,
      worstManager: { name: 'Manager', breachedPercent: 50, leads: 10 },
      worstSource: { source: 'INSTAGRAM', breachedPercent: 45 },
    };
    const s = templateWeeklySummary(agg, 'ru');
    expect(s.bullets.length).toBeGreaterThanOrEqual(3);
    expect(checkWeeklySummary(s, agg)).toBe(true);
    expect(
      checkWeeklySummary({ bullets: ['Всего 999 лидов за неделю', 'a b c d e f g', 'h i j k l m n'] }, agg),
    ).toBe(false);
  });
});

describe('tenant guard (SPEC §11.3)', () => {
  it('requires organizationId on tenant models', () => {
    expect(() => assertTenantScoped('Lead', 'findMany', { where: { id: 'x' } })).toThrow(TenantGuardError);
    expect(() => assertTenantScoped('Lead', 'findMany', { where: { organizationId: 'o' } })).not.toThrow();
    expect(() =>
      assertTenantScoped('Lead', 'findMany', { where: { AND: [{ organizationId: 'o' }] } }),
    ).not.toThrow();
    expect(() => assertTenantScoped('Lead', 'create', { data: { number: 1 } })).toThrow(TenantGuardError);
    expect(() => assertTenantScoped('Lead', 'createMany', { data: [{ organizationId: 'o' }, {}] })).toThrow(
      TenantGuardError,
    );
    expect(() => assertTenantScoped('User', 'findMany', {})).not.toThrow();
  });
});
