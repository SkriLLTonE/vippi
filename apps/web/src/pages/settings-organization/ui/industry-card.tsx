import {
  INDUSTRY_TEMPLATES,
  MAX_LEAD_FIELDS,
  localizedLabel,
  planIndustryTemplate,
  type Industry,
  type OrganizationDto,
  type OverridableStatus,
} from '@vippi/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IndustryOptions, useUiLocale } from '@/entities/industry';
import { useSession } from '@/entities/session';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Field, NativeSelect, Switch } from '@/shared/ui';
import { useApplyIndustryTemplate, useUpdateOrg } from '../model/use-update-org';

/**
 * ADR-024/025: the owner picks an industry, previews what its template adds and either applies it
 * (merge: fields are only added, customized labels kept unless confirmed) or switches without fields.
 */
export function IndustryCard({ org, editable }: { org: OrganizationDto; editable: boolean }) {
  const { t } = useTranslation();
  const locale = useUiLocale();
  const { organization: current } = useSession();
  const update = useUpdateOrg();
  const apply = useApplyIndustryTemplate();
  const [industry, setIndustry] = useState<Industry>(org.industry);
  const [overwrite, setOverwrite] = useState(false);
  const template = INDUSTRY_TEMPLATES[industry];
  const plan = planIndustryTemplate(template, current, {
    overwriteStatusLabels: overwrite,
    previous: INDUSTRY_TEMPLATES[current.industry],
  });
  const changed = industry !== org.industry;
  const fieldName = (key: string) => {
    const def = template.fields.find((f) => f.key === key);
    return (def && localizedLabel(def.label, locale)) ?? key;
  };
  const list = (keys: string[]) => keys.map(fieldName).join(', ');
  const labelList = (statuses: OverridableStatus[], source: typeof current.statusLabels) =>
    statuses.map((s) => `«${localizedLabel(source[s], locale) ?? s}»`).join(' / ');
  const hasChanges = plan.addedFields.length > 0 || plan.statusLabelsChanged.length > 0;
  const busy = update.isPending || apply.isPending;

  return (
    <Card data-testid="industry-settings">
      <CardHeader>
        <CardTitle>{t('industry.title')}</CardTitle>
        <CardDescription>{t('industry.description')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Field label={t('industry.label')} hint={t('industry.switchHint')}>
          {(c) => (
            <NativeSelect {...c} disabled={!editable} value={industry} onChange={(e) => setIndustry(e.target.value as Industry)}>
              <IndustryOptions />
            </NativeSelect>
          )}
        </Field>
        {editable ? (
          <>
            <div className="rounded-md bg-background-subtle p-3 text-sm" data-testid="industry-template-preview" aria-live="polite">
              <p className="font-medium">{t('industry.previewTitle', { name: template.name[locale] })}</p>
              <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                {plan.addedFields.length > 0 ? <li>{t('industry.added', { list: list(plan.addedFields) })}</li> : null}
                {plan.existingFields.length > 0 ? <li>{t('industry.existing', { list: list(plan.existingFields) })}</li> : null}
                {plan.skippedFields.length > 0 ? (
                  <li>{t('industry.skipped', { max: MAX_LEAD_FIELDS, list: list(plan.skippedFields) })}</li>
                ) : null}
                {plan.statusLabelsChanged.length > 0 ? (
                  <li>{t('industry.labelsChange', { list: labelList(plan.statusLabelsChanged, plan.statusLabels) })}</li>
                ) : null}
                {plan.statusLabelsKept.length > 0 ? (
                  <li>{t('industry.labelsKept', { list: labelList(plan.statusLabelsKept, current.statusLabels) })}</li>
                ) : null}
                {!hasChanges && plan.statusLabelsKept.length === 0 ? <li>{t('industry.nothingToAdd')}</li> : null}
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">{t('industry.neverDeletes')}</p>
            </div>
            {plan.statusLabelsKept.length > 0 || (overwrite && plan.statusLabelsChanged.length > 0) ? (
              <div className="flex items-center justify-between gap-4">
                <label htmlFor="industry-overwrite-labels" className="text-sm">
                  {t('industry.overwriteLabels')}
                </label>
                <Switch id="industry-overwrite-labels" checked={overwrite} onCheckedChange={setOverwrite} disabled={busy} />
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={!changed && !hasChanges}
                loading={apply.isPending}
                loadingText={t('common.saving')}
                onClick={() => apply.mutate({ industry, overwriteStatusLabels: overwrite }, { onSuccess: () => setOverwrite(false) })}
              >
                {t('industry.apply')}
              </Button>
              {changed ? (
                <Button
                  variant="outline"
                  disabled={busy}
                  loading={update.isPending}
                  loadingText={t('common.saving')}
                  onClick={() => update.mutate({ industry })}
                >
                  {t('industry.saveOnly')}
                </Button>
              ) : null}
            </div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">{t('org.viewOnly')}</p>
        )}
      </CardContent>
    </Card>
  );
}
