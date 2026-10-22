import { LeadAnalysisSchema, ReplyDraftSchema } from '@vippi/shared';
import { describe, expect, it } from 'vitest';
import { ruleBasedAnalysis } from '../../src/modules/ai/fallback/rules.js';
import { templateReply } from '../../src/modules/ai/fallback/templates.js';
import {
  genericLeadAnalysisPrompt,
  genericReplyDraftPrompt,
  leadAnalysisPrompt,
  promptVersion,
  replyDraftPrompt,
} from '../../src/modules/ai/prompts/prompts.js';

const RE_WORDS = /район|tuman|комнат|xona|недвижим|ko'chmas|koʻchmas|квартир|kvartira|участ|hovli/i;

describe('rule-based analysis for the GENERIC preset (ADR-024)', () => {
  const message = 'Здравствуйте, хочу записаться на чистку зубов, 2 xonali kvartira в Юнусабаде, бюджет 500 тыс сум';
  const input = { source: 'INSTAGRAM' as const, message, name: 'Анна', hasPhone: true };

  it.each(['ru', 'uz'] as const)('never extracts or asks about district, rooms or property type (%s)', (locale) => {
    const a = ruleBasedAnalysis(input, locale, 'GENERIC');
    expect(LeadAnalysisSchema.safeParse(a).success).toBe(true);
    expect(a.district).toBeNull();
    expect(a.propertyType).toBeNull();
    expect(a.rooms).toBeNull();
    for (const q of [...a.nextQuestions, ...a.missingInfo]) expect(q).not.toMatch(RE_WORDS);
  });

  it('still extracts the budget, which is visible for every preset', () => {
    expect(ruleBasedAnalysis(input, 'ru', 'GENERIC').budget).toEqual({ amount: 500_000, currency: 'UZS' });
  });

  it('gives no score bonus for real-estate details that the real-estate preset rewards', () => {
    const generic = ruleBasedAnalysis(input, 'ru', 'GENERIC');
    const realEstate = ruleBasedAnalysis(input, 'ru', 'REAL_ESTATE');
    expect(realEstate.score - generic.score).toBe(20);
    expect(generic.reasons.join(' ')).not.toMatch(/район|тип объекта/i);
  });

  it('asks about empty custom fields first', () => {
    const a = ruleBasedAnalysis({ ...input, message: 'Хочу к вам', missingFields: ['Услуга', 'Удобное время'] }, 'ru', 'GENERIC');
    expect(a.missingInfo).toEqual(['Услуга', 'Удобное время', 'Бюджет']);
    expect(a.nextQuestions).toEqual(['Уточните, пожалуйста: Услуга?', 'Уточните, пожалуйста: Удобное время?', expect.any(String)]);
  });

  it('defaults to the real-estate behaviour without a preset', () => {
    expect(ruleBasedAnalysis(input, 'ru').district).toBe('YUNUSOBOD');
  });
});

describe('reply template for the GENERIC preset', () => {
  const base = {
    name: 'Анна',
    companyName: 'Smile Dent',
    managerName: 'Дилноза',
    analysis: { budget: null, district: null, propertyType: null, rooms: null },
    preset: 'GENERIC' as const,
  };

  it.each([
    ['ru', 'FORMAL'],
    ['ru', 'FRIENDLY'],
    ['uz', 'FORMAL'],
    ['uz', 'FRIENDLY'],
  ] as const)('%s/%s has no real-estate wording and stays valid', (lang, tone) => {
    const d = templateReply(base, lang, tone);
    expect(ReplyDraftSchema.safeParse(d).success).toBe(true);
    expect(d.text).not.toMatch(RE_WORDS);
    expect(d.text).not.toMatch(/подобрать варианты/);
  });

  it('asks about a missing custom field', () => {
    expect(templateReply({ ...base, missingFields: ['Услуга'] }, 'ru', 'FORMAL').text).toContain('услуга?');
  });
});

describe('prompt versions', () => {
  it('generic prompts have their own cache keys; real-estate prompts are unchanged', () => {
    expect(promptVersion(leadAnalysisPrompt)).toBe('lead-analysis@2');
    expect(promptVersion(replyDraftPrompt)).toBe('reply-draft@2');
    expect(promptVersion(genericLeadAnalysisPrompt)).toBe('lead-analysis-generic@1');
    expect(promptVersion(genericReplyDraftPrompt)).toBe('reply-draft-generic@1');
  });

  it('generic system prompt is industry-neutral and lists custom field labels as data', () => {
    const s = genericLeadAnalysisPrompt.system('ru', [{ key: 'service', label: 'Услуга' }]);
    expect(s).not.toMatch(/real-estate|Tashkent district/i);
    expect(s).toContain('<business_fields>[{"key":"service","label":"Услуга"}]</business_fields>');
    expect(genericLeadAnalysisPrompt.system('ru')).not.toContain('business_fields>[');
  });
});
