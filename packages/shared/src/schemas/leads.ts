import { z } from 'zod';
import type {
  ActivityType,
  ContactChannel,
  Currency,
  LeadCreatedVia,
  LeadSource,
  LeadStatus,
  LostReason,
  PropertyType,
  SlaState,
} from '../enums.js';
import {
  CONTACT_CHANNELS,
  CURRENCIES,
  LEAD_SOURCES,
  LEAD_STATUSES,
  LOST_REASONS,
  PROPERTY_TYPES,
  SLA_STATES,
} from '../enums.js';
import type { District } from '../districts.js';
import { DISTRICT_CODES } from '../districts.js';
import { normalizePhone } from '../text-normalize.js';
import { booleanQuery, csvEnum, dateOnlySchema, pageQuerySchema } from './common.js';

export const phoneSchema = z
  .string()
  .trim()
  .max(32)
  .transform((v, ctx) => {
    const r = normalizePhone(v);
    if (!r.ok) {
      ctx.addIssue({ code: 'custom', message: 'invalid_phone' });
      return z.NEVER;
    }
    return r.value;
  });

export const budgetSchema = z
  .object({
    amount: z.string().regex(/^[1-9]\d{0,14}$/, { message: 'invalid_amount' }),
    currency: z.enum(CURRENCIES),
  })
  .strict();

const leadFields = {
  fullName: z.string().trim().min(1).max(100).optional(),
  phone: phoneSchema.optional(),
  source: z.enum(LEAD_SOURCES),
  sourceDetail: z.string().trim().max(100).optional(),
  message: z.string().max(4000).optional(),
  budget: budgetSchema.optional(),
  district: z.enum(DISTRICT_CODES).optional(),
  propertyType: z.enum(PROPERTY_TYPES).optional(),
  rooms: z.number().int().min(1).max(10).optional(),
};

const nameOrPhone = (v: { fullName?: string | undefined; phone?: string | undefined }) =>
  Boolean(v.fullName?.trim()) || Boolean(v.phone);

export const CreateLeadSchema = z
  .object({ ...leadFields, assigneeId: z.uuid().optional() })
  .strict()
  .refine(nameOrPhone, { path: ['fullName'], message: 'name_or_phone_required' });
export type CreateLeadRequest = z.infer<typeof CreateLeadSchema>;
export type CreateLeadInput = z.input<typeof CreateLeadSchema>;

export const IntakeLeadSchema = z
  .object({ ...leadFields, externalId: z.string().trim().min(1).max(100).optional() })
  .strict()
  .refine(nameOrPhone, { path: ['fullName'], message: 'name_or_phone_required' });
export type IntakeLeadRequest = z.infer<typeof IntakeLeadSchema>;

export const UpdateLeadSchema = z
  .object({
    fullName: z.string().trim().min(1).max(100).nullable().optional(),
    phone: phoneSchema.nullable().optional(),
    source: z.enum(LEAD_SOURCES).optional(),
    sourceDetail: z.string().trim().max(100).nullable().optional(),
    message: z.string().max(4000).nullable().optional(),
    budget: budgetSchema.nullable().optional(),
    district: z.enum(DISTRICT_CODES).nullable().optional(),
    propertyType: z.enum(PROPERTY_TYPES).nullable().optional(),
    rooms: z.number().int().min(1).max(10).nullable().optional(),
  })
  .strict();
export type UpdateLeadRequest = z.infer<typeof UpdateLeadSchema>;

export const LEAD_SORTS = ['receivedAt', '-receivedAt', 'firstResponseDueAt', '-firstResponseDueAt'] as const;
export type LeadSort = (typeof LEAD_SORTS)[number];

export const MAX_PERIOD_DAYS = 366;

function periodDays(from: string, to: string): number {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;
}

const leadFilterFields = {
  status: csvEnum(LEAD_STATUSES).optional(),
  source: csvEnum(LEAD_SOURCES).optional(),
  assigneeId: z.union([z.literal('none'), z.literal('me'), z.uuid()]).optional(),
  slaState: csvEnum(SLA_STATES).optional(),
  forgotten: booleanQuery.optional(),
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
  q: z.string().trim().min(2).max(100).optional(),
  sort: z.enum(LEAD_SORTS).default('-receivedAt'),
};

const periodRefine = (v: { from?: string | undefined; to?: string | undefined }, ctx: z.RefinementCtx) => {
  if (v.from && v.to) {
    if (v.from > v.to) ctx.addIssue({ code: 'custom', path: ['from'], message: 'from_after_to' });
    else if (periodDays(v.from, v.to) > MAX_PERIOD_DAYS)
      ctx.addIssue({ code: 'custom', path: ['to'], message: 'period_too_long' });
  }
};

export const LeadListQuerySchema = pageQuerySchema.extend(leadFilterFields).strict().superRefine(periodRefine);
export type LeadListQuery = z.infer<typeof LeadListQuerySchema>;

export const LeadExportQuerySchema = z.object(leadFilterFields).strict().superRefine(periodRefine);
export type LeadExportQuery = z.infer<typeof LeadExportQuerySchema>;
export type LeadFilters = LeadExportQuery;

export const OverdueQuerySchema = pageQuerySchema
  .extend({ assigneeId: z.union([z.literal('none'), z.literal('me'), z.uuid()]).optional() })
  .strict();
export type OverdueQuery = z.infer<typeof OverdueQuerySchema>;

export const FirstContactSchema = z
  .object({
    channel: z.enum(CONTACT_CHANNELS),
    comment: z.string().trim().min(1).max(2000).optional(),
  })
  .strict();
export type FirstContactRequest = z.infer<typeof FirstContactSchema>;

export const ChangeStatusSchema = z
  .object({
    status: z.enum(['CONTACTED', 'QUALIFIED', 'WON', 'LOST']),
    lostReason: z.enum(LOST_REASONS).optional(),
    lostComment: z.string().trim().min(3).max(500).optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.status === 'LOST' && !v.lostReason)
      ctx.addIssue({ code: 'custom', path: ['lostReason'], message: 'lost_reason_required' });
    if (v.status === 'LOST' && v.lostReason === 'OTHER' && !v.lostComment)
      ctx.addIssue({ code: 'custom', path: ['lostComment'], message: 'lost_comment_required' });
  });
export type ChangeStatusRequest = z.infer<typeof ChangeStatusSchema>;

export const AssignLeadSchema = z.object({ assigneeId: z.uuid().nullable() }).strict();
export type AssignLeadRequest = z.infer<typeof AssignLeadSchema>;

export const CommentSchema = z
  .object({ body: z.string().trim().min(1, { message: 'required' }).max(2000, { message: 'too_long' }) })
  .strict();
export type CommentRequest = z.infer<typeof CommentSchema>;

export interface UserRef {
  id: string;
  fullName: string;
}

export interface LeadListItem {
  id: string;
  number: number;
  fullName: string | null;
  phone: string | null;
  source: LeadSource;
  messagePreview: string | null;
  status: LeadStatus;
  slaState: SlaState;
  firstResponseDueAt: string;
  firstResponseAt: string | null;
  isForgotten: boolean;
  assignee: UserRef | null;
  possibleDuplicate: boolean;
  receivedAt: string;
}

export interface OverdueLeadItem extends LeadListItem {
  overdueMinutes: number;
}

export interface LeadDto {
  id: string;
  number: number;
  fullName: string | null;
  phone: string | null;
  source: LeadSource;
  sourceDetail: string | null;
  message: string | null;
  budget: { amount: string; currency: Currency } | null;
  district: District | null;
  propertyType: PropertyType | null;
  rooms: number | null;
  status: LeadStatus;
  lostReason: LostReason | null;
  lostComment: string | null;
  assignee: UserRef | null;
  createdVia: LeadCreatedVia;
  externalId: string | null;
  receivedAt: string;
  firstResponseDueAt: string;
  firstResponseAt: string | null;
  firstResponseBy: UserRef | null;
  firstResponseChannel: ContactChannel | null;
  slaState: SlaState;
  slaBreachedAt: string | null;
  possibleDuplicateOf: { id: string; number: number } | null;
  isForgotten: boolean;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LeadActivityDto {
  id: string;
  type: ActivityType;
  actor: UserRef | null;
  body: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

export const CSV_TEMPLATE_HEADERS = [
  'name',
  'phone',
  'source',
  'message',
  'budgetAmount',
  'budgetCurrency',
  'district',
  'propertyType',
  'rooms',
  'assigneeEmail',
  'receivedAt',
  'firstResponseAt',
  'externalId',
] as const;

export const CSV_EXPORT_HEADERS = [
  'number',
  'receivedAt',
  'name',
  'phone',
  'source',
  'sourceDetail',
  'message',
  'budgetAmount',
  'budgetCurrency',
  'district',
  'propertyType',
  'rooms',
  'status',
  'lostReason',
  'slaState',
  'firstResponseDueAt',
  'firstResponseAt',
  'firstResponseChannel',
  'assigneeEmail',
  'assigneeName',
  'createdVia',
  'externalId',
  'possibleDuplicate',
] as const;

export const CSV_MAX_BYTES = 5 * 1024 * 1024;
export const CSV_MAX_ROWS = 5000;

export interface CsvRowError {
  row: number;
  column: string;
  code: string;
}

export interface CsvLeadRowNormalized {
  row: number;
  fullName: string | null;
  phone: string | null;
  source: LeadSource;
  message: string | null;
  budget: { amount: string; currency: Currency } | null;
  district: District | null;
  propertyType: PropertyType | null;
  rooms: number | null;
  assigneeEmail: string | null;
  receivedAt: string | null;
  firstResponseAt: string | null;
  externalId: string | null;
}

export interface CsvPreviewResult {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  errors: CsvRowError[];
  sample: CsvLeadRowNormalized[];
}

export interface CsvImportResult {
  imported: number;
  skipped: number;
  errors: CsvRowError[];
}
