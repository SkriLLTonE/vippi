import type { ActivityType, LeadActivityDto } from '@vippi/shared';
import {
  ArrowRightLeft,
  CircleCheck,
  ListChecks,
  MessageSquare,
  PencilLine,
  PhoneOutgoing,
  Plus,
  Send,
  Sparkles,
  TriangleAlert,
  UserMinus,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn, formatDateTime } from '@/shared/lib';

const ICONS: Record<ActivityType, LucideIcon> = {
  CREATED: Plus,
  ASSIGNED: UserPlus,
  UNASSIGNED: UserMinus,
  STATUS_CHANGED: ArrowRightLeft,
  FIRST_CONTACT: PhoneOutgoing,
  COMMENT: MessageSquare,
  SLA_BREACHED: TriangleAlert,
  FIELDS_UPDATED: PencilLine,
  AI_ANALYSIS_GENERATED: Sparkles,
  AI_DRAFT_SENT: Send,
};

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

export function ActivityItem({
  activity,
  resolveName,
}: {
  activity: LeadActivityDto;
  resolveName: (userId: string | undefined) => string;
}) {
  const { t } = useTranslation();
  const p = activity.payload ?? {};
  let Icon = ICONS[activity.type];
  const isRules = (activity.type === 'AI_ANALYSIS_GENERATED' && p.source === 'RULE_BASED') || p.source === 'RULES';
  if (isRules) Icon = ListChecks;

  let text: string;
  switch (activity.type) {
    case 'CREATED':
      text = t('activity.CREATED', { via: t(`lead.createdVia.${str(p.via) ?? 'MANUAL'}`) });
      break;
    case 'ASSIGNED':
      text = p.self ? t('activity.TOOK') : t('activity.ASSIGNED', { name: resolveName(str(p.to)) });
      break;
    case 'UNASSIGNED':
      text = p.reason === 'MEMBER_DEACTIVATED' ? t('activity.UNASSIGNED_DEACTIVATED') : t('activity.UNASSIGNED');
      break;
    case 'STATUS_CHANGED':
      text = t('activity.STATUS_CHANGED', {
        from: t(`lead.status.${str(p.from) ?? 'NEW'}`),
        to: t(`lead.status.${str(p.to) ?? 'NEW'}`),
      });
      if (str(p.lostReason)) text += ` · ${t(`lead.lostReason.${str(p.lostReason)}`)}`;
      break;
    case 'FIRST_CONTACT':
      text = t('activity.FIRST_CONTACT', { channel: t(`lead.channel.${str(p.channel) ?? 'OTHER'}`) });
      if (p.slaState === 'BREACHED') text += ` · ${t('activity.late')}`;
      break;
    case 'FIELDS_UPDATED': {
      const fields = Array.isArray(p.fields) ? p.fields.filter((f): f is string => typeof f === 'string') : [];
      const names = fields.map((f) => t(`lead.field.${f}`, { defaultValue: f })).join(', ');
      text = t(p.source === 'AI' ? 'activity.FIELDS_UPDATED_AI' : p.source === 'RULES' ? 'activity.FIELDS_UPDATED_RULES' : 'activity.FIELDS_UPDATED', {
        fields: names,
      });
      break;
    }
    case 'AI_ANALYSIS_GENERATED':
      text = t(isRules ? 'activity.AI_ANALYSIS_RULES' : 'activity.AI_ANALYSIS_GENERATED');
      break;
    case 'AI_DRAFT_SENT':
      text = t('activity.AI_DRAFT_SENT', { channel: t(`lead.channel.${str(p.channel) ?? 'OTHER'}`) });
      break;
    case 'SLA_BREACHED':
      text = t('activity.SLA_BREACHED');
      break;
    case 'COMMENT':
      text = t('activity.COMMENT');
      break;
  }

  return (
    <li className="flex gap-3 py-3" data-testid="activity-item" data-type={activity.type}>
      <span
        className={cn(
          'mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-background-subtle text-muted-foreground',
          activity.type === 'SLA_BREACHED' && 'bg-danger-bg text-danger',
          activity.type === 'AI_ANALYSIS_GENERATED' && !isRules && 'bg-primary-subtle text-primary',
        )}
      >
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          <span className="font-medium">{activity.actor?.fullName ?? t('activity.system')}</span>{' '}
          <span className="text-muted-foreground">{text}</span>
        </p>
        {activity.body ? <p className="mt-1 whitespace-pre-wrap break-words text-sm">{activity.body}</p> : null}
        <time className="text-xs text-subtle-foreground tabular" dateTime={activity.createdAt}>
          {formatDateTime(activity.createdAt)}
        </time>
      </div>
      {activity.type === 'FIRST_CONTACT' && p.slaState === 'MET' ? (
        <CircleCheck className="size-4 text-success" aria-label={t('sla.metShort')} />
      ) : null}
    </li>
  );
}
