import { zodResolver } from '@hookform/resolvers/zod';
import {
  formatUtcOffset,
  isOrgTimezone,
  TIMEZONE_UTC_OFFSET_HOURS,
  TIMEZONES,
  UpdateOrganizationSchema,
  type OrganizationDto,
} from '@vippi/shared';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { validationMessage } from '@/shared/lib';
import { Button, Card, CardContent, CardHeader, CardTitle, Field, Input, NativeSelect } from '@/shared/ui';
import { useUpdateOrg } from '../model/use-update-org';

const CompanySchema = z.object({ name: UpdateOrganizationSchema.shape.name.unwrap(), timezone: z.string() });
type CompanyForm = z.infer<typeof CompanySchema>;

function TimezoneOptions({ current }: { current: string }) {
  const { t } = useTranslation();
  return (
    <>
      {isOrgTimezone(current) ? null : <option value={current}>{current}</option>}
      {TIMEZONES.map((tz) => {
        const offset = formatUtcOffset(TIMEZONE_UTC_OFFSET_HOURS[tz]);
        return (
          <option key={tz} value={tz}>
            {tz === 'UTC' ? offset : `${t(`org.tz.${tz}`)} (${offset})`}
          </option>
        );
      })}
    </>
  );
}

export function CompanyCard({ org, editable }: { org: OrganizationDto; editable: boolean }) {
  const { t } = useTranslation();
  const update = useUpdateOrg();
  const form = useForm<CompanyForm>({
    resolver: zodResolver(CompanySchema),
    defaultValues: { name: org.name, timezone: org.timezone },
  });
  const nameError = form.formState.errors.name;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('org.company')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={form.handleSubmit((v) => {
            const timezone = form.formState.dirtyFields.timezone && isOrgTimezone(v.timezone) ? v.timezone : undefined;
            update.mutate(
              { name: v.name, ...(timezone ? { timezone } : {}) },
              { onSuccess: (o) => form.reset({ name: o.name, timezone: o.timezone }) },
            );
          })}
        >
          <Field label={t('org.name')} error={nameError ? validationMessage(nameError.message, nameError.type, t) : undefined}>
            {(c) => <Input {...c} readOnly={!editable} {...form.register('name')} />}
          </Field>
          <Field label={t('org.timezone')} hint={t('org.timezoneHint')}>
            {(c) => (
              <NativeSelect {...c} disabled={!editable} {...form.register('timezone')}>
                <TimezoneOptions current={org.timezone} />
              </NativeSelect>
            )}
          </Field>
          {editable ? (
            <Button type="submit" className="self-start" disabled={!form.formState.isDirty} loading={update.isPending} loadingText={t('common.saving')}>
              {t('common.save')}
            </Button>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
