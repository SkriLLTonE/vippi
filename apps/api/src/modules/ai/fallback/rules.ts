import {
  DISTRICTS,
  districtName,
  normalizeApostrophes,
  type District,
  type IndustryPreset,
  type LeadAnalysis,
  type LeadSource,
  type Locale,
  type PropertyType,
} from '@vippi/shared';

// The lookbehind and bounded quantifiers keep matching linear on long digit runs (no restart mid-number).
const NUM = String.raw`(?<!\d)(\d{1,3}(?:[ \u00a0]\d{3}){1,5}|\d{1,15}(?:[.,]\d{1,6})?)`;
const THOUSAND = String.raw`(?:k|к|тыс\.?|тысяч\p{L}*|ming)`;
const MILLION = String.raw`(?:млн\.?|mln\.?|million|миллион\p{L}*)`;
const BILLION = String.raw`(?:млрд\.?|mlrd\.?|milliard\p{L}*|миллиард\p{L}*|billion)`;
const USD = String.raw`(?:\$|у\.?\s?е\.?|usd|dollar\p{L}*|доллар\p{L}*)`;
const UZS = String.raw`(?:сум\p{L}*|so'm|som\b|sum\b|uzs)`;

function prep(text: string): string {
  return normalizeApostrophes(text).toLowerCase();
}

function toNumber(raw: string): number {
  return Number(raw.replace(/[ \u00a0]/g, '').replace(',', '.'));
}

export function detectLanguage(text: string): LeadAnalysis['language'] {
  const letters = text.match(/\p{L}/gu) ?? [];
  if (letters.length === 0) return 'unknown';
  const cyr = letters.filter((c) => /[\u0400-\u04FF]/.test(c)).length;
  const lower = prep(text);
  const uzCyr = /[ўқғҳ]/.test(lower);
  const uzLatin = /(o'|g'|\bxonali\b|\bkerak\b|\bnarxi\b|\bqancha\b|\buy\b|\bkvartira\b)/.test(lower);
  const cyrShare = cyr / letters.length;
  const ru = cyrShare > 0.6 && !uzCyr;
  const uz = uzLatin || uzCyr;
  if (ru && uz) return 'mixed';
  if (uzLatin && !uzCyr && cyrShare >= 0.25) return 'mixed';
  if (ru) return 'ru';
  if (uz) return 'uz';
  return 'unknown';
}

export function extractBudget(text: string): LeadAnalysis['budget'] {
  const t = prep(text);
  const patterns: Array<{ re: RegExp; currency: 'USD' | 'UZS'; mult: (m: RegExpExecArray) => number }> = [
    {
      re: new RegExp(String.raw`\$\s*${NUM}\s*(${THOUSAND})?`, 'u'),
      currency: 'USD',
      mult: (m) => (m[2] ? 1000 : 1),
    },
    {
      re: new RegExp(String.raw`${NUM}\s*(${THOUSAND})?\s*${USD}`, 'u'),
      currency: 'USD',
      mult: (m) => (m[2] ? 1000 : 1),
    },
    { re: new RegExp(String.raw`${NUM}\s*${BILLION}`, 'u'), currency: 'UZS', mult: () => 1_000_000_000 },
    { re: new RegExp(String.raw`${NUM}\s*${MILLION}`, 'u'), currency: 'UZS', mult: () => 1_000_000 },
    {
      re: new RegExp(String.raw`${NUM}\s*(${THOUSAND})?\s*${UZS}`, 'u'),
      currency: 'UZS',
      mult: (m) => (m[2] ? 1000 : 1),
    },
  ];
  for (const p of patterns) {
    const m = p.re.exec(t);
    if (m?.[1]) {
      const amount = Math.round(toNumber(m[1]) * p.mult(m));
      if (Number.isFinite(amount) && amount > 0 && amount <= 1e13) return { amount, currency: p.currency };
    }
  }
  return null;
}

/** Post-check (SPEC §17.5): the budget number must be present in the request text. */
export function budgetAppearsInText(amount: number, text: string): boolean {
  const numbers = [...prep(text).matchAll(new RegExp(NUM, 'gu'))].map((m) => toNumber(m[1] ?? ''));
  return numbers.some((n) =>
    [1, 1000, 1_000_000, 1_000_000_000].some((mult) => Math.abs(n * mult - amount) < 1e-6 * Math.max(1, amount)),
  );
}

export function extractDistrict(text: string): District | null {
  const t = prep(text);
  for (const d of DISTRICTS) {
    const variants = [...d.aliases, normalizeApostrophes(d.uz).toLowerCase(), d.ru.toLowerCase()];
    if (variants.some((v) => t.includes(v))) return d.code;
  }
  // Common transliterations not listed in the dictionary.
  if (/yunusabad|юнусабад/.test(t)) return 'YUNUSOBOD';
  return null;
}

export function extractRooms(text: string): number | null {
  const t = prep(text);
  if (/студи/.test(t)) return 1;
  const m = /(\d{1,2})\s*-?\s*(?:xonali|комнатн\p{L}*|комн\p{L}*|x(?![a-z])|х(?![а-я]))/u.exec(t);
  if (!m?.[1]) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 10 ? n : null;
}

export function extractPropertyType(text: string): PropertyType | null {
  const t = prep(text);
  if (/квартир|kvartira|xonali|студи/.test(t)) return 'APARTMENT';
  // `\b` is ASCII-only in JS regexes, so Cyrillic words need Unicode letter lookarounds.
  if (/(?<!\p{L})дома?(?!\p{L})|hovli|uy-joy|коттедж/u.test(t)) return 'HOUSE';
  if (/офис|помещени|ofis|do'kon|магазин/.test(t)) return 'COMMERCIAL';
  if (/участ|\byer\b|соток|sotix/.test(t)) return 'LAND';
  return null;
}

const SOURCE_LABEL: Record<Locale, Record<LeadSource, string>> = {
  ru: {
    INSTAGRAM: 'Instagram',
    TELEGRAM: 'Telegram',
    WEBSITE: 'Сайт',
    OLX: 'OLX',
    PHONE: 'Звонок',
    WALK_IN: 'Визит в офис',
    REFERRAL: 'Рекомендация',
    OTHER: 'Другое',
  },
  uz: {
    INSTAGRAM: 'Instagram',
    TELEGRAM: 'Telegram',
    WEBSITE: 'Sayt',
    OLX: 'OLX',
    PHONE: "Qo'ng'iroq",
    WALK_IN: 'Ofisga tashrif',
    REFERRAL: 'Tavsiya',
    OTHER: 'Boshqa',
  },
};

const PROPERTY_LABEL: Record<Locale, Record<PropertyType, string>> = {
  ru: {
    APARTMENT: 'квартира',
    HOUSE: 'дом',
    COMMERCIAL: 'коммерческая недвижимость',
    LAND: 'участок',
    OTHER: 'другое',
  },
  uz: {
    APARTMENT: 'kvartira',
    HOUSE: 'hovli/uy',
    COMMERCIAL: 'tijorat binosi',
    LAND: 'yer uchastkasi',
    OTHER: 'boshqa',
  },
};

const T = {
  ru: {
    missing: { budget: 'Бюджет', district: 'Район', propertyType: 'Тип объекта', rooms: 'Количество комнат' },
    questions: {
      budget: 'Какой бюджет вы рассматриваете?',
      district: 'В каком районе Ташкента ищете?',
      propertyType: 'Какой тип недвижимости вас интересует?',
      rooms: 'Сколько комнат нужно?',
    },
    found: 'Найдено',
    reasons: {
      phone: 'Указан телефон',
      budget: 'Указан бюджет',
      district: 'Указан район',
      details: 'Указан тип объекта или комнаты',
      long: 'Подробное обращение',
      strongSource: 'Источник с высоким намерением',
      source: 'Источник из соцсетей/объявлений',
      urgent: 'Есть признаки срочности',
      vague: 'Похоже на общий интерес',
      little: 'Мало данных в заявке',
    },
    rooms: (n: number) => `${n}-комн.`,
  },
  uz: {
    missing: { budget: 'Byudjet', district: 'Tuman', propertyType: 'Obyekt turi', rooms: 'Xonalar soni' },
    questions: {
      budget: "Qancha byudjetni ko'zlayapsiz?",
      district: 'Toshkentning qaysi tumanida qidiryapsiz?',
      propertyType: 'Qaysi turdagi koʻchmas mulk kerak?',
      rooms: 'Necha xonali boʻlishi kerak?',
    },
    found: 'Aniqlangan',
    reasons: {
      phone: 'Telefon raqami bor',
      budget: "Byudjet ko'rsatilgan",
      district: "Tuman ko'rsatilgan",
      details: "Obyekt turi yoki xonalar soni ko'rsatilgan",
      long: 'Batafsil murojaat',
      strongSource: 'Yuqori niyatli manba',
      source: "Ijtimoiy tarmoq/e'lon manbasi",
      urgent: 'Shoshilinchlik belgilari bor',
      vague: "Umumiy qiziqishga o'xshaydi",
      little: "Murojaatda ma'lumot kam",
    },
    rooms: (n: number) => `${n} xonali`,
  },
} as const;

export type MissingKey = keyof (typeof T)['ru']['missing'];

export interface RuleInput {
  source: LeadSource;
  message: string;
  name: string | null;
  hasPhone: boolean;
  /** GENERIC preset: labels of the organization's custom fields that are still empty on the lead. */
  missingFields?: readonly string[];
}

const GENERIC = {
  ru: {
    budget: 'Бюджет',
    found: 'Найдено',
    budgetFound: 'бюджет',
    details: 'Расскажите, пожалуйста, подробнее, что именно вас интересует?',
    time: 'Когда вам удобно поговорить?',
    field: (label: string) => `Уточните, пожалуйста: ${label}?`,
  },
  uz: {
    budget: 'Byudjet',
    found: 'Aniqlangan',
    budgetFound: 'byudjet',
    details: 'Iltimos, aynan nima qiziqtirayotganini batafsil yozib bering.',
    time: 'Siz bilan qachon gaplashish qulay?',
    field: (label: string) => `Iltimos, aniqlashtiring: ${label}?`,
  },
} as const;

/** ADR-024: any business — budget only, no district/property/rooms questions or score bonuses. */
function genericAnalysis(input: RuleInput, locale: Locale): LeadAnalysis {
  const g = GENERIC[locale];
  const text = input.message;
  const budget = extractBudget(text);
  const fieldsMissing = (input.missingFields ?? []).map((l) => l.slice(0, 120));
  const head = `${SOURCE_LABEL[locale][input.source]}: ${text.trim().slice(0, 200) || '—'}`;
  const summary = (
    budget ? `${head}. ${g.found}: ${g.budgetFound} ${budget.amount.toLocaleString('ru-RU').replace(/\u00a0/g, ' ')} ${budget.currency}` : head
  ).slice(0, 400);
  const questions = [
    ...fieldsMissing.map((l) => g.field(l).slice(0, 150)),
    ...(text.trim().length < 40 ? [g.details] : []),
    g.time,
  ];
  const scored = scoreLead(input, { budget, district: null, propertyType: null, rooms: null }, locale);
  return {
    summary,
    language: detectLanguage(text),
    need: null,
    budget,
    district: null,
    propertyType: null,
    rooms: null,
    missingInfo: [...fieldsMissing, ...(budget ? [] : [g.budget])].slice(0, 5),
    score: scored.score,
    reasons: scored.reasons,
    nextQuestions: questions.slice(0, 3),
  };
}

/** AI-001 + AI-002 fallback (SPEC §17.6). Deterministic. */
export function ruleBasedAnalysis(input: RuleInput, locale: Locale, preset: IndustryPreset = 'REAL_ESTATE'): LeadAnalysis {
  if (preset === 'GENERIC') return genericAnalysis(input, locale);
  const t = T[locale];
  const text = input.message;
  const budget = extractBudget(text);
  const district = extractDistrict(text);
  const propertyType = extractPropertyType(text);
  const rooms = extractRooms(text);

  const missing: MissingKey[] = [];
  if (!budget) missing.push('budget');
  if (!district) missing.push('district');
  if (!propertyType) missing.push('propertyType');
  if (!rooms) missing.push('rooms');

  const found: string[] = [];
  if (propertyType) found.push(PROPERTY_LABEL[locale][propertyType]);
  if (rooms) found.push(t.rooms(rooms));
  if (district) found.push(districtName(district, locale));
  if (budget)
    found.push(`${budget.amount.toLocaleString('ru-RU').replace(/\u00a0/g, ' ')} ${budget.currency}`);
  const head = `${SOURCE_LABEL[locale][input.source]}: ${text.trim().slice(0, 200) || '—'}`;
  const summary = (found.length ? `${head}. ${t.found}: ${found.join(', ')}` : head).slice(0, 400);

  const scored = scoreLead(input, { budget, district, propertyType, rooms }, locale);
  return {
    summary,
    language: detectLanguage(text),
    need: null,
    budget,
    district,
    propertyType,
    rooms,
    missingInfo: missing.map((k) => t.missing[k]),
    score: scored.score,
    reasons: scored.reasons,
    nextQuestions: missing.slice(0, 3).map((k) => t.questions[k]),
  };
}

export function scoreLead(
  input: RuleInput,
  fields: Pick<LeadAnalysis, 'budget' | 'district' | 'propertyType' | 'rooms'>,
  locale: Locale,
): { score: number; reasons: string[] } {
  const r = T[locale].reasons;
  const hits: Array<{ w: number; reason: string }> = [];
  const text = prep(input.message);
  if (input.hasPhone) hits.push({ w: 15, reason: r.phone });
  if (fields.budget) hits.push({ w: 20, reason: r.budget });
  if (fields.district) hits.push({ w: 10, reason: r.district });
  if (fields.propertyType || fields.rooms) hits.push({ w: 10, reason: r.details });
  if (input.message.trim().length > 40) hits.push({ w: 10, reason: r.long });
  if (['WEBSITE', 'PHONE', 'WALK_IN', 'REFERRAL'].includes(input.source))
    hits.push({ w: 10, reason: r.strongSource });
  else if (['INSTAGRAM', 'TELEGRAM', 'OLX'].includes(input.source)) hits.push({ w: 5, reason: r.source });
  if (/срочно|сегодня|на этой неделе|\btez\b|bugun|shoshilinch/.test(text))
    hits.push({ w: 10, reason: r.urgent });
  if (/просто интерес|shunchaki|потом/.test(text)) hits.push({ w: -15, reason: r.vague });

  const score = Math.max(0, Math.min(100, 20 + hits.reduce((s, h) => s + h.w, 0)));
  const reasons = [...hits]
    .sort((a, b) => Math.abs(b.w) - Math.abs(a.w))
    .slice(0, 4)
    .map((h) => h.reason);
  if (reasons.length < 2) reasons.push(r.little);
  if (reasons.length < 2) reasons.push(`${SOURCE_LABEL[locale][input.source]}`);
  return { score, reasons };
}
