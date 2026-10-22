import { describe, expect, it } from 'vitest';
import {
  INDUSTRIES,
  INDUSTRY_TEMPLATES,
  LeadFieldDefSchema,
  MAX_LEAD_FIELDS,
  RegisterOrganizationSchema,
  StatusLabelsSchema,
  UpdateOrganizationSchema,
  ApplyIndustryTemplateSchema,
  exampleLeadAttributes,
  planIndustryTemplate,
  resolveIndustry,
  validateLeadAttributes,
  type LeadFieldDef,
} from './index.js';

describe('industry catalog integrity (ADR-025)', () => {
  it('has a template for every code, keyed by its own code, ~10 industries', () => {
    expect(Object.keys(INDUSTRY_TEMPLATES).sort()).toEqual([...INDUSTRIES].sort());
    for (const code of INDUSTRIES) expect(INDUSTRY_TEMPLATES[code].code).toBe(code);
    expect(INDUSTRIES.length).toBeLessThanOrEqual(11);
  });

  it.each(INDUSTRIES)('%s: fields are valid, unique, fit the limit, have ru/uz labels', (code) => {
    const t = INDUSTRY_TEMPLATES[code];
    expect(t.fields.length).toBeLessThanOrEqual(MAX_LEAD_FIELDS);
    expect(t.fields.length).toBeLessThanOrEqual(6);
    const keys = t.fields.map((f) => f.key.toLowerCase());
    expect(new Set(keys).size).toBe(keys.length);
    for (const f of t.fields) {
      expect(LeadFieldDefSchema.parse(f)).toEqual(f);
      expect(f.label.ru?.trim()).toBeTruthy();
      expect(f.label.uz?.trim()).toBeTruthy();
      for (const o of f.options ?? []) {
        expect(o.label.ru?.trim()).toBeTruthy();
        expect(o.label.uz?.trim()).toBeTruthy();
      }
    }
  });

  it.each(INDUSTRIES)('%s: names, labels and sample are complete and valid', (code) => {
    const t = INDUSTRY_TEMPLATES[code];
    for (const text of [t.name, t.sample.message]) {
      expect(text.ru.trim()).toBeTruthy();
      expect(text.uz.trim()).toBeTruthy();
    }
    expect(StatusLabelsSchema.parse(t.statusLabels)).toEqual(t.statusLabels);
    for (const label of Object.values(t.statusLabels)) {
      expect(label.ru?.trim()).toBeTruthy();
      expect(label.uz?.trim()).toBeTruthy();
    }
    expect(validateLeadAttributes(t.fields, t.sample.attributes, 'create')).toMatchObject({ ok: true });
    if (t.fields.length > 0) expect(t.ai?.hint).toBeTruthy();
  });

  it('only REAL_ESTATE uses the real-estate preset and built-in sample columns', () => {
    for (const code of INDUSTRIES) {
      const t = INDUSTRY_TEMPLATES[code];
      expect(t.preset).toBe(code === 'REAL_ESTATE' ? 'REAL_ESTATE' : 'GENERIC');
      expect(Boolean(t.sample.realEstate)).toBe(code === 'REAL_ESTATE');
    }
    expect(INDUSTRY_TEMPLATES.REAL_ESTATE.fields).toEqual([]);
    expect(INDUSTRY_TEMPLATES.OTHER.fields).toEqual([]);
  });
});

describe('resolveIndustry (legacy mapping)', () => {
  it('maps legacy presets and keeps valid codes consistent with the preset', () => {
    expect(resolveIndustry(undefined, 'GENERIC')).toBe('OTHER');
    expect(resolveIndustry('REAL_ESTATE', 'GENERIC')).toBe('OTHER');
    expect(resolveIndustry('DENTAL_CLINIC', 'GENERIC')).toBe('DENTAL_CLINIC');
    expect(resolveIndustry('DENTAL_CLINIC', 'REAL_ESTATE')).toBe('REAL_ESTATE');
    expect(resolveIndustry('UNKNOWN', 'REAL_ESTATE')).toBe('REAL_ESTATE');
  });
});

describe('planIndustryTemplate', () => {
  const dental = INDUSTRY_TEMPLATES.DENTAL_CLINIC;
  const custom = (key: string): LeadFieldDef => ({ key, label: { ru: key }, type: 'text', required: true, showInCreate: false });

  it('adds missing fields, keeps existing definitions untouched (case-insensitive keys)', () => {
    const mine = { ...custom('Service'), label: { ru: 'Моя услуга' } };
    const plan = planIndustryTemplate(dental, { leadFields: [mine], statusLabels: {} });
    expect(plan.existingFields).toEqual(['service']);
    expect(plan.addedFields).toEqual(['preferredTime', 'visitType']);
    expect(plan.fields[0]).toBe(mine);
    expect(plan.fields).toHaveLength(3);
  });

  it('respects the field limit', () => {
    const seven = Array.from({ length: 7 }, (_, i) => custom(`f${i}`));
    const plan = planIndustryTemplate(dental, { leadFields: seven, statusLabels: {} });
    expect(plan.addedFields).toEqual(['service']);
    expect(plan.skippedFields).toEqual(['preferredTime', 'visitType']);
    expect(plan.fields).toHaveLength(MAX_LEAD_FIELDS);
  });

  it('fills empty labels, keeps customized ones unless overwrite is confirmed', () => {
    const current = { leadFields: [], statusLabels: { LOST: { ru: 'Слился' } } };
    const keep = planIndustryTemplate(dental, current);
    expect(keep.statusLabels).toEqual({ WON: dental.statusLabels.WON, LOST: { ru: 'Слился' } });
    expect(keep.statusLabelsChanged).toEqual(['WON']);
    expect(keep.statusLabelsKept).toEqual(['LOST']);
    const overwrite = planIndustryTemplate(dental, current, { overwriteStatusLabels: true });
    expect(overwrite.statusLabels).toEqual(dental.statusLabels);
    expect(overwrite.statusLabelsChanged).toEqual(['WON', 'LOST']);
  });

  it('labels left from the previous template are replaced without confirmation', () => {
    const beauty = INDUSTRY_TEMPLATES.BEAUTY_SALON;
    const education = INDUSTRY_TEMPLATES.EDUCATION;
    const plan = planIndustryTemplate(education, { leadFields: beauty.fields, statusLabels: beauty.statusLabels }, { previous: beauty });
    expect(plan.statusLabels.WON).toEqual(education.statusLabels.WON);
    expect(plan.statusLabelsChanged).toEqual(['WON']);
    expect(plan.statusLabelsKept).toEqual([]);
    const edited = { ...beauty.statusLabels, WON: { ru: 'Пришла', uz: 'Keldi' } };
    expect(planIndustryTemplate(education, { leadFields: [], statusLabels: edited }, { previous: beauty }).statusLabelsKept).toEqual(['WON']);
  });

  it('is a no-op when the template is already applied', () => {
    const once = planIndustryTemplate(dental, { leadFields: [], statusLabels: {} });
    const twice = planIndustryTemplate(dental, { leadFields: once.fields, statusLabels: once.statusLabels });
    expect(twice.addedFields).toEqual([]);
    expect(twice.statusLabelsChanged).toEqual([]);
    expect(twice.statusLabelsKept).toEqual([]);
  });
});

describe('exampleLeadAttributes', () => {
  it('uses template sample values and typed placeholders for other fields', () => {
    const defs: LeadFieldDef[] = [
      ...INDUSTRY_TEMPLATES.DENTAL_CLINIC.fields.slice(0, 1),
      { key: 'deposit', label: { ru: 'Предоплата' }, type: 'money', required: false, showInCreate: true },
      { key: 'note', label: { ru: 'Заметка', uz: 'Izoh' }, type: 'text', required: false, showInCreate: true },
    ];
    const ex = exampleLeadAttributes(defs, 'DENTAL_CLINIC', 'uz');
    expect(ex).toEqual({ service: 'cleaning', deposit: { amount: '1000000', currency: 'UZS' }, note: 'Izoh' });
    expect(validateLeadAttributes(defs, ex, 'create')).toMatchObject({ ok: true });
  });

  it('falls back when a sample value is not valid for a customized definition', () => {
    const def: LeadFieldDef = {
      key: 'service',
      label: { ru: 'Услуга' },
      type: 'single_select',
      required: false,
      showInCreate: true,
      options: [{ value: 'x', label: { ru: 'X' } }],
    };
    expect(exampleLeadAttributes([def], 'DENTAL_CLINIC', 'ru')).toEqual({ service: 'x' });
  });
});

describe('industry request schemas', () => {
  const base = { organizationName: 'Smile', fullName: 'Owner', email: 'o@example.test', password: 'long-password-1' };
  it('accepts catalog codes and the legacy preset, rejects unknown codes', () => {
    expect(RegisterOrganizationSchema.safeParse({ ...base, industry: 'BEAUTY_SALON' }).success).toBe(true);
    expect(RegisterOrganizationSchema.safeParse({ ...base, industryPreset: 'GENERIC' }).success).toBe(true);
    expect(RegisterOrganizationSchema.safeParse({ ...base, industry: 'SPACE' }).success).toBe(false);
    expect(UpdateOrganizationSchema.safeParse({ industry: 'AUTO' }).success).toBe(true);
    expect(ApplyIndustryTemplateSchema.parse({ industry: 'AUTO' })).toEqual({ industry: 'AUTO', overwriteStatusLabels: false });
    expect(ApplyIndustryTemplateSchema.safeParse({ industry: 'AUTO', extra: 1 }).success).toBe(false);
  });
});
