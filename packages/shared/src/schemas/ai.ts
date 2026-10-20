import { z } from 'zod';
import type { AiFallbackReason, AiInsightKind, AiProviderName } from '../enums.js';
import { CONTACT_CHANNELS, REPLY_TONES } from '../enums.js';
import { DISTRICT_CODES } from '../districts.js';

export const LeadAnalysisSchema = z
  .object({
    summary: z.string().min(1).max(400),
    language: z.enum(['ru', 'uz', 'mixed', 'unknown']),
    need: z.string().max(200).nullable(),
    budget: z
      .object({
        amount: z.number().int().positive().max(1e13),
        currency: z.enum(['UZS', 'USD']),
      })
      .strict()
      .nullable(),
    district: z.enum(DISTRICT_CODES).nullable(),
    propertyType: z.enum(['APARTMENT', 'HOUSE', 'COMMERCIAL', 'LAND', 'OTHER']).nullable(),
    rooms: z.number().int().min(1).max(10).nullable(),
    missingInfo: z.array(z.string().max(120)).max(5),
    score: z.number().int().min(0).max(100),
    reasons: z.array(z.string().max(150)).min(2).max(4),
    nextQuestions: z.array(z.string().max(150)).max(3),
  })
  .strict();
export type LeadAnalysis = z.infer<typeof LeadAnalysisSchema>;

export const ReplyDraftSchema = z
  .object({
    text: z.string().min(20).max(700),
    language: z.enum(['ru', 'uz']),
  })
  .strict();
export type ReplyDraft = z.infer<typeof ReplyDraftSchema>;

export const WeeklySummarySchema = z
  .object({
    bullets: z.array(z.string().min(10).max(200)).min(3).max(6),
  })
  .strict();
export type WeeklySummary = z.infer<typeof WeeklySummarySchema>;

export type ScoreBand = 'HOT' | 'WARM' | 'COLD';
export function scoreBand(score: number): ScoreBand {
  if (score >= 70) return 'HOT';
  if (score >= 40) return 'WARM';
  return 'COLD';
}

export const AnalysisRequestSchema = z.object({ force: z.boolean().optional() }).strict();
export type AnalysisRequest = z.infer<typeof AnalysisRequestSchema>;

export const ReplyDraftRequestSchema = z
  .object({
    language: z.enum(['ru', 'uz']),
    tone: z.enum(REPLY_TONES),
  })
  .strict();
export type ReplyDraftRequest = z.infer<typeof ReplyDraftRequestSchema>;

export const AI_APPLICABLE_FIELDS = ['budget', 'district', 'propertyType', 'rooms'] as const;
export type AiApplicableField = (typeof AI_APPLICABLE_FIELDS)[number];

export const ApplyFieldsSchema = z
  .object({
    insightId: z.uuid(),
    fields: z.array(z.enum(AI_APPLICABLE_FIELDS)).min(1).max(4),
  })
  .strict();
export type ApplyFieldsRequest = z.infer<typeof ApplyFieldsSchema>;

export const DraftSentSchema = z
  .object({
    insightId: z.uuid(),
    channel: z.enum(CONTACT_CHANNELS),
    edited: z.boolean(),
  })
  .strict();
export type DraftSentRequest = z.infer<typeof DraftSentSchema>;

export interface AiResultEnvelope<T> {
  insightId: string;
  kind: AiInsightKind;
  source: 'AI' | 'RULE_BASED';
  provider: AiProviderName;
  model: string | null;
  fallbackReason: AiFallbackReason | null;
  cached: boolean;
  promptVersion: string;
  createdAt: string;
  latencyMs: number;
  result: T;
}

export interface LeadAiState {
  analysis: AiResultEnvelope<LeadAnalysis> | null;
  draft: AiResultEnvelope<ReplyDraft> | null;
}

export interface AiStatusDto {
  mode: 'AI' | 'RULE_BASED';
  provider: AiProviderName | null;
  model: string | null;
  reason: AiFallbackReason | null;
  orgConsent: boolean;
  usage: {
    requestsToday: number;
    requestLimit: number;
    tokensToday: number;
    tokenLimit: number;
  };
}
