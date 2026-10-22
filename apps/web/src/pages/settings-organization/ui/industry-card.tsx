import { INDUSTRY_PRESETS, type IndustryPreset, type OrganizationDto } from '@vippi/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Field, NativeSelect } from '@/shared/ui';
import { useUpdateOrg } from '../model/use-update-org';

/** ADR-024: switching the preset only hides or shows real-estate fields; stored data is kept. */
export function IndustryCard({ org, editable }: { org: OrganizationDto; editable: boolean }) {
  const { t } = useTranslation();
  const update = useUpdateOrg();
  const [preset, setPreset] = useState<IndustryPreset>(org.industryPreset);
  return (
    <Card data-testid="industry-settings">
      <CardHeader>
        <CardTitle>{t('industry.title')}</CardTitle>
        <CardDescription>{t('industry.description')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Field label={t('industry.label')} hint={t('industry.switchHint')}>
          {(c) => (
            <NativeSelect
              {...c}
              disabled={!editable}
              value={preset}
              onChange={(e) => setPreset(e.target.value as IndustryPreset)}
            >
              {INDUSTRY_PRESETS.map((p) => (
                <option key={p} value={p}>
                  {t(`industry.preset.${p}`)}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
        {editable ? (
          <Button
            className="self-start"
            disabled={preset === org.industryPreset}
            loading={update.isPending}
            loadingText={t('common.saving')}
            onClick={() => update.mutate({ industryPreset: preset })}
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
