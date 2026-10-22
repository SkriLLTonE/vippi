import { z } from 'zod';
import type { Currency, IndustryPreset, LeadStatus, Locale } from '../enums.js';
import { CURRENCIES } from '../enums.js';
import type { Industry } from '../industries.js';

// ---------------------------------------------------------------- localized labels

const labelText = (max: number) => z.string().trim().max(max, { message: 'too_long' });

/** ru/uz label; at least one language must be filled, the other falls back to it. */
export function localizedLabelSchema(max: number) {
  return z
    .object({ ru: labelText(max).optional(), uz: labelText(max).optional() })
    .strict()
    .refine((v) => Boolean(v.ru?.trim() || v.uz?.trim()), { message: 'required' });
}

export interface LocalizedLabel {
  ru?: string | undefined;
  uz?: string | undefined;
}

export function localizedLabel(label: LocalizedLabel | null | undefined, locale: Locale): string | null {
  if (!label) return null;
  const other: Locale = locale === 'ru' ? 'uz' : 'ru';
  return label[locale]?.trim() || label[other]?.trim() || null;
}

// ---------------------------------------------------------------- custom lead fields (ADR-024)

export const LEAD_FIELD_TYPES = ['text', 'number', 'money', 'single_select'] as const;
export type LeadFieldType = (typeof LEAD_FIELD_TYPES)[number];

export const MAX_LEAD_FIELDS = 8;
export const MAX_LEAD_FIELD_OPTIONS = 30;
export const LEAD_FIELD_LABEL_MAX = 60;
export const LEAD_ATTRIBUTE_TEXT_MAX = 500;

const fieldKeySchema = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,31}$/, { message: 'invalid_key' });

const fieldOptionSchema = z
  .object({ value: fieldKeySchema, label: localizedLabelSchema(LEAD_FIELD_LABEL_MAX) })
  .strict();

const fieldOptionsSchema = z
  .array(fieldOptionSchema)
  .min(1, { message: 'options_required' })
  .max(MAX_LEAD_FIELD_OPTIONS)
  .refine((opts) => new Set(opts.map((o) => o.value)).size === opts.length, { message: 'duplicate_option' });

export const LeadFieldDefSchema = z
  .object({
    key: fieldKeySchema,
    label: localizedLabelSchema(LEAD_FIELD_LABEL_MAX),
    type: z.enum(LEAD_FIELD_TYPES),
    required: z.boolean().default(false),
    showInCreate: z.boolean().default(true),
    options: fieldOptionsSchema.optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.type === 'single_select' && !v.options)
      ctx.addIssue({ code: 'custom', path: ['options'], message: 'options_required' });
    if (v.type !== 'single_select' && v.options)
      ctx.addIssue({ code: 'custom', path: ['options'], message: 'options_not_allowed' });
  });
export type LeadFieldDef = z.output<typeof LeadFieldDefSchema>;
export type CreateLeadFieldRequest = z.input<typeof LeadFieldDefSchema>;

/** Key and type are immutable: stored values must stay valid for their definition. */
export const UpdateLeadFieldSchema = z
  .object({
    label: localizedLabelSchema(LEAD_FIELD_LABEL_MAX).optional(),
    required: z.boolean().optional(),
    showInCreate: z.boolean().optional(),
    options: fieldOptionsSchema.optional(),
  })
  .strict();
export type UpdateLeadFieldRequest = z.infer<typeof UpdateLeadFieldSchema>;

/** Parses definitions stored in `Organization.leadFieldDefs`; invalid storage yields no fields. */
export function parseLeadFieldDefs(raw: unknown): LeadFieldDef[] {
  const r = z.array(LeadFieldDefSchema).max(MAX_LEAD_FIELDS).safeParse(raw);
  return r.success ? r.data : [];
}

// ---------------------------------------------------------------- attribute values

export const attributeMoneySchema = z
  .object({
    amount: z.string().regex(/^[1-9]\d{0,14}$/, { message: 'invalid_amount' }),
    currency: z.enum(CURRENCIES),
  })
  .strict();

export type LeadAttributeValue = string | number | { amount: string; currency: Currency };
export type LeadAttributes = Record<string, LeadAttributeValue>;

/** Static shape accepted by lead endpoints; per-organization rules are applied by `validateLeadAttributes`. */
export const leadAttributesInputSchema = z.record(z.string().max(32), z.unknown()).refine((v) => Object.keys(v).length <= 32, {
  message: 'too_many_attributes',
});

function attributeValueSchema(def: LeadFieldDef): z.ZodType<LeadAttributeValue> {
  switch (def.type) {
    case 'text':
      return z.string().trim().min(1).max(LEAD_ATTRIBUTE_TEXT_MAX);
    case 'number':
      return z.number().min(-1e12).max(1e12);
    case 'money':
      return attributeMoneySchema;
    case 'single_select': {
      const values = (def.options ?? []).map((o) => o.value);
      return values.length ? z.enum(values as [string, ...string[]]) : z.never();
    }
  }
}

/**
 * `create` — full set, `required` enforced; `import` — full set, `required` not enforced (intake/CSV);
 * `patch` — only provided keys, `null` clears a value (rejected for required fields).
 */
export type AttributesMode = 'create' | 'import' | 'patch';

export function buildLeadAttributesSchema(defs: readonly LeadFieldDef[], mode: AttributesMode) {
  const shape: Record<string, z.ZodType> = {};
  for (const def of defs) {
    const value = attributeValueSchema(def);
    if (mode === 'patch') shape[def.key] = def.required ? value.optional() : value.nullable().optional();
    else shape[def.key] = mode === 'create' && def.required ? value : value.optional();
  }
  return z.object(shape).strict();
}

export type AttributeIssueCode = 'unknown_field' | 'invalid_value' | 'required';
export interface AttributeIssue {
  /** `attributes.<key>` */
  path: string;
  code: AttributeIssueCode;
}

export type AttributesResult =
  | { ok: true; value: Record<string, LeadAttributeValue | null> }
  | { ok: false; issues: AttributeIssue[] };

/** Validates lead attributes against the organization's field definitions (unknown keys rejected). */
export function validateLeadAttributes(
  defs: readonly LeadFieldDef[],
  input: Record<string, unknown> | undefined,
  mode: AttributesMode,
): AttributesResult {
  const data = input ?? {};
  const r = buildLeadAttributesSchema(defs, mode).safeParse(data);
  if (r.success) {
    const value: Record<string, LeadAttributeValue | null> = {};
    for (const [k, v] of Object.entries(r.data as Record<string, LeadAttributeValue | null | undefined>)) {
      if (v !== undefined) value[k] = v;
    }
    return { ok: true, value };
  }
  const issues: AttributeIssue[] = [];
  for (const issue of r.error.issues) {
    if (issue.code === 'unrecognized_keys') {
      for (const key of issue.keys) issues.push({ path: `attributes.${key}`, code: 'unknown_field' });
      continue;
    }
    const key = String(issue.path[0] ?? '');
    const missing = data[key] === undefined || (mode === 'patch' && data[key] === null);
    issues.push({ path: `attributes.${key}`, code: missing ? 'required' : 'invalid_value' });
  }
  return { ok: false, issues };
}

/** Values of active definitions only: values of removed fields stay stored but hidden. */
export function visibleAttributes(defs: readonly LeadFieldDef[], stored: unknown): LeadAttributes {
  const out: LeadAttributes = {};
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return out;
  const rec = stored as Record<string, unknown>;
  for (const def of defs) {
    const v = rec[def.key];
    if (v !== undefined && v !== null) out[def.key] = v as LeadAttributeValue;
  }
  return out;
}

// ---------------------------------------------------------------- status labels (ADR-024)

/** Only final statuses get per-organization labels; codes and the status machine stay fixed. */
export const OVERRIDABLE_STATUSES = ['WON', 'LOST'] as const satisfies readonly LeadStatus[];
export type OverridableStatus = (typeof OVERRIDABLE_STATUSES)[number];
export const STATUS_LABEL_MAX = 30;

export const StatusLabelsSchema = z
  .object({
    WON: localizedLabelSchema(STATUS_LABEL_MAX).optional(),
    LOST: localizedLabelSchema(STATUS_LABEL_MAX).optional(),
  })
  .strict();
export type StatusLabels = z.infer<typeof StatusLabelsSchema>;

export function parseStatusLabels(raw: unknown): StatusLabels {
  const r = StatusLabelsSchema.safeParse(raw);
  return r.success ? r.data : {};
}

/** Organization-level lead configuration shared by `/auth/me` and `/organization`. */
export interface OrgLeadConfig {
  /** ADR-025: catalog code; `industryPreset` is derived from it. */
  industry: Industry;
  industryPreset: IndustryPreset;
  leadFields: LeadFieldDef[];
  statusLabels: StatusLabels;
}
