import { z } from 'zod';
import type { IndustryPreset, Locale } from './enums.js';
import {
  MAX_LEAD_FIELDS,
  OVERRIDABLE_STATUSES,
  localizedLabel,
  validateLeadAttributes,
  type LeadAttributes,
  type LeadAttributeValue,
  type LeadFieldDef,
  type OverridableStatus,
  type StatusLabels,
} from './schemas/org-config.js';

/**
 * ADR-025: industry template catalog. Pure data shared by API (registration, template apply, AI hints)
 * and web (registration list, preview, examples). Bump the version when templates change.
 */
export const INDUSTRY_CATALOG_VERSION = 1;

export const INDUSTRIES = [
  'REAL_ESTATE',
  'DENTAL_CLINIC',
  'MEDICAL_CLINIC',
  'BEAUTY_SALON',
  'EDUCATION',
  'AUTO',
  'CONSTRUCTION_RENOVATION',
  'TOURISM',
  'B2B_SERVICES',
  'RETAIL_ECOMMERCE',
  'OTHER',
] as const;
export type Industry = (typeof INDUSTRIES)[number];
export const IndustrySchema = z.enum(INDUSTRIES);

export interface RuUz {
  ru: string;
  uz: string;
}

export interface IndustryTemplate {
  code: Industry;
  /** Behaviour preset (ADR-024): only REAL_ESTATE shows district/propertyType/rooms and uses real-estate prompts. */
  preset: IndustryPreset;
  name: RuUz;
  /** English, injected into the generic AI prompt: business type and what to clarify. */
  ai: { name: string; hint: string } | null;
  fields: LeadFieldDef[];
  statusLabels: StatusLabels;
  sample: {
    message: RuUz;
    /** Valid against `fields` (checked by tests). */
    attributes: LeadAttributes;
    /** Built-in real-estate columns for the REAL_ESTATE example. */
    realEstate?: { district: string; propertyType: string; rooms: number };
  };
}

type Opt = [value: string, ru: string, uz: string];

function select(key: string, ru: string, uz: string, options: Opt[]): LeadFieldDef {
  return {
    key,
    label: { ru, uz },
    type: 'single_select',
    required: false,
    showInCreate: true,
    options: options.map(([value, oru, ouz]) => ({ value, label: { ru: oru, uz: ouz } })),
  };
}

function field(key: string, ru: string, uz: string, type: 'text' | 'number' | 'money'): LeadFieldDef {
  return { key, label: { ru, uz }, type, required: false, showInCreate: true };
}

const preferredTime = select('preferredTime', 'Удобное время', 'Qulay vaqt', [
  ['morning', 'Утро', 'Ertalab'],
  ['afternoon', 'День', 'Kunduzi'],
  ['evening', 'Вечер', 'Kechqurun'],
]);
const visitType = select('visitType', 'Визит', 'Tashrif', [
  ['first', 'Первичный', 'Birinchi marta'],
  ['repeat', 'Повторный', 'Takroriy'],
]);
const booked: StatusLabels = { WON: { ru: 'Записан', uz: 'Yozildi' }, LOST: { ru: 'Не записался', uz: 'Yozilmadi' } };
const refused = { ru: 'Отказ', uz: 'Rad etildi' };

export const INDUSTRY_TEMPLATES: Readonly<Record<Industry, IndustryTemplate>> = {
  REAL_ESTATE: {
    code: 'REAL_ESTATE',
    preset: 'REAL_ESTATE',
    name: { ru: 'Недвижимость', uz: 'Koʻchmas mulk' },
    ai: null,
    fields: [],
    statusLabels: {},
    sample: {
      message: { ru: 'Нужна 2-комнатная квартира в Чиланзаре', uz: 'Chilonzorda 2 xonali kvartira kerak' },
      attributes: {},
      realEstate: { district: 'CHILONZOR', propertyType: 'APARTMENT', rooms: 2 },
    },
  },
  DENTAL_CLINIC: {
    code: 'DENTAL_CLINIC',
    preset: 'GENERIC',
    name: { ru: 'Стоматология', uz: 'Stomatologiya' },
    ai: {
      name: 'dental clinic',
      hint: 'Clarify the dental service, preferred visit time and whether it is the first visit. Never give medical advice or diagnoses.',
    },
    fields: [
      select('service', 'Услуга', 'Xizmat', [
        ['consultation', 'Консультация', 'Maslahat'],
        ['cleaning', 'Чистка', 'Tozalash'],
        ['treatment', 'Лечение', 'Davolash'],
        ['implant', 'Имплант', 'Implant'],
        ['braces', 'Брекеты', 'Breketlar'],
        ['whitening', 'Отбеливание', 'Oqartirish'],
        ['prosthetics', 'Протезирование', 'Protezlash'],
      ]),
      preferredTime,
      visitType,
    ],
    statusLabels: booked,
    sample: {
      message: {
        ru: 'Здравствуйте, хочу записаться на чистку зубов, удобно утром',
        uz: 'Assalomu alaykum, tish tozalashga yozilmoqchiman, ertalab qulay',
      },
      attributes: { service: 'cleaning', preferredTime: 'morning', visitType: 'first' },
    },
  },
  MEDICAL_CLINIC: {
    code: 'MEDICAL_CLINIC',
    preset: 'GENERIC',
    name: { ru: 'Медицинская клиника', uz: 'Tibbiyot klinikasi' },
    ai: {
      name: 'medical clinic',
      hint: 'Clarify the doctor or examination needed, preferred visit time and whether it is the first visit. Never give medical advice or diagnoses.',
    },
    fields: [
      select('direction', 'Направление', 'Yoʻnalish', [
        ['therapist', 'Терапевт', 'Terapevt'],
        ['pediatrician', 'Педиатр', 'Pediatr'],
        ['gynecologist', 'Гинеколог', 'Ginekolog'],
        ['cardiologist', 'Кардиолог', 'Kardiolog'],
        ['ultrasound', 'УЗИ', 'UZI'],
        ['labTests', 'Анализы', 'Tahlillar'],
        ['other', 'Другое', 'Boshqa'],
      ]),
      preferredTime,
      visitType,
    ],
    statusLabels: booked,
    sample: {
      message: { ru: 'Хочу записаться к кардиологу на этой неделе, лучше вечером', uz: 'Shu hafta kardiologga yozilmoqchiman, kechqurun qulay' },
      attributes: { direction: 'cardiologist', preferredTime: 'evening' },
    },
  },
  BEAUTY_SALON: {
    code: 'BEAUTY_SALON',
    preset: 'GENERIC',
    name: { ru: 'Салон красоты', uz: 'Goʻzallik saloni' },
    ai: { name: 'beauty salon', hint: 'Clarify the beauty service, preferred date and time and a preferred master if any.' },
    fields: [
      select('service', 'Услуга', 'Xizmat', [
        ['haircut', 'Стрижка', 'Soch turmagi'],
        ['coloring', 'Окрашивание', 'Soch boʻyash'],
        ['manicure', 'Маникюр', 'Manikyur'],
        ['pedicure', 'Педикюр', 'Pedikyur'],
        ['cosmetology', 'Косметология', 'Kosmetologiya'],
        ['makeup', 'Макияж', 'Makiyaj'],
        ['other', 'Другое', 'Boshqa'],
      ]),
      preferredTime,
      field('master', 'Мастер', 'Usta', 'text'),
    ],
    statusLabels: booked,
    sample: {
      message: { ru: 'Хочу записаться на маникюр в субботу после обеда', uz: 'Shanba kuni tushdan keyin manikyurga yozilmoqchiman' },
      attributes: { service: 'manicure', preferredTime: 'afternoon', master: 'Dilnoza' },
    },
  },
  EDUCATION: {
    code: 'EDUCATION',
    preset: 'GENERIC',
    name: { ru: 'Образование и курсы', uz: 'Taʼlim va kurslar' },
    ai: { name: 'education center (courses, school)', hint: "Clarify the course, the student's age and level, and offline or online format." },
    fields: [
      select('course', 'Курс', 'Kurs', [
        ['english', 'Английский', 'Ingliz tili'],
        ['russian', 'Русский', 'Rus tili'],
        ['ielts', 'IELTS / CEFR', 'IELTS / CEFR'],
        ['programming', 'Программирование', 'Dasturlash'],
        ['math', 'Математика', 'Matematika'],
        ['schoolPrep', 'Подготовка к школе', 'Maktabga tayyorlov'],
        ['other', 'Другое', 'Boshqa'],
      ]),
      field('studentAge', 'Возраст ученика', 'Oʻquvchi yoshi', 'number'),
      select('format', 'Формат', 'Format', [
        ['offline', 'Очно', 'Oflayn'],
        ['online', 'Онлайн', 'Onlayn'],
      ]),
      select('level', 'Уровень', 'Daraja', [
        ['beginner', 'Начальный', 'Boshlangʻich'],
        ['intermediate', 'Средний', 'Oʻrta'],
        ['advanced', 'Продвинутый', 'Yuqori'],
      ]),
    ],
    statusLabels: { WON: { ru: 'Записан на курс', uz: 'Kursga yozildi' }, LOST: { ru: 'Не записался', uz: 'Yozilmadi' } },
    sample: {
      message: { ru: 'Ищу курс английского для сына, ему 12 лет, начальный уровень', uz: 'Oʻglim uchun ingliz tili kursi kerak, 12 yoshda, boshlangʻich daraja' },
      attributes: { course: 'english', studentAge: 12, format: 'offline', level: 'beginner' },
    },
  },
  AUTO: {
    code: 'AUTO',
    preset: 'GENERIC',
    name: { ru: 'Авто: продажа и сервис', uz: 'Avto: savdo va servis' },
    ai: {
      name: 'car dealer and car service',
      hint: 'Clarify whether the customer wants to buy a car or needs service/repair, the car make and model, year and payment method (cash, credit, installment).',
    },
    fields: [
      select('requestType', 'Тип запроса', 'Soʻrov turi', [
        ['buyNew', 'Покупка нового', 'Yangi xarid'],
        ['buyUsed', 'Покупка с пробегом', 'Ishlatilganini xarid'],
        ['service', 'ТО / сервис', 'Texnik xizmat'],
        ['repair', 'Ремонт', 'Taʼmirlash'],
        ['parts', 'Запчасти', 'Ehtiyot qismlar'],
        ['tradeIn', 'Trade-in', 'Trade-in'],
      ]),
      field('carModel', 'Марка и модель', 'Marka va model', 'text'),
      field('carYear', 'Год выпуска', 'Ishlab chiqarilgan yil', 'number'),
      select('paymentMethod', 'Оплата', 'Toʻlov', [
        ['cash', 'Наличные', 'Naqd'],
        ['credit', 'Кредит', 'Kredit'],
        ['installment', 'Рассрочка', 'Muddatli toʻlov'],
      ]),
    ],
    statusLabels: { WON: { ru: 'Продано / записан', uz: 'Sotildi / yozildi' }, LOST: refused },
    sample: {
      message: { ru: 'Интересует Chevrolet Cobalt 2024 в рассрочку', uz: 'Chevrolet Cobalt 2024 muddatli toʻlovga kerak' },
      attributes: { requestType: 'buyNew', carModel: 'Chevrolet Cobalt', carYear: 2024, paymentMethod: 'installment' },
    },
  },
  CONSTRUCTION_RENOVATION: {
    code: 'CONSTRUCTION_RENOVATION',
    preset: 'GENERIC',
    name: { ru: 'Строительство и ремонт', uz: 'Qurilish va taʼmirlash' },
    ai: { name: 'construction and renovation company', hint: 'Clarify the type of work, the object (apartment, house, office), its area in square meters and the desired timeline.' },
    fields: [
      select('workType', 'Вид работ', 'Ish turi', [
        ['renovation', 'Ремонт под ключ', 'Kalit topshirish taʼmiri'],
        ['construction', 'Строительство', 'Qurilish'],
        ['design', 'Дизайн-проект', 'Dizayn loyiha'],
        ['materials', 'Материалы', 'Materiallar'],
        ['other', 'Другое', 'Boshqa'],
      ]),
      select('objectType', 'Объект', 'Obyekt', [
        ['apartment', 'Квартира', 'Kvartira'],
        ['house', 'Дом', 'Uy'],
        ['office', 'Офис / коммерция', 'Ofis / tijorat'],
      ]),
      field('area', 'Площадь, м²', 'Maydon, m²', 'number'),
      select('timeline', 'Сроки', 'Muddat', [
        ['urgent', 'Срочно', 'Shoshilinch'],
        ['month', 'В течение месяца', 'Bir oy ichida'],
        ['later', 'Позже', 'Keyinroq'],
      ]),
    ],
    statusLabels: { WON: { ru: 'Договор заключён', uz: 'Shartnoma tuzildi' }, LOST: refused },
    sample: {
      message: { ru: 'Нужен ремонт под ключ в квартире 65 м², начать в течение месяца', uz: '65 m² kvartiraga kalit topshirish taʼmiri kerak, bir oy ichida' },
      attributes: { workType: 'renovation', objectType: 'apartment', area: 65, timeline: 'month' },
    },
  },
  TOURISM: {
    code: 'TOURISM',
    preset: 'GENERIC',
    name: { ru: 'Туризм', uz: 'Turizm' },
    ai: { name: 'travel agency', hint: 'Clarify the trip type, destination, travel dates and the number of travellers (adults and children).' },
    fields: [
      select('tripType', 'Тип поездки', 'Sayohat turi', [
        ['beach', 'Пляжный отдых', 'Dengiz boʻyida dam olish'],
        ['excursion', 'Экскурсии', 'Ekskursiya'],
        ['umrah', 'Умра / хадж', 'Umra / haj'],
        ['tickets', 'Авиабилеты', 'Aviachiptalar'],
        ['visa', 'Визы', 'Vizalar'],
        ['other', 'Другое', 'Boshqa'],
      ]),
      field('destination', 'Направление', 'Yoʻnalish', 'text'),
      field('travelDates', 'Даты поездки', 'Sayohat sanalari', 'text'),
      field('travelers', 'Количество туристов', 'Sayyohlar soni', 'number'),
    ],
    statusLabels: { WON: { ru: 'Тур продан', uz: 'Tur sotildi' }, LOST: refused },
    sample: {
      message: { ru: 'Хотим в Дубай на 7 ночей в мае, 2 взрослых', uz: 'May oyida Dubayga 7 kecha, 2 kattalar' },
      attributes: { tripType: 'beach', destination: 'Dubai', travelDates: '05.2027', travelers: 2 },
    },
  },
  B2B_SERVICES: {
    code: 'B2B_SERVICES',
    preset: 'GENERIC',
    name: { ru: 'Услуги для бизнеса / IT', uz: 'Biznes uchun xizmatlar / IT' },
    ai: { name: 'B2B services and IT company', hint: "Clarify the service the company needs, the company size, the contact's role and the decision timeline." },
    fields: [
      select('serviceType', 'Услуга', 'Xizmat', [
        ['website', 'Сайт / приложение', 'Sayt / ilova'],
        ['software', 'Программа / CRM', 'Dastur / CRM'],
        ['marketing', 'Маркетинг', 'Marketing'],
        ['accounting', 'Бухгалтерия', 'Buxgalteriya'],
        ['consulting', 'Консалтинг', 'Konsalting'],
        ['other', 'Другое', 'Boshqa'],
      ]),
      select('companySize', 'Размер компании', 'Kompaniya hajmi', [
        ['small', 'До 10 сотрудников', '10 nafargacha xodim'],
        ['medium', '10–50 сотрудников', '10–50 xodim'],
        ['large', 'Больше 50', '50 dan ortiq'],
      ]),
      field('position', 'Должность контакта', 'Kontakt lavozimi', 'text'),
    ],
    statusLabels: { WON: { ru: 'Договор подписан', uz: 'Shartnoma imzolandi' }, LOST: refused },
    sample: {
      message: { ru: 'Нужна CRM для отдела продаж, у нас 25 сотрудников', uz: 'Savdo boʻlimi uchun CRM kerak, 25 xodimimiz bor' },
      attributes: { serviceType: 'software', companySize: 'medium', position: 'CEO' },
    },
  },
  RETAIL_ECOMMERCE: {
    code: 'RETAIL_ECOMMERCE',
    preset: 'GENERIC',
    name: { ru: 'Торговля и интернет-магазин', uz: 'Savdo va internet-doʻkon' },
    ai: { name: 'retail store and online shop', hint: 'Clarify the product, quantity, delivery or pickup (Tashkent or regions) and payment method.' },
    fields: [
      field('product', 'Товар', 'Mahsulot', 'text'),
      field('quantity', 'Количество', 'Miqdor', 'number'),
      select('delivery', 'Доставка', 'Yetkazib berish', [
        ['pickup', 'Самовывоз', 'Olib ketish'],
        ['tashkent', 'По Ташкенту', 'Toshkent boʻylab'],
        ['regions', 'В регионы', 'Viloyatlarga'],
      ]),
      select('paymentMethod', 'Оплата', 'Toʻlov', [
        ['cash', 'Наличные', 'Naqd'],
        ['card', 'Карта', 'Karta'],
        ['installment', 'Рассрочка', 'Muddatli toʻlov'],
      ]),
    ],
    statusLabels: { WON: { ru: 'Заказ оформлен', uz: 'Buyurtma rasmiylashtirildi' }, LOST: { ru: 'Отменён', uz: 'Bekor qilindi' } },
    sample: {
      message: { ru: 'Есть ли в наличии кондиционер Artel 12? Нужна доставка по Ташкенту', uz: 'Artel 12 konditsioneri bormi? Toshkent boʻylab yetkazib berish kerak' },
      attributes: { product: 'Artel 12', quantity: 1, delivery: 'tashkent', paymentMethod: 'card' },
    },
  },
  OTHER: {
    code: 'OTHER',
    preset: 'GENERIC',
    name: { ru: 'Другой бизнес', uz: 'Boshqa biznes' },
    ai: null,
    fields: [],
    statusLabels: {},
    sample: {
      message: { ru: 'Здравствуйте, хочу узнать цену и условия', uz: 'Assalomu alaykum, narxi va shartlarini bilmoqchiman' },
      attributes: {},
    },
  },
};

export function industryTemplate(code: Industry): IndustryTemplate {
  return INDUSTRY_TEMPLATES[code];
}

export function presetForIndustry(code: Industry): IndustryPreset {
  return INDUSTRY_TEMPLATES[code].preset;
}

/**
 * Stored industry code reconciled with the behaviour preset: unknown codes and legacy rows
 * (created before ADR-025) map to REAL_ESTATE or OTHER by preset.
 */
export function resolveIndustry(raw: unknown, preset: IndustryPreset): Industry {
  const r = IndustrySchema.safeParse(raw);
  if (r.success && presetForIndustry(r.data) === preset) return r.data;
  return preset === 'REAL_ESTATE' ? 'REAL_ESTATE' : 'OTHER';
}

export function industryName(code: Industry, locale: Locale): string {
  return INDUSTRY_TEMPLATES[code].name[locale];
}

// ---------------------------------------------------------------- template merge (preview + apply)

export interface IndustryTemplatePlan {
  /** Definitions after the merge: existing ones untouched, template ones appended. */
  fields: LeadFieldDef[];
  addedFields: string[];
  /** Template keys already present (case-insensitive) — existing definitions win. */
  existingFields: string[];
  /** Template keys that do not fit into MAX_LEAD_FIELDS. */
  skippedFields: string[];
  statusLabels: StatusLabels;
  /** Statuses whose label will change. */
  statusLabelsChanged: OverridableStatus[];
  /** Customized labels kept because overwrite was not confirmed. */
  statusLabelsKept: OverridableStatus[];
}

const sameLabel = (a: StatusLabels[OverridableStatus], b: StatusLabels[OverridableStatus]) =>
  (a?.ru ?? '') === (b?.ru ?? '') && (a?.uz ?? '') === (b?.uz ?? '');

/**
 * Never removes definitions or values; customized status labels change only with `overwriteStatusLabels`.
 * Labels equal to the defaults of `opts.previous` (the industry being left) are not considered customized.
 */
export function planIndustryTemplate(
  template: IndustryTemplate,
  current: { leadFields: readonly LeadFieldDef[]; statusLabels: StatusLabels },
  opts: { overwriteStatusLabels?: boolean; previous?: IndustryTemplate } = {},
): IndustryTemplatePlan {
  const fields = [...current.leadFields];
  const taken = new Set(fields.map((d) => d.key.toLowerCase()));
  const addedFields: string[] = [];
  const existingFields: string[] = [];
  const skippedFields: string[] = [];
  for (const def of template.fields) {
    if (taken.has(def.key.toLowerCase())) existingFields.push(def.key);
    else if (fields.length >= MAX_LEAD_FIELDS) skippedFields.push(def.key);
    else {
      fields.push(def);
      taken.add(def.key.toLowerCase());
      addedFields.push(def.key);
    }
  }
  const statusLabels: StatusLabels = { ...current.statusLabels };
  const statusLabelsChanged: OverridableStatus[] = [];
  const statusLabelsKept: OverridableStatus[] = [];
  for (const status of OVERRIDABLE_STATUSES) {
    const next = template.statusLabels[status];
    const cur = current.statusLabels[status];
    if (!next || sameLabel(cur, next)) continue;
    const customized = cur && !(opts.previous?.statusLabels[status] && sameLabel(cur, opts.previous.statusLabels[status]));
    if (customized && !opts.overwriteStatusLabels) {
      statusLabelsKept.push(status);
      continue;
    }
    statusLabels[status] = next;
    statusLabelsChanged.push(status);
  }
  return { fields, addedFields, existingFields, skippedFields, statusLabels, statusLabelsChanged, statusLabelsKept };
}

// ---------------------------------------------------------------- examples (API docs, placeholders)

function placeholderValue(def: LeadFieldDef, locale: Locale): LeadAttributeValue {
  switch (def.type) {
    case 'number':
      return 1;
    case 'money':
      return { amount: '1000000', currency: 'UZS' };
    case 'single_select':
      return def.options?.[0]?.value ?? '';
    case 'text':
      return localizedLabel(def.label, locale) ?? def.key;
  }
}

/** Example attributes for the organization's active fields: template sample values when valid, else typed placeholders. */
export function exampleLeadAttributes(defs: readonly LeadFieldDef[], industry: Industry, locale: Locale): LeadAttributes {
  const sample = INDUSTRY_TEMPLATES[industry].sample.attributes;
  const out: LeadAttributes = {};
  for (const def of defs) {
    const candidate = sample[def.key];
    const valid = candidate !== undefined && validateLeadAttributes([def], { [def.key]: candidate }, 'import').ok;
    out[def.key] = valid ? candidate : placeholderValue(def, locale);
  }
  return out;
}
