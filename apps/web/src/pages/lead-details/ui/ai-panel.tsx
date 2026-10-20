import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  districtName,
  scoreBand,
  type AiApplicableField,
  type AiResultEnvelope,
  type ContactChannel,
  type LeadAiState,
  type LeadAnalysis,
  type LeadDto,
  type ReplyDraft,
  type ReplyTone,
} from '@vippi/shared';
import { Bot, Info, RefreshCw, Send, ShieldAlert, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { AiSourceBadge, ScoreBadge, aiKeys, useLeadAi } from '@/entities/ai-insight';
import { onLeadChanged } from '@/entities/lead';
import { useCan, useFeature, useSession } from '@/entities/session';
import { apiRequest } from '@/shared/api';
import { cn, errorMessage, formatDateTime, formatMoney } from '@/shared/lib';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CopyButton,
  DelayedSkeleton,
  Dialog,
  ErrorState,
  Segmented,
  Skeleton,
  Textarea,
} from '@/shared/ui';
import { channelOptions } from '../lib/channels';

function GeneratingSkeleton() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-2" role="status" aria-live="polite">
      <p className="text-sm text-muted-foreground">{t('ai.generating')}</p>
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}

function Meta({ env }: { env: AiResultEnvelope<unknown> }) {
  const { t } = useTranslation();
  return (
    <p className="text-xs text-subtle-foreground">
      {t('ai.generatedAt', { time: formatDateTime(env.createdAt) })}
      {env.cached ? ` · ${t('ai.cached')}` : ''}
    </p>
  );
}

function fieldValue(field: AiApplicableField, a: LeadAnalysis, locale: 'ru' | 'uz', t: (k: string, o?: Record<string, unknown>) => string) {
  switch (field) {
    case 'budget':
      return a.budget ? formatMoney(a.budget.amount, a.budget.currency, t) : null;
    case 'district':
      return a.district ? districtName(a.district, locale) : null;
    case 'propertyType':
      return a.propertyType ? t(`lead.propertyType.${a.propertyType}`) : null;
    case 'rooms':
      return a.rooms ? String(a.rooms) : null;
  }
}

function differs(field: AiApplicableField, a: LeadAnalysis, lead: LeadDto): boolean {
  switch (field) {
    case 'budget':
      return !!a.budget && (lead.budget?.amount !== String(a.budget.amount) || lead.budget?.currency !== a.budget.currency);
    case 'district':
      return !!a.district && a.district !== lead.district;
    case 'propertyType':
      return !!a.propertyType && a.propertyType !== lead.propertyType;
    case 'rooms':
      return !!a.rooms && a.rooms !== lead.rooms;
  }
}

const FIELDS: AiApplicableField[] = ['budget', 'district', 'propertyType', 'rooms'];

function AnalysisBlock({ lead, state, canAct }: { lead: LeadDto; state: LeadAiState | undefined; canAct: boolean }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'uz' ? 'uz' : 'ru';
  const qc = useQueryClient();
  const showScore = useFeature('DEAL_SCORE');
  const analyze = useMutation({
    mutationFn: (force: boolean) =>
      apiRequest<AiResultEnvelope<LeadAnalysis>>(`/leads/${lead.id}/ai/analysis`, { method: 'POST', body: { force } }),
    onSuccess: (env) => {
      qc.setQueryData<LeadAiState>(aiKeys.lead(lead.id), (prev) => ({ draft: prev?.draft ?? null, analysis: env }));
      onLeadChanged(qc, undefined, lead.id);
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  });
  const apply = useMutation({
    mutationFn: (fields: AiApplicableField[]) =>
      apiRequest<LeadDto>(`/leads/${lead.id}/ai/apply-fields`, {
        method: 'POST',
        body: { insightId: state?.analysis?.insightId, fields },
      }),
    onSuccess: (updated) => {
      onLeadChanged(qc, updated);
      toast.success(t('ai.applied'));
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  });

  const env = state?.analysis ?? null;
  if (analyze.isPending) return <GeneratingSkeleton />;
  if (!env) {
    return (
      <Button onClick={() => analyze.mutate(false)} data-testid="ai-analyze">
        <Bot aria-hidden />
        {t('ai.analyze')}
      </Button>
    );
  }
  const a = env.result;
  const applicable = FIELDS.filter((f) => differs(f, a, lead));
  const band = scoreBand(a.score);
  return (
    <div className="flex flex-col gap-4" data-testid="ai-analysis">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <AiSourceBadge info={env} />
        <Button variant="ghost" size="sm" onClick={() => analyze.mutate(true)} aria-label={t('ai.refresh')}>
          <RefreshCw aria-hidden />
          {t('ai.refresh')}
        </Button>
      </div>
      <div>
        <p className="text-sm" data-testid="ai-summary">
          {a.summary}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t('ai.language')}: {t(`ai.lang.${a.language}`)}
          {a.need ? ` · ${a.need}` : ''}
        </p>
      </div>
      {FIELDS.some((f) => fieldValue(f, a, locale, t)) ? (
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">{t('ai.extracted')}</h3>
            {canAct && applicable.length > 1 ? (
              <Button variant="link" size="sm" disabled={apply.isPending} onClick={() => apply.mutate(applicable)}>
                {t('ai.applyAll')}
              </Button>
            ) : null}
          </div>
          <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
            {FIELDS.map((f) => {
              const value = fieldValue(f, a, locale, t);
              if (!value) return null;
              const canApply = canAct && applicable.includes(f);
              return (
                <li key={f} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span>
                    <span className="text-muted-foreground">{t(`lead.field.${f}`)}:</span> {value}
                  </span>
                  {canApply ? (
                    <Button variant="outline" size="sm" disabled={apply.isPending} onClick={() => apply.mutate([f])}>
                      {t('ai.apply')}
                    </Button>
                  ) : (
                    <span className="text-xs text-subtle-foreground">{applicable.includes(f) ? '' : t('ai.inLead')}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      {showScore ? (
        <div>
          <div className="mb-1 flex items-center justify-between">
            <h3 className="text-sm font-semibold">{t('ai.score')}</h3>
            <ScoreBadge score={a.score} />
          </div>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={a.score}
            aria-label={t('ai.score')}
            className="h-2 overflow-hidden rounded-full bg-border"
          >
            <div
              className={cn('h-full', band === 'HOT' ? 'bg-score-hot' : band === 'WARM' ? 'bg-warning' : 'bg-status-lost')}
              style={{ width: `${a.score}%` }}
            />
          </div>
          <p className="mt-1 text-sm font-semibold tabular">{a.score}/100</p>
          <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground">
            {a.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-subtle-foreground">{t('ai.scoreDisclaimer')}</p>
        </div>
      ) : null}
      {a.nextQuestions.length > 0 || a.missingInfo.length > 0 ? (
        <div>
          <h3 className="mb-1 text-sm font-semibold">{t('ai.toClarify')}</h3>
          <ul className="list-disc pl-5 text-sm">
            {[...a.nextQuestions, ...a.missingInfo.filter((m) => !a.nextQuestions.includes(m))].map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <Meta env={env} />
    </div>
  );
}

function DraftBlock({ lead, state, canAct }: { lead: LeadDto; state: LeadAiState | undefined; canAct: boolean }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const detected = state?.analysis?.result.language;
  const [language, setLanguage] = useState<'ru' | 'uz'>(
    state?.draft?.result.language ?? (detected === 'ru' || detected === 'uz' ? detected : i18n.language === 'uz' ? 'uz' : 'ru'),
  );
  const [tone, setTone] = useState<ReplyTone>('FRIENDLY');
  const [text, setText] = useState(state?.draft?.result.text ?? '');
  const [original, setOriginal] = useState(state?.draft?.result.text ?? '');
  const [sentOpen, setSentOpen] = useState(false);
  const [channel, setChannel] = useState<ContactChannel | undefined>(undefined);

  const generate = useMutation({
    mutationFn: () =>
      apiRequest<AiResultEnvelope<ReplyDraft>>(`/leads/${lead.id}/ai/reply-draft`, {
        method: 'POST',
        body: { language, tone },
      }),
    onSuccess: (env) => {
      qc.setQueryData<LeadAiState>(aiKeys.lead(lead.id), (prev) => ({ analysis: prev?.analysis ?? null, draft: env }));
      setText(env.result.text);
      setOriginal(env.result.text);
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  });
  const markSent = useMutation({
    mutationFn: () =>
      apiRequest<LeadDto>(`/leads/${lead.id}/ai/draft-sent`, {
        method: 'POST',
        body: { insightId: state?.draft?.insightId, channel, edited: text !== original },
      }),
    onSuccess: (updated) => {
      onLeadChanged(qc, updated);
      setSentOpen(false);
      toast.success(t('ai.markedSent'));
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  });

  const env = state?.draft ?? null;
  return (
    <div className="flex flex-col gap-3" data-testid="ai-draft">
      <div className="flex flex-wrap gap-2">
        <Segmented<'ru' | 'uz'>
          label={t('ai.draftLanguage')}
          value={language}
          onChange={setLanguage}
          options={[
            { value: 'ru', label: 'RU' },
            { value: 'uz', label: 'UZ' },
          ]}
        />
        <Segmented<ReplyTone>
          label={t('ai.tone')}
          value={tone}
          onChange={setTone}
          options={[
            { value: 'FORMAL', label: t('ai.toneFormal') },
            { value: 'FRIENDLY', label: t('ai.toneFriendly') },
          ]}
        />
      </div>
      <Button variant={env ? 'outline' : 'default'} onClick={() => generate.mutate()} loading={generate.isPending} loadingText={t('ai.generatingShort')} data-testid="ai-generate-draft">
        <Sparkles aria-hidden />
        {t('ai.generateDraft')}
      </Button>
      {generate.isPending ? <GeneratingSkeleton /> : null}
      {env && !generate.isPending ? (
        <>
          <AiSourceBadge info={env} />
          <label className="sr-only" htmlFor="ai-draft-text">
            {t('ai.draftText')}
          </label>
          <Textarea
            id="ai-draft-text"
            data-testid="ai-draft-text"
            rows={6}
            maxLength={700}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="text-base"
          />
          <div className="flex justify-between text-xs text-subtle-foreground">
            <span>{text !== original ? t('ai.edited') : ''}</span>
            <span className="tabular">{text.length}/700</span>
          </div>
          <Alert tone="warning" icon={<ShieldAlert aria-hidden />}>
            {t('ai.draftWarning')}
          </Alert>
          <div className="flex flex-wrap gap-2">
            <CopyButton text={text} />
            {canAct ? (
              <Button onClick={() => setSentOpen(true)} data-testid="ai-mark-sent">
                <Send aria-hidden />
                {t('ai.markSent')}
              </Button>
            ) : null}
          </div>
          <Meta env={env} />
        </>
      ) : null}
      <Dialog
        open={sentOpen}
        onOpenChange={setSentOpen}
        title={t('ai.markSent')}
        description={t('ai.markSentText')}
        footer={
          <>
            <Button variant="outline" onClick={() => setSentOpen(false)} disabled={markSent.isPending}>
              {t('common.cancel')}
            </Button>
            <Button disabled={!channel} loading={markSent.isPending} loadingText={t('common.saving')} onClick={() => markSent.mutate()}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <fieldset>
          <legend className="mb-2 text-sm font-medium">{t('firstContact.channel')}</legend>
          <Segmented<ContactChannel> wrap label={t('firstContact.channel')} value={channel} onChange={setChannel} options={channelOptions(t)} />
        </fieldset>
      </Dialog>
    </div>
  );
}

/** AI panel (FR-070–FR-073): results are suggestions; nothing is sent to the client automatically. */
export function AiPanel({ lead, canAct }: { lead: LeadDto; canAct: boolean }) {
  const { t } = useTranslation();
  const me = useSession();
  const can = useCan();
  const ai = useLeadAi(lead.id);
  const orgDisabled = !me.organization.aiExternalProcessingEnabled;
  return (
    <Card className="lg:sticky lg:top-20" data-testid="ai-panel">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="size-5 text-muted-foreground" aria-hidden />
          {t('ai.title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {orgDisabled ? (
          <Alert tone="info" icon={<Info aria-hidden />}>
            {t('ai.orgDisabledHint')}{' '}
            {can('org.manage') ? (
              <Link to="/settings/organization" className="font-medium underline">
                {t('ai.enableInSettings')}
              </Link>
            ) : null}
          </Alert>
        ) : null}
        {ai.isPending ? (
          <DelayedSkeleton>
            <Skeleton className="h-24" />
          </DelayedSkeleton>
        ) : ai.isError ? (
          <ErrorState message={errorMessage(ai.error, t)} onRetry={() => void ai.refetch()} />
        ) : (
          <>
            <section aria-labelledby="ai-analysis-title">
              <h3 id="ai-analysis-title" className="mb-3 text-sm font-semibold text-muted-foreground">
                {t('ai.analysisTitle')}
              </h3>
              <AnalysisBlock lead={lead} state={ai.data} canAct={canAct} />
            </section>
            <section aria-labelledby="ai-draft-title" className="border-t border-border pt-6">
              <h3 id="ai-draft-title" className="mb-3 text-sm font-semibold text-muted-foreground">
                {t('ai.draftTitle')}
              </h3>
              <DraftBlock lead={lead} state={ai.data} canAct={canAct} />
            </section>
          </>
        )}
      </CardContent>
    </Card>
  );
}
