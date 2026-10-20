import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addDaysToDateString,
  computeDueAt,
  parseDateOnly,
  SlaPolicySchema,
  zonedParts,
  zonedTimeToUtc,
  type SlaPolicyDto,
  type SlaPolicyRequest,
} from '@vippi/shared';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useFeature } from '@/entities/session';
import { apiRequest } from '@/shared/api';
import { cn, errorMessage, todayTashkent, validationMessage } from '@/shared/lib';
import { Button, Card, CardContent, DelayedSkeleton, ErrorState, Field, FormAlert, Input, NativeSelect, Skeleton, Switch } from '@/shared/ui';
import { SettingsLayout } from '@/widgets/settings-nav';

const TIMES = Array.from({ length: 96 }, (_, i) => `${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`);
const DAYS = [1, 2, 3, 4, 5, 6, 7];

/** Example for the preview: the coming Friday 20:00 (UX §5.9). */
function exampleReceivedAt(): Date {
  let day = todayTashkent();
  for (let i = 0; i < 7; i++) {
    const { year, month, day: d } = parseDateOnly(day);
    const at = zonedTimeToUtc({ year, month, day: d, hour: 20, minute: 0 });
    if (zonedParts(at).weekday === 5) return at;
    day = addDaysToDateString(day, 1);
  }
  return new Date();
}

function SlaForm({ policy }: { policy: SlaPolicyDto }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const businessHoursFeature = useFeature('BUSINESS_HOURS');
  const form = useForm<SlaPolicyRequest>({
    resolver: zodResolver(SlaPolicySchema),
    defaultValues: {
      firstResponseMinutes: policy.firstResponseMinutes,
      forgottenAfterHours: policy.forgottenAfterHours,
      businessHoursEnabled: policy.businessHoursEnabled,
      workdays: policy.workdays,
      workStart: policy.workStart,
      workEnd: policy.workEnd,
    },
  });
  const save = useMutation({
    mutationFn: (body: SlaPolicyRequest) => apiRequest<SlaPolicyDto>('/sla-policy', { method: 'PUT', body }),
    onSuccess: (saved) => {
      qc.setQueryData(['sla-policy'], saved);
      const { updatedAt: _updatedAt, ...values } = saved;
      form.reset(values);
      toast.success(t('common.saved'));
    },
  });

  const values = useWatch({ control: form.control });
  const err = (name: keyof SlaPolicyRequest) => {
    const e = form.formState.errors[name];
    return e ? validationMessage(e.message, e.type, t) : undefined;
  };

  const example = exampleReceivedAt();
  const parsed = SlaPolicySchema.safeParse(values);
  const due = parsed.success ? computeDueAt(example, parsed.data) : null;
  const fmt = (d: Date) => {
    const p = zonedParts(d);
    return `${t(`weekday.${p.weekday}`)} ${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
  };

  return (
    <form noValidate onSubmit={form.handleSubmit((v) => save.mutate(v))} className="flex max-w-2xl flex-col gap-6">
      <FormAlert>{save.isError ? errorMessage(save.error, t) : null}</FormAlert>
      <Card>
        <CardContent className="flex flex-col gap-5 pt-4 md:pt-6">
          <Field label={t('sla.settings.minutes')} hint={t('sla.settings.minutesHint')} error={err('firstResponseMinutes')}>
            {(c) => (
              <div className="flex flex-wrap items-center gap-2">
                <Input {...c} type="number" min={1} max={1440} className="w-28" {...form.register('firstResponseMinutes', { valueAsNumber: true })} />
                {[5, 15, 30, 60].map((m) => (
                  <Button
                    key={m}
                    variant={values.firstResponseMinutes === m ? 'secondary' : 'outline'}
                    size="sm"
                    aria-pressed={values.firstResponseMinutes === m}
                    onClick={() => form.setValue('firstResponseMinutes', m, { shouldDirty: true, shouldValidate: true })}
                  >
                    {t('duration.m', { count: m })}
                  </Button>
                ))}
              </div>
            )}
          </Field>
          <Field label={t('sla.settings.forgotten')} hint={t('sla.settings.forgottenHint')} error={err('forgottenAfterHours')}>
            {(c) => <Input {...c} type="number" min={1} max={168} className="w-28" {...form.register('forgottenAfterHours', { valueAsNumber: true })} />}
          </Field>
        </CardContent>
      </Card>

      {businessHoursFeature ? (
        <Card>
          <CardContent className="flex flex-col gap-5 pt-4 md:pt-6">
            <div className="flex items-center justify-between gap-4">
              <label htmlFor="business-hours" className="text-sm font-medium">
                {t('sla.settings.businessHours')}
              </label>
              <Switch
                id="business-hours"
                checked={!!values.businessHoursEnabled}
                onCheckedChange={(v) => form.setValue('businessHoursEnabled', v, { shouldDirty: true })}
              />
            </div>
            {values.businessHoursEnabled ? (
              <>
                <fieldset>
                  <legend className="mb-2 text-sm font-medium">{t('sla.settings.workdays')}</legend>
                  <div className="flex flex-wrap gap-1">
                    {DAYS.map((d) => {
                      const selected = values.workdays?.includes(d) ?? false;
                      return (
                        <button
                          key={d}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => {
                            const current = form.getValues('workdays');
                            const next = selected ? current.filter((x) => x !== d) : [...current, d].sort();
                            form.setValue('workdays', next, { shouldDirty: true, shouldValidate: true });
                          }}
                          className={cn(
                            'h-9 min-w-12 rounded-md border px-2 text-sm font-medium max-md:h-11',
                            selected ? 'border-primary bg-primary-subtle text-primary' : 'border-border-strong text-muted-foreground',
                          )}
                        >
                          {t(`weekday.${d}`)}
                        </button>
                      );
                    })}
                  </div>
                  {err('workdays') ? (
                    <p className="mt-1 text-xs text-danger" role="alert">
                      {err('workdays')}
                    </p>
                  ) : null}
                </fieldset>
                <div className="flex flex-wrap gap-4">
                  <Field label={t('sla.settings.start')} error={err('workStart')}>
                    {(c) => (
                      <NativeSelect {...c} className="w-28" {...form.register('workStart')}>
                        {TIMES.map((x) => (
                          <option key={x}>{x}</option>
                        ))}
                      </NativeSelect>
                    )}
                  </Field>
                  <Field label={t('sla.settings.end')} error={err('workEnd')}>
                    {(c) => (
                      <NativeSelect {...c} className="w-28" {...form.register('workEnd')}>
                        {TIMES.map((x) => (
                          <option key={x}>{x}</option>
                        ))}
                      </NativeSelect>
                    )}
                  </Field>
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {due ? (
        <p className="text-sm text-muted-foreground" data-testid="sla-preview">
          {t('sla.settings.preview', { received: fmt(example), due: fmt(due) })}
        </p>
      ) : null}
      <p className="text-sm text-muted-foreground">{t('sla.settings.appliesToNew')}</p>
      <div>
        <Button type="submit" loading={save.isPending} loadingText={t('common.saving')} disabled={!form.formState.isDirty}>
          {t('common.save')}
        </Button>
      </div>
    </form>
  );
}

export function SettingsSlaPage() {
  const { t } = useTranslation();
  const policy = useQuery({
    queryKey: ['sla-policy'],
    queryFn: ({ signal }) => apiRequest<SlaPolicyDto>('/sla-policy', { signal }),
  });
  return (
    <SettingsLayout>
      {policy.isPending ? (
        <DelayedSkeleton>
          <Skeleton className="h-64 max-w-2xl" />
        </DelayedSkeleton>
      ) : policy.isError ? (
        <ErrorState message={errorMessage(policy.error, t)} onRetry={() => void policy.refetch()} />
      ) : (
        <SlaForm policy={policy.data} />
      )}
    </SettingsLayout>
  );
}
