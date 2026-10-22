import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AiInsight, Prisma } from '@prisma/client';
import {
  LeadAnalysisSchema,
  ReplyDraftSchema,
  WeeklySummarySchema,
  type AiFallbackReason,
  type AiInsightKind,
  type AiResultEnvelope,
  type AiStatusDto,
  type ApplyFieldsRequest,
  type DraftSentRequest,
  type LeadAiState,
  type LeadAnalysis,
  type LeadDto,
  type Locale,
  type ReplyDraft,
  type ReplyDraftRequest,
  type WeeklySummary,
  localizedLabel,
  parseLeadFieldDefs,
  visibleAttributes,
  type IndustryPreset,
  type LeadFieldDef,
} from '@vippi/shared';
import { z } from 'zod';
import type { Actor } from '../../common/actor.js';
import { forbidden, notFound } from '../../common/app-exception.js';
import { Clock } from '../../common/clock.js';
import { sha256Hex } from '../../common/crypto.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { ProductEvents } from '../../common/product-events.js';
import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import { AnalyticsService } from '../analytics/analytics.service.js';
import { LeadsService } from '../leads/leads.service.js';
import { SlaPolicyService } from '../sla/sla-policy.service.js';
import { AiUsageService } from './ai-usage.service.js';
import { ruleBasedAnalysis } from './fallback/rules.js';
import { templateReply, templateWeeklySummary, type WeeklyAggregates } from './fallback/templates.js';
import { uzCyrillicToLatin } from './fallback/translit.js';
import { checkLeadAnalysis, checkReplyDraft, checkWeeklySummary } from './post-validation/checks.js';
import {
  genericLeadAnalysisPrompt,
  genericReplyDraftPrompt,
  leadAnalysisPrompt,
  promptVersion,
  replyDraftPrompt,
  weeklySummaryPrompt,
} from './prompts/prompts.js';
import type { LeadWithRelations } from '../leads/domain/lead-mapper.js';
import { AI_PROVIDER, AiProviderError, type AiProvider } from './providers/ai-provider.interface.js';

const MAX_PROMPT_CHARS = 12_000;
const RETRY_PAUSE_MS = 500;
/** Output caps include headroom for thinking tokens, which Gemini counts against maxOutputTokens. */
const THINKING_HEADROOM_TOKENS = 1024;

interface RunSpec<T> {
  actor: Actor;
  leadId: string | null;
  kind: AiInsightKind;
  locale: Locale;
  params: Record<string, unknown> | null;
  version: string;
  hashInput: unknown;
  schema: z.ZodType<T>;
  system: string;
  user: string;
  inputChars: number;
  maxOutputTokens: number;
  temperature: number;
  postCheck: (out: T) => boolean;
  /** Applied to valid provider output before it is stored. */
  normalize?: (out: T) => T;
  fallback: () => T;
  force?: boolean;
}

interface OrgAiContext {
  name: string;
  preset: IndustryPreset;
  fields: LeadFieldDef[];
}

/** ADR-024: GENERIC organizations never get real-estate fields from the model. */
const withoutRealEstateFields = (a: LeadAnalysis): LeadAnalysis => ({ ...a, district: null, propertyType: null, rooms: null });

class OutputInvalid extends Error {
  override name = 'OutputInvalid';
}
class TimeoutError extends Error {
  override name = 'TimeoutError';
}

@Injectable()
export class AiService {
  private readonly logger = new Logger('AiService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly leads: LeadsService,
    private readonly analytics: AnalyticsService,
    private readonly sla: SlaPolicyService,
    private readonly usage: AiUsageService,
    private readonly events: ProductEvents,
    @Inject(AI_PROVIDER) private readonly provider: AiProvider | null,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  // ---------------------------------------------------------------- orchestration

  private envelope<T>(row: AiInsight, cached: boolean): AiResultEnvelope<T> {
    return {
      insightId: row.id,
      kind: row.kind,
      source: row.isFallback ? 'RULE_BASED' : 'AI',
      provider: row.provider,
      model: row.model,
      fallbackReason: row.fallbackReason,
      cached,
      promptVersion: row.promptVersion,
      createdAt: row.createdAt.toISOString(),
      latencyMs: row.latencyMs,
      result: row.output as T,
    };
  }

  /** consent → cache → input caps → limits → provider (timeout, 1 retry) → Zod + post-check → fallback. */
  private async run<T>(spec: RunSpec<T>): Promise<{ env: AiResultEnvelope<T>; fresh: boolean }> {
    const started = Date.now();
    const inputHash = sha256Hex(
      JSON.stringify({ kind: spec.kind, v: spec.version, locale: spec.locale, params: spec.params, input: spec.hashInput }),
    );
    const org = await this.prisma.db.organization.findUniqueOrThrow({
      where: { id: spec.actor.orgId },
      select: { aiExternalProcessingEnabled: true },
    });

    let reason: AiFallbackReason | null = null;
    if (!this.provider) reason = 'NO_PROVIDER_CONFIGURED';
    else if (!org.aiExternalProcessingEnabled) reason = 'ORG_DISABLED';

    if (!reason && !spec.force) {
      const cached = await this.prisma.db.aiInsight.findFirst({
        where: { organizationId: spec.actor.orgId, kind: spec.kind, inputHash, isFallback: false },
        orderBy: { createdAt: 'desc' },
      });
      if (cached) {
        this.log(spec, inputHash, cached, true);
        return { env: this.envelope<T>(cached, true), fresh: false };
      }
    }
    if (!reason && (spec.inputChars > this.config.AI_MAX_INPUT_CHARS || spec.system.length + spec.user.length > MAX_PROMPT_CHARS)) {
      reason = 'INPUT_TOO_LONG';
    }
    if (!reason && (await this.usage.exceeded(spec.actor.orgId, spec.actor.userId))) reason = 'LIMIT_EXCEEDED';

    let output: T | null = null;
    let tokens: { inputTokens: number; outputTokens: number } | null = null;
    if (!reason && this.provider) {
      try {
        const r = await this.callProvider(this.provider, spec);
        output = r.output;
        tokens = r.usage;
      } catch (e) {
        reason = e instanceof OutputInvalid ? 'INVALID_OUTPUT' : e instanceof TimeoutError ? 'TIMEOUT' : 'PROVIDER_ERROR';
        // Messages are built by the adapter (status / finish reason) and never contain request or response text.
        this.logger.warn({
          msg: 'ai provider call failed',
          kind: spec.kind,
          reason,
          httpStatus: e instanceof AiProviderError ? e.status : null,
          error: e instanceof AiProviderError ? e.message : e instanceof Error ? e.name : 'unknown',
        });
      }
    }

    const isFallback = output === null;
    const data: Prisma.AiInsightUncheckedCreateInput = {
      organizationId: spec.actor.orgId,
      leadId: spec.leadId,
      kind: spec.kind,
      inputHash,
      promptVersion: spec.version,
      locale: spec.locale,
      params: (spec.params ?? undefined) as Prisma.InputJsonValue | undefined,
      provider: isFallback ? 'RULE_BASED' : 'GEMINI',
      model: isFallback ? null : (this.provider?.model ?? null),
      isFallback,
      fallbackReason: isFallback ? (reason ?? 'PROVIDER_ERROR') : null,
      output: (output ?? spec.fallback()) as Prisma.InputJsonValue,
      latencyMs: Date.now() - started,
      inputTokens: tokens?.inputTokens ?? null,
      outputTokens: tokens?.outputTokens ?? null,
      createdById: spec.actor.userId,
    };
    const row = await this.prisma.db.aiInsight.create({ data });
    this.log(spec, inputHash, row, false);
    return { env: this.envelope<T>(row, false), fresh: true };
  }

  private async callProvider<T>(provider: AiProvider, spec: RunSpec<T>) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.AI_TIMEOUT_MS);
    try {
      const jsonSchema = z.toJSONSchema(spec.schema, { unrepresentable: 'any' }) as Record<string, unknown>;
      delete jsonSchema.$schema;
      let attempt = 0;
      for (;;) {
        try {
          const res = await provider.generateJson({
            system: spec.system,
            user: spec.user,
            jsonSchema,
            maxOutputTokens: spec.maxOutputTokens,
            temperature: spec.temperature,
            signal: controller.signal,
          });
          let parsedJson: unknown;
          try {
            parsedJson = JSON.parse(res.raw);
          } catch {
            throw new OutputInvalid('not json');
          }
          const parsed = spec.schema.safeParse(parsedJson);
          if (!parsed.success || !spec.postCheck(parsed.data)) throw new OutputInvalid('schema/post-check');
          return { output: spec.normalize ? spec.normalize(parsed.data) : parsed.data, usage: res.usage };
        } catch (e) {
          if (controller.signal.aborted) throw new TimeoutError();
          const retryable = e instanceof AiProviderError && e.retryable;
          if (!retryable || attempt >= this.config.AI_MAX_RETRIES) throw e;
          attempt += 1;
          await new Promise((r) => setTimeout(r, RETRY_PAUSE_MS));
          if (controller.signal.aborted) throw new TimeoutError();
        }
      }
    } finally {
      clearTimeout(timer);
    }
  }

  /** SPEC §17.7: no request/response texts in logs. */
  private log(spec: Pick<RunSpec<unknown>, 'actor' | 'kind' | 'version'>, inputHash: string, row: AiInsight, cached: boolean) {
    this.logger.log({
      type: 'ai_call',
      organizationId: spec.actor.orgId,
      kind: spec.kind,
      provider: row.provider,
      model: row.model,
      promptVersion: spec.version,
      inputHash,
      isFallback: row.isFallback,
      fallbackReason: row.fallbackReason,
      latencyMs: row.latencyMs,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      cached,
    });
  }

  private async userLocale(userId: string): Promise<Locale> {
    const u = await this.prisma.system.user.findUnique({ where: { id: userId }, select: { locale: true } });
    return u?.locale === 'uz' ? 'uz' : 'ru';
  }

  private async orgContext(orgId: string): Promise<OrgAiContext> {
    const org = await this.prisma.db.organization.findUniqueOrThrow({
      where: { id: orgId },
      select: { name: true, industryPreset: true, leadFieldDefs: true },
    });
    return { name: org.name, preset: org.industryPreset, fields: parseLeadFieldDefs(org.leadFieldDefs) };
  }

  /** Labels of custom fields that have no value on the lead yet (GENERIC hints, no customer data). */
  private missingFieldLabels(ctx: OrgAiContext, attributes: unknown, locale: Locale): string[] {
    const filled = visibleAttributes(ctx.fields, attributes);
    return ctx.fields.filter((f) => filled[f.key] === undefined).map((f) => localizedLabel(f.label, locale) ?? f.key);
  }

  // ---------------------------------------------------------------- lead analysis / draft

  /** FR-070, AI-001, AI-002 */
  async analyze(actor: Actor, leadId: string, force: boolean): Promise<AiResultEnvelope<LeadAnalysis>> {
    const lead = await this.leads.getVisibleLead(actor, leadId);
    const locale = await this.userLocale(actor.userId);
    const ctx = await this.orgContext(actor.orgId);
    const message = lead.message ?? '';
    const promptInput = { source: lead.source, message, name: lead.fullName };
    const ruleInput = { source: lead.source, message, name: lead.fullName, hasPhone: Boolean(lead.phone) };
    const common = {
      actor,
      leadId,
      kind: 'LEAD_ANALYSIS' as const,
      locale,
      params: null,
      schema: LeadAnalysisSchema,
      user: leadAnalysisPrompt.user(promptInput),
      inputChars: message.length,
      maxOutputTokens: 800 + THINKING_HEADROOM_TOKENS,
      temperature: 0.2,
      postCheck: (out: LeadAnalysis) => checkLeadAnalysis(out, message),
      force,
    };
    let spec: RunSpec<LeadAnalysis>;
    if (ctx.preset === 'GENERIC') {
      const fields = ctx.fields.map((f) => ({ key: f.key, label: localizedLabel(f.label, locale) ?? f.key }));
      const missingFields = this.missingFieldLabels(ctx, lead.attributes, locale);
      spec = {
        ...common,
        version: promptVersion(genericLeadAnalysisPrompt),
        hashInput: { ...promptInput, budget: lead.budgetAmount?.toString() ?? null, fields, missingFields },
        system: genericLeadAnalysisPrompt.system(locale, fields),
        normalize: withoutRealEstateFields,
        fallback: () => ruleBasedAnalysis({ ...ruleInput, missingFields }, locale, 'GENERIC'),
      };
    } else {
      spec = {
        ...common,
        version: promptVersion(leadAnalysisPrompt),
        hashInput: {
          ...promptInput,
          budget: lead.budgetAmount?.toString() ?? null,
          district: lead.district,
          propertyType: lead.propertyType,
          rooms: lead.rooms,
        },
        system: leadAnalysisPrompt.system(locale),
        fallback: () => ruleBasedAnalysis(ruleInput, locale),
      };
    }
    const { env, fresh } = await this.run<LeadAnalysis>(spec);
    if (fresh) {
      await this.leads.recordAiActivity(actor, leadId, 'AI_ANALYSIS_GENERATED', {
        insightId: env.insightId,
        source: env.source,
        fallbackReason: env.fallbackReason,
      });
    }
    this.events.emit('ai_analysis_generated', { organizationId: actor.orgId, userId: actor.userId }, {
      source: env.source,
      fallbackReason: env.fallbackReason,
      cached: env.cached,
    });
    return env;
  }

  /** FR-071, AI-003 */
  async replyDraft(actor: Actor, leadId: string, req: ReplyDraftRequest): Promise<AiResultEnvelope<ReplyDraft>> {
    const lead = await this.leads.getVisibleLead(actor, leadId);
    const org = await this.orgContext(actor.orgId);
    if (org.preset === 'GENERIC') return this.genericReplyDraft(actor, lead, org, req);
    const latest = await this.prisma.db.aiInsight.findFirst({
      where: { organizationId: actor.orgId, leadId, kind: 'LEAD_ANALYSIS' },
      orderBy: { createdAt: 'desc' },
    });
    const analysis = latest ? LeadAnalysisSchema.safeParse(latest.output) : null;
    const a = analysis?.success ? analysis.data : null;
    const message = lead.message ?? '';
    const managerFirstName = actor.fullName.split(/\s+/)[0] ?? actor.fullName;
    // Uzbek replies are Latin-only (post-check), so names reach the model already transliterated.
    const asReplyScript = (s: string) => (req.language === 'uz' ? uzCyrillicToLatin(s) : s);
    const promptInput = {
      lead: { source: lead.source, message, name: lead.fullName ? asReplyScript(lead.fullName) : lead.fullName },
      companyName: asReplyScript(org.name),
      managerFirstName: asReplyScript(managerFirstName),
      language: req.language,
      tone: req.tone,
      analysis: a
        ? { need: a.need, budget: a.budget, district: a.district, propertyType: a.propertyType, rooms: a.rooms, missingInfo: a.missingInfo }
        : null,
    };
    const fields = {
      budget: a?.budget ?? (lead.budgetAmount && lead.budgetCurrency ? { amount: Number(lead.budgetAmount), currency: lead.budgetCurrency } : null),
      district: a?.district ?? (lead.district as LeadAnalysis['district']),
      propertyType: a?.propertyType ?? lead.propertyType,
      rooms: a?.rooms ?? lead.rooms,
    };
    const { env } = await this.run<ReplyDraft>({
      actor,
      leadId,
      kind: 'REPLY_DRAFT',
      locale: req.language,
      params: { tone: req.tone, language: req.language },
      version: promptVersion(replyDraftPrompt),
      hashInput: promptInput,
      schema: ReplyDraftSchema,
      system: replyDraftPrompt.system(req.language),
      user: replyDraftPrompt.user(promptInput),
      inputChars: message.length,
      maxOutputTokens: 600 + THINKING_HEADROOM_TOKENS,
      temperature: 0.5,
      postCheck: (out) => checkReplyDraft(out, req.language),
      fallback: () =>
        templateReply({ name: lead.fullName, companyName: org.name, managerName: managerFirstName, analysis: fields }, req.language, req.tone),
    });
    this.events.emit('ai_draft_generated', { organizationId: actor.orgId, userId: actor.userId }, {
      source: env.source,
      language: req.language,
      tone: req.tone,
    });
    return env;
  }

  /** ADR-024: reply draft for any business — no property/district/rooms in prompt or template. */
  private async genericReplyDraft(
    actor: Actor,
    lead: LeadWithRelations,
    org: OrgAiContext,
    req: ReplyDraftRequest,
  ): Promise<AiResultEnvelope<ReplyDraft>> {
    const latest = await this.prisma.db.aiInsight.findFirst({
      where: { organizationId: actor.orgId, leadId: lead.id, kind: 'LEAD_ANALYSIS' },
      orderBy: { createdAt: 'desc' },
    });
    const analysis = latest ? LeadAnalysisSchema.safeParse(latest.output) : null;
    const a = analysis?.success ? analysis.data : null;
    const message = lead.message ?? '';
    const managerFirstName = actor.fullName.split(/\s+/)[0] ?? actor.fullName;
    const asReplyScript = (s: string) => (req.language === 'uz' ? uzCyrillicToLatin(s) : s);
    const missingFields = this.missingFieldLabels(org, lead.attributes, req.language);
    const promptInput = {
      lead: { source: lead.source, message, name: lead.fullName ? asReplyScript(lead.fullName) : lead.fullName },
      companyName: asReplyScript(org.name),
      managerFirstName: asReplyScript(managerFirstName),
      language: req.language,
      tone: req.tone,
      analysis: a ? { need: a.need, budget: a.budget, missingInfo: a.missingInfo } : null,
    };
    const budget =
      a?.budget ?? (lead.budgetAmount && lead.budgetCurrency ? { amount: Number(lead.budgetAmount), currency: lead.budgetCurrency } : null);
    const { env } = await this.run<ReplyDraft>({
      actor,
      leadId: lead.id,
      kind: 'REPLY_DRAFT',
      locale: req.language,
      params: { tone: req.tone, language: req.language },
      version: promptVersion(genericReplyDraftPrompt),
      hashInput: { ...promptInput, missingFields },
      schema: ReplyDraftSchema,
      system: genericReplyDraftPrompt.system(req.language),
      user: genericReplyDraftPrompt.user(promptInput),
      inputChars: message.length,
      maxOutputTokens: 600 + THINKING_HEADROOM_TOKENS,
      temperature: 0.5,
      postCheck: (out) => checkReplyDraft(out, req.language),
      fallback: () =>
        templateReply(
          {
            name: lead.fullName,
            companyName: org.name,
            managerName: managerFirstName,
            analysis: { budget, district: null, propertyType: null, rooms: null },
            preset: 'GENERIC',
            missingFields,
          },
          req.language,
          req.tone,
        ),
    });
    this.events.emit('ai_draft_generated', { organizationId: actor.orgId, userId: actor.userId }, {
      source: env.source,
      language: req.language,
      tone: req.tone,
    });
    return env;
  }

  async leadState(actor: Actor, leadId: string): Promise<LeadAiState> {
    await this.leads.getVisibleLead(actor, leadId);
    const [analysis, draft] = await Promise.all(
      (['LEAD_ANALYSIS', 'REPLY_DRAFT'] as const).map((kind) =>
        this.prisma.db.aiInsight.findFirst({
          where: { organizationId: actor.orgId, leadId, kind },
          orderBy: { createdAt: 'desc' },
        }),
      ),
    );
    return {
      analysis: analysis ? this.envelope<LeadAnalysis>(analysis, false) : null,
      draft: draft ? this.envelope<ReplyDraft>(draft, false) : null,
    };
  }

  private async insightFor(actor: Actor, leadId: string, insightId: string, kind: AiInsightKind): Promise<AiInsight> {
    const row = await this.prisma.db.aiInsight.findFirst({
      where: { id: insightId, organizationId: actor.orgId, leadId, kind },
    });
    if (!row) throw notFound();
    return row;
  }

  /** FR-072: values come from the stored insight, never from the client. */
  async applyFields(actor: Actor, leadId: string, req: ApplyFieldsRequest): Promise<LeadDto> {
    const lead = await this.leads.getVisibleLead(actor, leadId);
    if (!this.leads.canActOn(actor, lead)) throw forbidden();
    const row = await this.insightFor(actor, leadId, req.insightId, 'LEAD_ANALYSIS');
    const parsed = LeadAnalysisSchema.safeParse(row.output);
    if (!parsed.success) throw notFound();
    const { industryPreset } = await this.prisma.db.organization.findUniqueOrThrow({
      where: { id: actor.orgId },
      select: { industryPreset: true },
    });
    // ADR-024: real-estate fields are hidden for GENERIC, so they are never written from an insight.
    const fields = industryPreset === 'GENERIC' ? req.fields.filter((f) => f === 'budget') : req.fields;
    const values: Partial<Record<(typeof req.fields)[number], unknown>> = {};
    for (const f of fields) values[f] = parsed.data[f];
    return this.leads.applyExtractedFields(actor, leadId, values, row.isFallback ? 'RULES' : 'AI');
  }

  /** FR-071: marks the draft as sent; records first contact in the same transaction if missing. */
  async draftSent(actor: Actor, leadId: string, req: DraftSentRequest): Promise<LeadDto> {
    const lead = await this.leads.getVisibleLead(actor, leadId);
    if (!this.leads.canActOn(actor, lead)) throw forbidden();
    await this.insightFor(actor, leadId, req.insightId, 'REPLY_DRAFT');
    await this.prisma.db.$transaction(async (tx) => {
      if (!lead.firstResponseAt && lead.status === 'NEW') {
        await this.leads.recordFirstContact(actor, leadId, { channel: req.channel }, { viaAiDraft: true, tx });
      }
      await this.leads.recordAiActivity(
        actor,
        leadId,
        'AI_DRAFT_SENT',
        { insightId: req.insightId, channel: req.channel, edited: req.edited },
        tx,
      );
    });
    this.events.emit('ai_draft_marked_sent', { organizationId: actor.orgId, userId: actor.userId }, { edited: req.edited });
    return this.leads.getDto(actor, leadId);
  }

  // ---------------------------------------------------------------- weekly summary / status

  /** FR-074, AI-004: aggregates only, no customer data. */
  async weeklySummary(actor: Actor): Promise<AiResultEnvelope<WeeklySummary>> {
    const locale = await this.userLocale(actor.userId);
    const dash = await this.analytics.dashboard(actor, { preset: '7d' });
    const policy = await this.sla.getForOrg(actor.orgId);
    const pct = (v: number | null) => (v === null ? null : Math.round(v * 100));
    const managers = dash.byManager.filter((m) => m.userId && m.leads >= 5 && m.breachedRate !== null);
    const worstManager = managers.sort((a, b) => (b.breachedRate ?? 0) - (a.breachedRate ?? 0))[0];
    const sources = dash.bySource.filter((s) => s.breachedRate !== null);
    const worstSource = sources.sort((a, b) => (b.breachedRate ?? 0) - (a.breachedRate ?? 0))[0];
    const aggregates: WeeklyAggregates = {
      periodDays: 7,
      totalLeads: dash.kpis.totalLeads,
      medianFirstResponseMinutes:
        dash.kpis.medianFirstResponseSeconds === null ? null : Math.round(dash.kpis.medianFirstResponseSeconds / 60),
      slaThresholdMinutes: policy.firstResponseMinutes,
      breachedPercent: pct(dash.kpis.breachedRate),
      noReactionNow: dash.kpis.noReactionNow,
      worstManager: worstManager
        ? { name: worstManager.fullName ?? '—', breachedPercent: pct(worstManager.breachedRate) ?? 0, leads: worstManager.leads }
        : null,
      worstSource: worstSource ? { source: worstSource.source, breachedPercent: pct(worstSource.breachedRate) ?? 0 } : null,
    };
    const { env } = await this.run<WeeklySummary>({
      actor,
      leadId: null,
      kind: 'WEEKLY_SUMMARY',
      locale,
      params: { period: dash.period },
      version: promptVersion(weeklySummaryPrompt),
      hashInput: aggregates,
      schema: WeeklySummarySchema,
      system: weeklySummaryPrompt.system(locale),
      user: weeklySummaryPrompt.user(aggregates),
      inputChars: 0,
      maxOutputTokens: 600 + THINKING_HEADROOM_TOKENS,
      temperature: 0.2,
      postCheck: (out) => checkWeeklySummary(out, aggregates),
      fallback: () => templateWeeklySummary(aggregates, locale),
    });
    return env;
  }

  /** FR-075 */
  async status(actor: Actor): Promise<AiStatusDto> {
    const org = await this.prisma.db.organization.findUniqueOrThrow({
      where: { id: actor.orgId },
      select: { aiExternalProcessingEnabled: true },
    });
    const u = await this.usage.usage(actor.orgId, null);
    const reason: AiFallbackReason | null = !this.provider
      ? 'NO_PROVIDER_CONFIGURED'
      : !org.aiExternalProcessingEnabled
        ? 'ORG_DISABLED'
        : null;
    return {
      mode: reason ? 'RULE_BASED' : 'AI',
      provider: this.provider ? this.provider.name : null,
      model: this.provider?.model ?? null,
      reason,
      orgConsent: org.aiExternalProcessingEnabled,
      usage: {
        requestsToday: u.requestsToday,
        requestLimit: this.config.AI_DAILY_REQUEST_LIMIT_PER_ORG,
        tokensToday: u.tokensToday,
        tokenLimit: this.config.AI_DAILY_TOKEN_LIMIT_PER_ORG,
      },
    };
  }
}
