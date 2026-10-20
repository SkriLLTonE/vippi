import { scoreBand, type AiFallbackReason, type AiProviderName } from '@vippi/shared';
import { Flame, ListChecks, Snowflake, Sparkles, Thermometer } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge, Tooltip } from '@/shared/ui';

interface AiSourceInfo {
  source: 'AI' | 'RULE_BASED';
  provider: AiProviderName | null;
  model: string | null;
  fallbackReason?: AiFallbackReason | null;
}

const PROVIDER_LABEL: Record<AiProviderName, string> = { GEMINI: 'Gemini', RULE_BASED: 'Rules' };

/** «AI · Gemini/model» vs «Без AI · по правилам»; rule-based output never uses the Sparkles icon (UX-4). */
export function AiSourceBadge({ info }: { info: AiSourceInfo }) {
  const { t } = useTranslation();
  if (info.source === 'AI') {
    return (
      <Badge className="bg-primary-subtle text-primary" data-testid="ai-source" data-source="AI">
        <Sparkles aria-hidden />
        {t('ai.mode.ai', { provider: PROVIDER_LABEL[info.provider ?? 'GEMINI'], model: info.model ?? '' })}
      </Badge>
    );
  }
  const badge = (
    <Badge
      className="border-border-strong bg-background-subtle text-muted-foreground"
      data-testid="ai-source"
      data-source="RULE_BASED"
      tabIndex={info.fallbackReason ? 0 : undefined}
    >
      <ListChecks aria-hidden />
      {t('ai.mode.rules')}
    </Badge>
  );
  return info.fallbackReason ? <Tooltip content={t(`ai.reason.${info.fallbackReason}`)}>{badge}</Tooltip> : badge;
}

const BAND_STYLE = {
  HOT: { icon: Flame, className: 'bg-score-hot-bg text-score-hot' },
  WARM: { icon: Thermometer, className: 'bg-warning-bg text-warning' },
  COLD: { icon: Snowflake, className: 'bg-status-lost-bg text-status-lost' },
} as const;

export function ScoreBadge({ score }: { score: number }) {
  const { t } = useTranslation();
  const band = scoreBand(score);
  const { icon: Icon, className } = BAND_STYLE[band];
  return (
    <Badge className={className}>
      <Icon aria-hidden />
      {t(`ai.band.${band}`)}
    </Badge>
  );
}
