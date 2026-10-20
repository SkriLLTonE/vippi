import { districtName, type LeadAnalysis, type Locale, type ReplyDraft, type ReplyTone, type WeeklySummary } from '@vippi/shared';

const PROPERTY: Record<Locale, Record<string, string>> = {
  ru: { APARTMENT: 'квартиру', HOUSE: 'дом', COMMERCIAL: 'коммерческое помещение', LAND: 'участок', OTHER: 'объект' },
  uz: { APARTMENT: 'kvartira', HOUSE: 'hovli', COMMERCIAL: 'tijorat binosi', LAND: 'yer uchastkasi', OTHER: 'obyekt' },
};

const QUESTIONS: Record<Locale, Record<'budget' | 'district' | 'propertyType' | 'rooms', string>> = {
  ru: {
    budget: 'какой бюджет вы рассматриваете?',
    district: 'в каком районе вам удобнее?',
    propertyType: 'какой тип недвижимости вас интересует?',
    rooms: 'сколько комнат нужно?',
  },
  uz: {
    budget: "qancha byudjetni ko'zlayapsiz?",
    district: 'qaysi tuman sizga qulay?',
    propertyType: "qaysi turdagi ko'chmas mulk kerak?",
    rooms: "necha xonali bo'lishi kerak?",
  },
};

export interface ReplyTemplateInput {
  name: string | null;
  companyName: string;
  managerName: string;
  analysis: Pick<LeadAnalysis, 'budget' | 'district' | 'propertyType' | 'rooms'> | null;
}

function propertyPhrase(a: ReplyTemplateInput['analysis'], lang: Locale): string {
  if (!a || (!a.propertyType && !a.rooms && !a.district)) return '';
  const type = PROPERTY[lang][a.propertyType ?? 'APARTMENT'] ?? PROPERTY[lang].OTHER;
  const district = a.district ? districtName(a.district, lang) : null;
  if (lang === 'ru') {
    const rooms = a.rooms ? `${a.rooms}-комнатную ` : '';
    return `Вижу, что вы ищете ${rooms}${type}${district ? ` в районе ${district}` : ''}.`;
  }
  const rooms = a.rooms ? `${a.rooms} xonali ` : '';
  return `Siz ${district ? `${district} tumanida ` : ''}${rooms}${type} qidiryapsiz.`;
}

function questions(a: ReplyTemplateInput['analysis'], lang: Locale): string[] {
  const keys: Array<'budget' | 'district' | 'propertyType' | 'rooms'> = [];
  if (!a?.budget) keys.push('budget');
  if (!a?.district) keys.push('district');
  if (!a?.rooms) keys.push('rooms');
  if (!a?.propertyType) keys.push('propertyType');
  return keys.slice(0, 2).map((k) => QUESTIONS[lang][k]);
}

/** AI-003 fallback (SPEC §17.6): ru/uz × FORMAL/FRIENDLY. */
export function templateReply(input: ReplyTemplateInput, language: Locale, tone: ReplyTone): ReplyDraft {
  const qs = questions(input.analysis, language);
  const phrase = propertyPhrase(input.analysis, language);
  let text: string;
  if (language === 'ru') {
    const hello = tone === 'FORMAL' ? `Здравствуйте${input.name ? `, ${input.name}` : ''}!` : `Добрый день${input.name ? `, ${input.name}` : ''}!`;
    const intro =
      tone === 'FORMAL'
        ? `Меня зовут ${input.managerName}, я представляю компанию ${input.companyName}. Благодарим за обращение.`
        : `Это ${input.managerName} из ${input.companyName}. Спасибо, что написали нам!`;
    const ask = qs.length ? ` Чтобы подобрать варианты, подскажите, пожалуйста: ${qs.join(' И ')}` : ' Когда вам удобно обсудить варианты?';
    text = `${hello} ${intro}${phrase ? ` ${phrase}` : ''}${ask}`;
  } else {
    const hello = `Assalomu alaykum${input.name ? `, ${input.name}` : ''}!`;
    const intro =
      tone === 'FORMAL'
        ? `Men ${input.companyName} kompaniyasidan ${input.managerName}. Murojaatingiz uchun rahmat.`
        : `Men ${input.managerName}, ${input.companyName} jamoasidanman. Yozganingiz uchun katta rahmat!`;
    const ask = qs.length ? ` Iltimos, aniqlashtirib bering: ${qs.join(' Va ')}` : ' Variantlarni qachon muhokama qilishimiz qulay?';
    text = `${hello} ${intro}${phrase ? ` ${phrase}` : ''}${ask}`;
  }
  text = text.replace(/\s+/g, ' ').trim().slice(0, 700);
  return { text, language };
}

export interface WeeklyAggregates {
  periodDays: number;
  totalLeads: number;
  medianFirstResponseMinutes: number | null;
  slaThresholdMinutes: number;
  breachedPercent: number | null;
  noReactionNow: number;
  worstManager: { name: string; breachedPercent: number; leads: number } | null;
  worstSource: { source: string; breachedPercent: number } | null;
}

/** AI-004 fallback: 3–5 bullets from aggregates only. */
export function templateWeeklySummary(a: WeeklyAggregates, locale: Locale): WeeklySummary {
  const b: string[] = [];
  if (locale === 'ru') {
    b.push(`За ${a.periodDays} дней поступило лидов: ${a.totalLeads}.`);
    b.push(
      a.medianFirstResponseMinutes === null
        ? 'Медиану времени ответа посчитать нельзя: нет лидов с первым контактом.'
        : `Медианное время первого ответа — ${a.medianFirstResponseMinutes} мин при пороге SLA ${a.slaThresholdMinutes} мин.`,
    );
    b.push(
      a.breachedPercent === null
        ? 'Доля просрочек пока не определена: нет лидов с завершённым SLA.'
        : `Доля ответов с просрочкой SLA: ${a.breachedPercent}%.`,
    );
    if (a.worstManager)
      b.push(`Больше всего просрочек у менеджера ${a.worstManager.name}: ${a.worstManager.breachedPercent}% из ${a.worstManager.leads} лидов.`);
    if (a.worstSource) b.push(`Источник с наибольшей долей просрочек: ${a.worstSource.source} (${a.worstSource.breachedPercent}%).`);
    b.push(`Сейчас без реакции: ${a.noReactionNow} лид(ов).`);
  } else {
    b.push(`${a.periodDays} kunda kelgan lidlar: ${a.totalLeads}.`);
    b.push(
      a.medianFirstResponseMinutes === null
        ? "Javob vaqti medianasini hisoblab bo'lmaydi: birinchi aloqa qilingan lidlar yo'q."
        : `Birinchi javobning median vaqti — ${a.medianFirstResponseMinutes} daqiqa, SLA chegarasi ${a.slaThresholdMinutes} daqiqa.`,
    );
    b.push(
      a.breachedPercent === null
        ? "Kechikish ulushi hali aniqlanmagan: SLA yakunlangan lidlar yo'q."
        : `SLA muddati o'tgan javoblar ulushi: ${a.breachedPercent}%.`,
    );
    if (a.worstManager)
      b.push(`Eng ko'p kechikish ${a.worstManager.name} menejerida: ${a.worstManager.leads} liddan ${a.worstManager.breachedPercent}%.`);
    if (a.worstSource) b.push(`Kechikish ulushi eng yuqori manba: ${a.worstSource.source} (${a.worstSource.breachedPercent}%).`);
    b.push(`Hozir javobsiz turgan lidlar: ${a.noReactionNow}.`);
  }
  return { bullets: b.slice(0, 6) };
}
