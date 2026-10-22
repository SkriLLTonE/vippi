import { describe, expect, it } from 'vitest';
import {
  LeadFieldDefSchema,
  RegisterOrganizationSchema,
  StatusLabelsSchema,
  UpdateOrganizationSchema,
  localizedLabel,
  parseLeadFieldDefs,
  validateLeadAttributes,
  visibleAttributes,
  type LeadFieldDef,
} from './index.js';

const defs: LeadFieldDef[] = [
  { key: 'service', label: { ru: 'Услуга', uz: 'Xizmat' }, type: 'single_select', required: true, showInCreate: true, options: [
    { value: 'cleaning', label: { ru: 'Чистка' } },
    { value: 'implant', label: { ru: 'Имплант' } },
  ] },
  { key: 'preferredTime', label: { ru: 'Удобное время' }, type: 'text', required: false, showInCreate: true },
  { key: 'visits', label: { ru: 'Визиты' }, type: 'number', required: false, showInCreate: false },
  { key: 'deposit', label: { ru: 'Предоплата' }, type: 'money', required: false, showInCreate: false },
];

describe('LeadFieldDefSchema', () => {
  it('applies defaults and accepts a valid select field', () => {
    const r = LeadFieldDefSchema.parse({
      key: 'service',
      label: { ru: 'Услуга' },
      type: 'single_select',
      options: [{ value: 'a', label: { uz: 'A' } }],
    });
    expect(r.required).toBe(false);
    expect(r.showInCreate).toBe(true);
  });

  it('requires options only for single_select', () => {
    expect(LeadFieldDefSchema.safeParse({ key: 'x', label: { ru: 'X' }, type: 'single_select' }).success).toBe(false);
    expect(
      LeadFieldDefSchema.safeParse({ key: 'x', label: { ru: 'X' }, type: 'text', options: [{ value: 'a', label: { ru: 'A' } }] })
        .success,
    ).toBe(false);
  });

  it('rejects bad keys, empty labels and duplicate options', () => {
    expect(LeadFieldDefSchema.safeParse({ key: '1abc', label: { ru: 'X' }, type: 'text' }).success).toBe(false);
    expect(LeadFieldDefSchema.safeParse({ key: 'a-b', label: { ru: 'X' }, type: 'text' }).success).toBe(false);
    expect(LeadFieldDefSchema.safeParse({ key: 'abc', label: { ru: ' ', uz: '' }, type: 'text' }).success).toBe(false);
    const dup = [
      { value: 'a', label: { ru: 'A' } },
      { value: 'a', label: { ru: 'B' } },
    ];
    expect(LeadFieldDefSchema.safeParse({ key: 'abc', label: { ru: 'X' }, type: 'single_select', options: dup }).success).toBe(false);
  });

  it('parseLeadFieldDefs drops corrupt storage instead of throwing', () => {
    expect(parseLeadFieldDefs(defs)).toHaveLength(4);
    expect(parseLeadFieldDefs({ nope: true })).toEqual([]);
  });
});

describe('validateLeadAttributes', () => {
  it('accepts valid values of every type', () => {
    const r = validateLeadAttributes(
      defs,
      { service: 'implant', preferredTime: ' после 18:00 ', visits: 2, deposit: { amount: '500000', currency: 'UZS' } },
      'create',
    );
    expect(r).toEqual({
      ok: true,
      value: { service: 'implant', preferredTime: 'после 18:00', visits: 2, deposit: { amount: '500000', currency: 'UZS' } },
    });
  });

  it('rejects unknown keys', () => {
    const r = validateLeadAttributes(defs, { service: 'implant', district: 'X' }, 'create');
    expect(r).toEqual({ ok: false, issues: [{ path: 'attributes.district', code: 'unknown_field' }] });
  });

  it('rejects wrong types and unknown options', () => {
    const r = validateLeadAttributes(defs, { service: 'surgery', visits: 'two', deposit: { amount: '0', currency: 'UZS' } }, 'create');
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(r.issues).toEqual(
        expect.arrayContaining([
          { path: 'attributes.service', code: 'invalid_value' },
          { path: 'attributes.visits', code: 'invalid_value' },
          { path: 'attributes.deposit', code: 'invalid_value' },
        ]),
      );
  });

  it('enforces required on create, not on import', () => {
    expect(validateLeadAttributes(defs, {}, 'create')).toEqual({
      ok: false,
      issues: [{ path: 'attributes.service', code: 'required' }],
    });
    expect(validateLeadAttributes(defs, undefined, 'import')).toEqual({ ok: true, value: {} });
  });

  it('patch keeps only listed keys, null clears optional, required cannot be cleared', () => {
    expect(validateLeadAttributes(defs, { preferredTime: null }, 'patch')).toEqual({ ok: true, value: { preferredTime: null } });
    expect(validateLeadAttributes(defs, { service: null }, 'patch')).toEqual({
      ok: false,
      issues: [{ path: 'attributes.service', code: 'required' }],
    });
  });

  it('with no definitions every key is unknown', () => {
    expect(validateLeadAttributes([], { anything: 1 }, 'import')).toEqual({
      ok: false,
      issues: [{ path: 'attributes.anything', code: 'unknown_field' }],
    });
  });

  it('visibleAttributes hides values of removed definitions', () => {
    expect(visibleAttributes(defs.slice(1), { service: 'implant', preferredTime: 'утро', legacy: 1 })).toEqual({ preferredTime: 'утро' });
    expect(visibleAttributes(defs, null)).toEqual({});
  });
});

describe('industry preset and status labels', () => {
  const base = { organizationName: 'Smile Dent', fullName: 'Owner', email: 'o@example.test', password: 'long-password-1' };

  it('registration accepts an optional preset', () => {
    expect(RegisterOrganizationSchema.parse(base).industryPreset).toBeUndefined();
    expect(RegisterOrganizationSchema.parse({ ...base, industryPreset: 'GENERIC' }).industryPreset).toBe('GENERIC');
    expect(RegisterOrganizationSchema.safeParse({ ...base, industryPreset: 'CARS' }).success).toBe(false);
  });

  it('organization update accepts preset, WON/LOST labels and emailFrom', () => {
    expect(UpdateOrganizationSchema.safeParse({ industryPreset: 'GENERIC', statusLabels: { WON: { ru: 'Записался' } } }).success).toBe(true);
    expect(UpdateOrganizationSchema.safeParse({ emailFrom: 'leads@agency.test' }).success).toBe(true);
    expect(UpdateOrganizationSchema.safeParse({ emailFrom: null }).success).toBe(true);
    expect(UpdateOrganizationSchema.safeParse({ emailFrom: 'not-an-email' }).success).toBe(false);
    expect(StatusLabelsSchema.safeParse({ NEW: { ru: 'Свежий' } }).success).toBe(false);
    expect(StatusLabelsSchema.safeParse({ WON: { ru: 'x'.repeat(31) } }).success).toBe(false);
  });

  it('localizedLabel falls back to the other language', () => {
    expect(localizedLabel({ ru: 'Записался' }, 'uz')).toBe('Записался');
    expect(localizedLabel({ ru: 'Записался', uz: 'Yozildi' }, 'uz')).toBe('Yozildi');
    expect(localizedLabel(undefined, 'ru')).toBeNull();
  });
});
