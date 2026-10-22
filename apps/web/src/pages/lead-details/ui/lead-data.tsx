import {
  districtName,
  localizedLabel,
  type LeadAttributeValue,
  type LeadDto,
  type LeadFieldDef,
  type Locale,
} from '@vippi/shared';
import { Phone } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { SourceLabel } from '@/entities/lead';
import { useSession } from '@/entities/session';
import { formatDateTime, formatMoney, formatPhone, type Translate } from '@/shared/lib';
import { Card, CardContent, CardHeader, CardTitle, CopyButton } from '@/shared/ui';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,140px)_1fr] gap-3 py-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children ?? '—'}</dd>
    </div>
  );
}

function attributeText(def: LeadFieldDef, value: LeadAttributeValue | undefined, locale: Locale, t: Translate): ReactNode {
  if (value === undefined) return null;
  if (typeof value === 'object') return <span className="tabular">{formatMoney(value.amount, value.currency, t)}</span>;
  if (def.type === 'single_select') {
    const option = def.options?.find((o) => o.value === value);
    return option ? (localizedLabel(option.label, locale) ?? option.value) : String(value);
  }
  if (typeof value === 'number') return <span className="tabular">{value.toLocaleString(locale === 'uz' ? 'uz-UZ' : 'ru-RU')}</span>;
  return <span className="whitespace-pre-wrap break-words">{value}</span>;
}

export function LeadData({ lead }: { lead: LeadDto }) {
  const { t, i18n } = useTranslation();
  const { organization } = useSession();
  const locale = i18n.language === 'uz' ? 'uz' : 'ru';
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('lead.details')}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="divide-y divide-border">
          <Row label={t('lead.field.phone')}>
            {lead.phone ? (
              <span className="flex flex-wrap items-center gap-2">
                <a href={`tel:${lead.phone}`} className="inline-flex min-h-7 items-center gap-1 font-medium text-primary hover:underline tabular">
                  <Phone className="size-4" aria-hidden />
                  {formatPhone(lead.phone)}
                </a>
                <CopyButton text={lead.phone} size="sm" label={t('common.copy')} />
              </span>
            ) : null}
          </Row>
          <Row label={t('lead.field.source')}>
            <SourceLabel source={lead.source} detail={lead.sourceDetail} />
          </Row>
          <Row label={t('lead.field.message')}>
            {lead.message ? <p className="whitespace-pre-wrap break-words text-base">{lead.message}</p> : null}
          </Row>
          <Row label={t('lead.field.budget')}>
            {lead.budget ? <span className="tabular">{formatMoney(lead.budget.amount, lead.budget.currency, t)}</span> : null}
          </Row>
          {organization.industryPreset === 'REAL_ESTATE' ? (
            <>
              <Row label={t('lead.field.district')}>{lead.district ? districtName(lead.district, locale) : null}</Row>
              <Row label={t('lead.field.propertyType')}>
                {lead.propertyType ? t(`lead.propertyType.${lead.propertyType}`) : null}
              </Row>
              <Row label={t('lead.field.rooms')}>{lead.rooms ?? null}</Row>
            </>
          ) : null}
          {organization.leadFields.map((def) => (
            <Row key={def.key} label={localizedLabel(def.label, locale) ?? def.key}>
              {attributeText(def, lead.attributes?.[def.key], locale, t)}
            </Row>
          ))}
          <Row label={t('lead.field.assignee')}>{lead.assignee?.fullName ?? t('lead.unassigned')}</Row>
          <Row label={t('lead.field.receivedAt')}>
            <span className="tabular">{formatDateTime(lead.receivedAt)}</span>
          </Row>
          <Row label={t('lead.field.dueAt')}>
            <span className="tabular">{formatDateTime(lead.firstResponseDueAt)}</span>
          </Row>
          {lead.firstResponseAt ? (
            <Row label={t('lead.field.firstResponse')}>
              <span className="tabular">{formatDateTime(lead.firstResponseAt)}</span>
              {lead.firstResponseChannel ? ` · ${t(`lead.channel.${lead.firstResponseChannel}`)}` : ''}
              {lead.firstResponseBy ? ` · ${lead.firstResponseBy.fullName}` : ''}
            </Row>
          ) : null}
          {lead.lostReason ? (
            <Row label={t('status.lostReason')}>
              {t(`lead.lostReason.${lead.lostReason}`)}
              {lead.lostComment ? ` · ${lead.lostComment}` : ''}
            </Row>
          ) : null}
          {lead.possibleDuplicateOf ? (
            <Row label={t('lead.possibleDuplicate')}>
              <Link to={`/leads/${lead.possibleDuplicateOf.id}`} className="text-primary hover:underline">
                {t('lead.title', { number: lead.possibleDuplicateOf.number })}
              </Link>
            </Row>
          ) : null}
          <Row label={t('lead.field.createdVia')}>{t(`lead.createdVia.${lead.createdVia}`)}</Row>
        </dl>
      </CardContent>
    </Card>
  );
}
