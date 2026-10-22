import {
  OVERRIDABLE_STATUSES,
  STATUS_LABEL_MAX,
  type OrganizationDto,
  type OverridableStatus,
  type StatusLabels,
} from '@vippi/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { defaultStatusLabel } from '@/shared/i18n';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input } from '@/shared/ui';
import { useUpdateOrg } from '../model/use-update-org';

type Draft = Record<OverridableStatus, { ru: string; uz: string }>;

function toDraft(labels: StatusLabels): Draft {
  const draft = {} as Draft;
  for (const s of OVERRIDABLE_STATUSES) draft[s] = { ru: labels[s]?.ru ?? '', uz: labels[s]?.uz ?? '' };
  return draft;
}

function fromDraft(draft: Draft): StatusLabels {
  const out: StatusLabels = {};
  for (const s of OVERRIDABLE_STATUSES) {
    const ru = draft[s].ru.trim();
    const uz = draft[s].uz.trim();
    if (ru || uz) out[s] = { ...(ru ? { ru } : {}), ...(uz ? { uz } : {}) };
  }
  return out;
}

/** ADR-024: per-organization names of final statuses; codes and transitions stay fixed. */
export function StatusLabelsCard({ org, editable }: { org: OrganizationDto; editable: boolean }) {
  const { t } = useTranslation();
  const update = useUpdateOrg();
  const [draft, setDraft] = useState<Draft>(() => toDraft(org.statusLabels));
  const dirty = JSON.stringify(fromDraft(draft)) !== JSON.stringify(fromDraft(toDraft(org.statusLabels)));
  return (
    <Card data-testid="status-labels-settings">
      <CardHeader>
        <CardTitle>{t('statusLabels.title')}</CardTitle>
        <CardDescription>{t('statusLabels.description')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {OVERRIDABLE_STATUSES.map((s) => (
          <div key={s} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(['ru', 'uz'] as const).map((lng) => (
              <Field key={lng} label={t(`statusLabels.field.${s}.${lng}`)}>
                {(c) => (
                  <Input
                    {...c}
                    readOnly={!editable}
                    maxLength={STATUS_LABEL_MAX}
                    placeholder={defaultStatusLabel(s, lng)}
                    value={draft[s][lng]}
                    onChange={(e) => setDraft((d) => ({ ...d, [s]: { ...d[s], [lng]: e.target.value } }))}
                  />
                )}
              </Field>
            ))}
          </div>
        ))}
        {editable ? (
          <Button
            className="self-start"
            disabled={!dirty}
            loading={update.isPending}
            loadingText={t('common.saving')}
            onClick={() => update.mutate({ statusLabels: fromDraft(draft) })}
          >
            {t('common.save')}
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">{t('org.viewOnly')}</p>
        )}
      </CardContent>
    </Card>
  );
}
