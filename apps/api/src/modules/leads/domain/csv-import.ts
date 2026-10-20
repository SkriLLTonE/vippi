import Papa from 'papaparse';
import {
  CSV_MAX_ROWS,
  CURRENCIES,
  DISTRICTS,
  LEAD_SOURCES,
  normalizeApostrophes,
  normalizePhone,
  PROPERTY_TYPES,
  zonedTimeToUtc,
  type CsvLeadRowNormalized,
  type CsvRowError,
  type Currency,
  type District,
  type LeadSource,
  type PropertyType,
} from '@vippi/shared';
import { AppException } from '../../../common/app-exception.js';

export const CSV_ENCODING_MESSAGE = 'Сохраните файл в UTF-8, разделитель , или ;';
const MAX_HISTORY_MS = 365 * 86_400_000;

const SOURCE_SYNONYMS: Record<string, LeadSource> = {
  instagram: 'INSTAGRAM',
  insta: 'INSTAGRAM',
  ig: 'INSTAGRAM',
  инстаграм: 'INSTAGRAM',
  инста: 'INSTAGRAM',
  telegram: 'TELEGRAM',
  tg: 'TELEGRAM',
  телеграм: 'TELEGRAM',
  телеграмм: 'TELEGRAM',
  website: 'WEBSITE',
  site: 'WEBSITE',
  sayt: 'WEBSITE',
  сайт: 'WEBSITE',
  olx: 'OLX',
  phone: 'PHONE',
  call: 'PHONE',
  звонок: 'PHONE',
  телефон: 'PHONE',
  "qo'ng'iroq": 'PHONE',
  walk_in: 'WALK_IN',
  'walk-in': 'WALK_IN',
  офис: 'WALK_IN',
  ofis: 'WALK_IN',
  referral: 'REFERRAL',
  рекомендация: 'REFERRAL',
  tavsiya: 'REFERRAL',
  other: 'OTHER',
  другое: 'OTHER',
  boshqa: 'OTHER',
};

const PROPERTY_SYNONYMS: Record<string, PropertyType> = {
  квартира: 'APARTMENT',
  kvartira: 'APARTMENT',
  дом: 'HOUSE',
  hovli: 'HOUSE',
  uy: 'HOUSE',
  коммерческая: 'COMMERCIAL',
  tijorat: 'COMMERCIAL',
  участок: 'LAND',
  "yer uchastka": 'LAND',
  другое: 'OTHER',
  boshqa: 'OTHER',
};

const HEADER_SYNONYMS: Record<string, string> = {
  name: 'name',
  fullname: 'name',
  full_name: 'name',
  имя: 'name',
  phone: 'phone',
  телефон: 'phone',
  source: 'source',
  источник: 'source',
  message: 'message',
  сообщение: 'message',
  budgetamount: 'budgetAmount',
  budgetcurrency: 'budgetCurrency',
  district: 'district',
  район: 'district',
  propertytype: 'propertyType',
  rooms: 'rooms',
  комнаты: 'rooms',
  assigneeemail: 'assigneeEmail',
  receivedat: 'receivedAt',
  firstresponseat: 'firstResponseAt',
  externalid: 'externalId',
};

export function resolveSource(raw: string): LeadSource | null {
  const v = normalizeApostrophes(raw).trim().toLowerCase();
  const upper = v.toUpperCase();
  if ((LEAD_SOURCES as readonly string[]).includes(upper)) return upper as LeadSource;
  return SOURCE_SYNONYMS[v] ?? null;
}

export function resolveDistrict(raw: string): District | null {
  const v = normalizeApostrophes(raw).trim().toLowerCase().replace(/\s+/g, ' ');
  for (const d of DISTRICTS) {
    if (d.code.toLowerCase() === v || d.aliases.includes(v)) return d.code;
    if (normalizeApostrophes(d.ru).toLowerCase() === v || normalizeApostrophes(d.uz).toLowerCase() === v) return d.code;
  }
  return null;
}

export function resolvePropertyType(raw: string): PropertyType | null {
  const v = raw.trim().toLowerCase();
  const upper = v.toUpperCase();
  if ((PROPERTY_TYPES as readonly string[]).includes(upper)) return upper as PropertyType;
  return PROPERTY_SYNONYMS[v] ?? null;
}

/** `YYYY-MM-DD HH:mm` (Asia/Tashkent) or ISO 8601 with offset. */
export function parseCsvDate(raw: string): Date | null {
  const v = raw.trim();
  const local = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::\d{2})?$/.exec(v);
  if (local) {
    const [, y, mo, d, h, mi] = local.map(Number) as [number, number, number, number, number, number];
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
    const date = zonedTimeToUtc({ year: y, month: mo, day: d, hour: h, minute: mi });
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(v)) {
    const date = new Date(v);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

/** Decodes the upload strictly as UTF-8 (AC-057). */
export function decodeCsv(buffer: Buffer): string {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    throw new AppException(415, 'UNSUPPORTED_FILE', CSV_ENCODING_MESSAGE);
  }
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function detectDelimiter(text: string): ',' | ';' | null {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const commas = (firstLine.match(/,/g) ?? []).length;
  const semis = (firstLine.match(/;/g) ?? []).length;
  if (commas === 0 && semis === 0) return null;
  return semis > commas ? ';' : ',';
}

export interface ParsedCsv {
  totalRows: number;
  rows: CsvLeadRowNormalized[];
  errors: CsvRowError[];
}

/**
 * Parses and validates a CSV upload (FR-060/FR-061). Row numbers are 1-based data rows + 1
 * (row 2 = first data row, as in a spreadsheet). DB-dependent checks are done by the caller.
 */
export function parseLeadsCsv(buffer: Buffer, now: Date): ParsedCsv {
  const text = decodeCsv(buffer);
  const delimiter = detectDelimiter(text);
  if (!delimiter) throw new AppException(400, 'CSV_INVALID', CSV_ENCODING_MESSAGE);
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    delimiter,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => HEADER_SYNONYMS[h.trim().toLowerCase()] ?? h.trim(),
  });
  const headers = parsed.meta.fields ?? [];
  if (!headers.includes('source') || !(headers.includes('name') || headers.includes('phone'))) {
    throw new AppException(400, 'CSV_INVALID', 'Required headers: source and name or phone', [
      { path: 'file', code: 'missing_headers', message: 'Required headers: source and name or phone' },
    ]);
  }
  if (parsed.data.length > CSV_MAX_ROWS) {
    throw new AppException(400, 'CSV_INVALID', `Too many rows (max ${CSV_MAX_ROWS})`, [
      { path: 'file', code: 'too_many_rows', message: `Too many rows (max ${CSV_MAX_ROWS})` },
    ]);
  }

  const rows: CsvLeadRowNormalized[] = [];
  const errors: CsvRowError[] = [];
  parsed.data.forEach((raw, idx) => {
    const row = idx + 2;
    const get = (k: string) => (raw[k] ?? '').trim();
    const rowErrors: CsvRowError[] = [];
    const err = (column: string, code: string) => rowErrors.push({ row, column, code });

    const fullName = get('name') || null;
    if (fullName && fullName.length > 100) err('name', 'too_long');

    let phone: string | null = null;
    if (get('phone')) {
      const p = normalizePhone(get('phone'));
      if (p.ok) phone = p.value;
      else err('phone', 'invalid_phone');
    }
    if (!fullName && !get('phone')) err('name', 'name_or_phone_required');

    const source = resolveSource(get('source'));
    if (!source) err('source', get('source') ? 'invalid_source' : 'required');

    const message = get('message') || null;
    if (message && message.length > 4000) err('message', 'too_long');

    let budget: CsvLeadRowNormalized['budget'] = null;
    const amountRaw = get('budgetAmount').replace(/[\s\u00a0]/g, '');
    const currencyRaw = get('budgetCurrency').toUpperCase();
    if (amountRaw || currencyRaw) {
      if (!/^[1-9]\d{0,14}$/.test(amountRaw)) err('budgetAmount', 'invalid_amount');
      else if (!(CURRENCIES as readonly string[]).includes(currencyRaw)) err('budgetCurrency', 'invalid_currency');
      else budget = { amount: amountRaw, currency: currencyRaw as Currency };
    }

    let district: District | null = null;
    if (get('district')) {
      district = resolveDistrict(get('district'));
      if (!district) err('district', 'invalid_district');
    }

    let propertyType: PropertyType | null = null;
    if (get('propertyType')) {
      propertyType = resolvePropertyType(get('propertyType'));
      if (!propertyType) err('propertyType', 'invalid_property_type');
    }

    let rooms: number | null = null;
    if (get('rooms')) {
      const n = Number(get('rooms'));
      if (!Number.isInteger(n) || n < 1 || n > 10) err('rooms', 'invalid_rooms');
      else rooms = n;
    }

    const assigneeEmail = get('assigneeEmail').toLowerCase() || null;
    if (assigneeEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(assigneeEmail)) err('assigneeEmail', 'invalid_email');

    let receivedAt: Date | null = null;
    if (get('receivedAt')) {
      receivedAt = parseCsvDate(get('receivedAt'));
      if (!receivedAt) err('receivedAt', 'invalid_date');
      else if (receivedAt.getTime() > now.getTime()) err('receivedAt', 'in_future');
      else if (now.getTime() - receivedAt.getTime() > MAX_HISTORY_MS) err('receivedAt', 'too_old');
    }

    let firstResponseAt: Date | null = null;
    if (get('firstResponseAt')) {
      firstResponseAt = parseCsvDate(get('firstResponseAt'));
      if (!firstResponseAt) err('firstResponseAt', 'invalid_date');
      else if (firstResponseAt.getTime() > now.getTime()) err('firstResponseAt', 'in_future');
      else if (firstResponseAt.getTime() < (receivedAt ?? now).getTime()) err('firstResponseAt', 'before_received');
    }

    const externalId = get('externalId') || null;
    if (externalId && externalId.length > 100) err('externalId', 'too_long');

    if (rowErrors.length > 0 || !source) {
      errors.push(...rowErrors);
      return;
    }
    rows.push({
      row,
      fullName,
      phone,
      source,
      message,
      budget,
      district,
      propertyType,
      rooms,
      assigneeEmail,
      receivedAt: receivedAt?.toISOString() ?? null,
      firstResponseAt: firstResponseAt?.toISOString() ?? null,
      externalId,
    });
  });
  return { totalRows: parsed.data.length, rows, errors };
}
