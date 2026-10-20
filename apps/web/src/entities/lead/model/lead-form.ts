import {
  CURRENCIES,
  DISTRICT_CODES,
  LEAD_SOURCES,
  PROPERTY_TYPES,
  normalizePhone,
  type CreateLeadInput,
  type LeadDto,
  type UpdateLeadRequest,
} from '@vippi/shared';
import { z } from 'zod';

const optionalEnum = <T extends readonly [string, ...string[]]>(values: T) => z.union([z.literal(''), z.enum(values)]);

/** Form-level mirror of CreateLeadSchema (string inputs); the API re-validates with the shared schema. */
export const leadFormSchema = z
  .object({
    fullName: z.string().trim().max(100, { message: 'too_long' }),
    phone: z
      .string()
      .trim()
      .max(32, { message: 'too_long' })
      .refine((v) => v === '' || normalizePhone(v).ok, { message: 'invalid_phone' }),
    source: z.enum(LEAD_SOURCES),
    sourceDetail: z.string().trim().max(100, { message: 'too_long' }),
    message: z.string().max(4000, { message: 'too_long' }),
    budgetAmount: z
      .string()
      .transform((v) => v.replace(/[\s\u00A0]/g, ''))
      .refine((v) => v === '' || /^[1-9]\d{0,14}$/.test(v), { message: 'invalid_amount' }),
    budgetCurrency: z.enum(CURRENCIES),
    district: optionalEnum(DISTRICT_CODES),
    propertyType: optionalEnum(PROPERTY_TYPES),
    rooms: z.string().refine((v) => v === '' || /^(10|[1-9])$/.test(v), { message: 'invalid_rooms' }),
    assigneeId: z.string(),
  })
  .refine((v) => v.fullName !== '' || v.phone !== '', { path: ['fullName'], message: 'name_or_phone_required' });

export type LeadFormInput = z.input<typeof leadFormSchema>;
export type LeadFormValues = z.output<typeof leadFormSchema>;

export const emptyLeadForm: LeadFormInput = {
  fullName: '',
  phone: '',
  source: 'INSTAGRAM',
  sourceDetail: '',
  message: '',
  budgetAmount: '',
  budgetCurrency: 'UZS',
  district: '',
  propertyType: '',
  rooms: '',
  assigneeId: '',
};

export function leadToForm(lead: LeadDto): LeadFormInput {
  return {
    fullName: lead.fullName ?? '',
    phone: lead.phone ?? '',
    source: lead.source,
    sourceDetail: lead.sourceDetail ?? '',
    message: lead.message ?? '',
    budgetAmount: lead.budget?.amount ?? '',
    budgetCurrency: lead.budget?.currency ?? 'UZS',
    district: lead.district ?? '',
    propertyType: lead.propertyType ?? '',
    rooms: lead.rooms ? String(lead.rooms) : '',
    assigneeId: lead.assignee?.id ?? '',
  };
}

const orUndefined = (v: string) => (v === '' ? undefined : v);

export function formToCreateRequest(v: LeadFormValues): CreateLeadInput {
  return {
    fullName: orUndefined(v.fullName),
    phone: orUndefined(v.phone),
    source: v.source,
    sourceDetail: orUndefined(v.sourceDetail),
    message: orUndefined(v.message),
    budget: v.budgetAmount ? { amount: v.budgetAmount, currency: v.budgetCurrency } : undefined,
    district: v.district || undefined,
    propertyType: v.propertyType || undefined,
    rooms: v.rooms ? Number(v.rooms) : undefined,
    assigneeId: orUndefined(v.assigneeId),
  };
}

/** PATCH body: empty strings clear the field (null). Source is sent only if editable. */
export function formToUpdateRequest(v: LeadFormValues, sourceEditable: boolean): Record<string, unknown> {
  const body: Omit<UpdateLeadRequest, 'phone'> & { phone?: string | null } = {
    fullName: v.fullName || null,
    phone: v.phone || null,
    sourceDetail: v.sourceDetail || null,
    message: v.message || null,
    budget: v.budgetAmount ? { amount: v.budgetAmount, currency: v.budgetCurrency } : null,
    district: v.district || null,
    propertyType: v.propertyType || null,
    rooms: v.rooms ? Number(v.rooms) : null,
  };
  if (sourceEditable) body.source = v.source;
  return body;
}
