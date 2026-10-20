import type { LeadSource, LeadStatus, SlaState } from '@vippi/shared';
import {
  AlarmClock,
  BadgeCheck,
  Camera,
  CircleCheck,
  CircleDot,
  CircleHelp,
  CircleMinus,
  CircleSlash,
  Clock,
  Copy,
  DoorOpen,
  Ghost,
  Globe,
  MessageCircle,
  Phone,
  Send,
  ShoppingBag,
  TriangleAlert,
  Trophy,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SLA_TICK_MS } from '@/shared/config';
import { cn, formatDuration, useNow } from '@/shared/lib';
import { Badge } from '@/shared/ui';
import { slaView, type SlaView } from '../lib/sla';

const STATUS_STYLE: Record<LeadStatus, { icon: LucideIcon; className: string }> = {
  NEW: { icon: CircleDot, className: 'bg-status-new-bg text-status-new' },
  CONTACTED: { icon: MessageCircle, className: 'bg-status-contacted-bg text-status-contacted' },
  QUALIFIED: { icon: BadgeCheck, className: 'bg-status-qualified-bg text-status-qualified' },
  WON: { icon: Trophy, className: 'bg-status-won-bg text-status-won' },
  LOST: { icon: CircleSlash, className: 'bg-status-lost-bg text-status-lost' },
};

export function LeadStatusBadge({ status }: { status: LeadStatus }) {
  const { t } = useTranslation();
  const { icon: Icon, className } = STATUS_STYLE[status];
  return (
    <Badge className={className} data-testid="lead-status">
      <Icon aria-hidden />
      {t(`lead.status.${status}`)}
    </Badge>
  );
}

export const SOURCE_ICONS: Record<LeadSource, LucideIcon> = {
  INSTAGRAM: Camera,
  TELEGRAM: Send,
  WEBSITE: Globe,
  OLX: ShoppingBag,
  PHONE: Phone,
  WALK_IN: DoorOpen,
  REFERRAL: Users,
  OTHER: CircleHelp,
};

export function SourceLabel({ source, detail }: { source: LeadSource; detail?: string | null }) {
  const { t } = useTranslation();
  const Icon = SOURCE_ICONS[source];
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span>{t(`lead.source.${source}`)}</span>
      {detail ? <span className="text-muted-foreground">· {detail}</span> : null}
    </span>
  );
}

const SLA_STYLE: Record<SlaView['kind'], { icon: LucideIcon; className: string }> = {
  pending: { icon: Clock, className: 'border-border-strong text-muted-foreground' },
  dueSoon: { icon: AlarmClock, className: 'bg-warning-bg text-warning' },
  breached: { icon: TriangleAlert, className: 'bg-danger-bg text-danger font-semibold' },
  met: { icon: CircleCheck, className: 'border-success-border text-success' },
  exempt: { icon: CircleMinus, className: 'text-subtle-foreground' },
};

export function slaText(view: SlaView, t: (k: string, o?: Record<string, unknown>) => string): string {
  const duration = formatDuration(view.seconds, t);
  switch (view.kind) {
    case 'pending':
      return t('sla.dueIn', { duration });
    case 'dueSoon':
      return `${t('sla.dueSoon')} · ${duration}`;
    case 'breached':
      return t('sla.breached', { duration });
    case 'met':
      return t('sla.met', { duration });
    case 'exempt':
      return t('sla.exempt');
  }
}

interface SlaSubject {
  slaState: SlaState;
  receivedAt: string;
  firstResponseDueAt: string;
  firstResponseAt: string | null;
}

/** SLA badge with countdown refreshed every 30 s (design-system §2.4). */
export function SlaBadge({ lead, size = 'sm' }: { lead: SlaSubject; size?: 'sm' | 'lg' }) {
  const { t } = useTranslation();
  const now = useNow(SLA_TICK_MS);
  const view = slaView(lead, now);
  const { icon: Icon, className } = SLA_STYLE[view.kind];
  return (
    <Badge
      data-testid="sla-badge"
      data-sla={view.kind}
      className={cn(className, size === 'lg' && 'h-9 gap-2 rounded-md px-3 text-sm [&_svg]:size-4')}
    >
      <Icon aria-hidden />
      <span className="tabular">{slaText(view, t)}</span>
    </Badge>
  );
}

export function ForgottenBadge() {
  const { t } = useTranslation();
  return (
    <Badge className="border-dashed border-danger-border text-danger">
      <Ghost aria-hidden />
      {t('lead.forgotten')}
    </Badge>
  );
}

export function DuplicateBadge() {
  const { t } = useTranslation();
  return (
    <Badge className="border-warning-border text-warning">
      <Copy aria-hidden />
      {t('lead.possibleDuplicate')}
    </Badge>
  );
}
