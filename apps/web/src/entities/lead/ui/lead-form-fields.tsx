import {
  CURRENCIES,
  DISTRICTS,
  INDUSTRY_TEMPLATES,
  LEAD_SOURCES,
  PROPERTY_TYPES,
  localizedLabel,
  type Industry,
  type IndustryPreset,
  type LeadFieldDef,
  type UserRef,
} from '@vippi/shared';
import { Controller, type UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { validationMessage } from '@/shared/lib';
import { Field, Input, NativeSelect, PhoneInput, Textarea } from '@/shared/ui';
import type { LeadFormInput, LeadFormValues } from '../model/lead-form';

interface LeadFormFieldsProps {
  form: UseFormReturn<LeadFormInput, unknown, LeadFormValues>;
  /** Shown only for roles that can assign (O, H). */
  assignees?: UserRef[];
  sourceLocked?: boolean;
  /** Real-estate fields (district, property type, rooms) are rendered only for REAL_ESTATE (ADR-024). */
  industryPreset?: IndustryPreset;
  /** Organization custom fields to render. */
  leadFields?: readonly LeadFieldDef[];
  /** ADR-025: industry sample drives the placeholders. */
  industry?: Industry;
}

/** FR-010 fields; phone is masked `+998 (XX) XXX-XX-XX`. */
export function LeadFormFields({
  form,
  assignees,
  sourceLocked,
  industryPreset = 'REAL_ESTATE',
  leadFields = [],
  industry = industryPreset === 'REAL_ESTATE' ? 'REAL_ESTATE' : 'OTHER',
}: LeadFormFieldsProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'uz' ? 'uz' : 'ru';
  const sample = INDUSTRY_TEMPLATES[industry].sample;
  const textPlaceholder = (key: string) => {
    const v = sample.attributes[key];
    return typeof v === 'string' ? v : undefined;
  };
  const { register, formState } = form;
  const err = (name: Exclude<keyof LeadFormInput, 'attributes' | 'attributeCurrencies'>) => {
    const e = formState.errors[name];
    return e ? validationMessage(e.message, e.type, t) : undefined;
  };
  const messageLength = form.watch('message')?.length ?? 0;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Field label={t('lead.field.fullName')} error={err('fullName')}>
        {(c) => <Input {...c} autoComplete="off" {...register('fullName')} />}
      </Field>
      <Field label={t('lead.field.phone')} hint={t('lead.phoneHint')} error={err('phone')}>
        {(c) => (
          <Controller
            control={form.control}
            name="phone"
            render={({ field }) => (
              <PhoneInput {...c} ref={field.ref} name={field.name} value={field.value} onChange={field.onChange} onBlur={field.onBlur} />
            )}
          />
        )}
      </Field>
      <Field label={t('lead.field.source')} error={err('source')} hint={sourceLocked ? t('lead.sourceLocked') : undefined}>
        {(c) => (
          <NativeSelect {...c} disabled={sourceLocked} {...register('source')}>
            {LEAD_SOURCES.map((s) => (
              <option key={s} value={s}>
                {t(`lead.source.${s}`)}
              </option>
            ))}
          </NativeSelect>
        )}
      </Field>
      <Field label={t('lead.field.sourceDetail')} error={err('sourceDetail')}>
        {(c) => <Input {...c} placeholder={t('lead.sourceDetailPlaceholder')} {...register('sourceDetail')} />}
      </Field>
      <Field
        className="md:col-span-2"
        label={t('lead.field.message')}
        error={err('message')}
        aside={<span className="text-xs text-subtle-foreground tabular">{messageLength}/4000</span>}
      >
        {(c) => (
          <Textarea
            {...c}
            rows={3}
            placeholder={t('lead.messagePlaceholder', { example: sample.message[locale] })}
            {...register('message')}
          />
        )}
      </Field>
      <Field label={t('lead.field.budget')} error={err('budgetAmount')}>
        {(c) => (
          <div className="flex gap-2">
            <Input {...c} inputMode="numeric" className="flex-1" {...register('budgetAmount')} />
            <NativeSelect aria-label={t('lead.field.currency')} className="w-24" {...register('budgetCurrency')}>
              {CURRENCIES.map((cur) => (
                <option key={cur} value={cur}>
                  {cur}
                </option>
              ))}
            </NativeSelect>
          </div>
        )}
      </Field>
      {industryPreset === 'REAL_ESTATE' ? (
        <>
          <Field label={t('lead.field.district')} error={err('district')}>
            {(c) => (
              <NativeSelect {...c} {...register('district')}>
                <option value="">{t('common.notSpecified')}</option>
                {DISTRICTS.map((d) => (
                  <option key={d.code} value={d.code}>
                    {d[locale]}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
          <Field label={t('lead.field.propertyType')} error={err('propertyType')}>
            {(c) => (
              <NativeSelect {...c} {...register('propertyType')}>
                <option value="">{t('common.notSpecified')}</option>
                {PROPERTY_TYPES.map((p) => (
                  <option key={p} value={p}>
                    {t(`lead.propertyType.${p}`)}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
          <Field label={t('lead.field.rooms')} error={err('rooms')}>
            {(c) => <Input {...c} inputMode="numeric" {...register('rooms')} />}
          </Field>
        </>
      ) : null}
      {leadFields.map((def) => {
        const label = `${localizedLabel(def.label, locale) ?? def.key}${def.required ? ' *' : ''}`;
        const e = formState.errors.attributes?.[def.key];
        const error = e ? validationMessage(e.message, e.type, t) : undefined;
        return (
          <Field key={def.key} label={label} error={error}>
            {(c) => {
              switch (def.type) {
                case 'single_select':
                  return (
                    <NativeSelect {...c} {...register(`attributes.${def.key}`)}>
                      <option value="">{t('common.notSpecified')}</option>
                      {(def.options ?? []).map((o) => (
                        <option key={o.value} value={o.value}>
                          {localizedLabel(o.label, locale) ?? o.value}
                        </option>
                      ))}
                    </NativeSelect>
                  );
                case 'money':
                  return (
                    <div className="flex gap-2">
                      <Input {...c} inputMode="numeric" className="flex-1" {...register(`attributes.${def.key}`)} />
                      <NativeSelect
                        aria-label={t('lead.field.currency')}
                        className="w-24"
                        {...register(`attributeCurrencies.${def.key}`)}
                      >
                        {CURRENCIES.map((cur) => (
                          <option key={cur} value={cur}>
                            {cur}
                          </option>
                        ))}
                      </NativeSelect>
                    </div>
                  );
                case 'number':
                  return <Input {...c} inputMode="decimal" {...register(`attributes.${def.key}`)} />;
                default:
                  return (
                    <Input
                      {...c}
                      autoComplete="off"
                      maxLength={500}
                      placeholder={textPlaceholder(def.key)}
                      {...register(`attributes.${def.key}`)}
                    />
                  );
              }
            }}
          </Field>
        );
      })}
      {assignees ? (
        <Field className="md:col-span-2" label={t('lead.field.assignee')} error={err('assigneeId')}>
          {(c) => (
            <NativeSelect {...c} {...register('assigneeId')}>
              <option value="">{t('lead.unassigned')}</option>
              {assignees.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.fullName}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
      ) : null}
    </div>
  );
}
