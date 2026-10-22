import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  INDUSTRY_PRESETS,
  RegisterOrganizationSchema,
  type MeResponse,
  type RegisterOrganizationRequest,
} from '@vippi/shared';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { setSession } from '@/entities/session';
import { LocaleSwitch } from '@/features/locale-switch';
import { apiRequest, isApiError } from '@/shared/api';
import { applyLocale, currentLocale } from '@/shared/i18n';
import { errorMessage, validationMessage } from '@/shared/lib';
import { AuthLayout, Button, Field, FormAlert, Input, NativeSelect, PasswordInput } from '@/shared/ui';

type RegisterInput = RegisterOrganizationRequest;

export function RegisterPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const form = useForm<RegisterInput>({
    resolver: zodResolver(RegisterOrganizationSchema),
    defaultValues: {
      organizationName: '',
      industryPreset: 'REAL_ESTATE',
      fullName: '',
      email: '',
      password: '',
      locale: currentLocale(),
    },
  });
  const register = useMutation({
    mutationFn: (body: RegisterInput) =>
      apiRequest<MeResponse>('/auth/register-organization', { method: 'POST', body }),
    onSuccess: (me) => {
      setSession(qc, me);
      applyLocale(me.user.locale);
      void navigate('/leads?welcome=1', { replace: true });
    },
    onError: (e) => {
      if (isApiError(e) && e.code === 'EMAIL_TAKEN') form.setError('email', { message: 'email_taken' });
    },
  });
  const err = (name: keyof RegisterInput) => {
    const e = form.formState.errors[name];
    return e ? validationMessage(e.message, e.type, t) : undefined;
  };
  const emailTaken = form.formState.errors.email?.message === 'email_taken';
  const generalError =
    register.error && !(isApiError(register.error) && register.error.code === 'EMAIL_TAKEN')
      ? errorMessage(register.error, t)
      : null;

  return (
    <AuthLayout
      title={t('auth.registerTitle')}
      subtitle={t('auth.registerSubtitle')}
      aside={<LocaleSwitch />}
      footer={
        <>
          {t('auth.haveAccount')}{' '}
          <Link to="/login" className="font-medium text-primary hover:underline">
            {t('auth.login')}
          </Link>
        </>
      }
    >
      <form noValidate onSubmit={form.handleSubmit((v) => register.mutate(v))} className="flex flex-col gap-4">
        <FormAlert>{generalError}</FormAlert>
        <Field label={t('auth.organizationName')} error={err('organizationName')}>
          {(c) => <Input {...c} autoComplete="organization" autoFocus {...form.register('organizationName')} />}
        </Field>
        <Field label={t('industry.label')} hint={t('industry.registerHint')} error={err('industryPreset')}>
          {(c) => (
            <NativeSelect {...c} {...form.register('industryPreset')}>
              {INDUSTRY_PRESETS.map((p) => (
                <option key={p} value={p}>
                  {t(`industry.preset.${p}`)}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
        <Field label={t('auth.fullName')} error={err('fullName')}>
          {(c) => <Input {...c} autoComplete="name" {...form.register('fullName')} />}
        </Field>
        <Field
          label={t('auth.email')}
          error={
            emailTaken ? (
              <>
                {t('errors.EMAIL_TAKEN')}{' '}
                <Link to="/login" className="underline">
                  {t('auth.login')}
                </Link>
              </>
            ) : (
              err('email')
            )
          }
        >
          {(c) => <Input {...c} type="email" autoComplete="email" {...form.register('email')} />}
        </Field>
        <Field label={t('auth.password')} hint={t('auth.passwordHint')} error={err('password')}>
          {(c) => (
            <PasswordInput
              {...c}
              autoComplete="new-password"
              showLabel={t('auth.showPassword')}
              hideLabel={t('auth.hidePassword')}
              {...form.register('password')}
            />
          )}
        </Field>
        <Field label={t('profile.language')}>
          {(c) => (
            <NativeSelect {...c} {...form.register('locale')}>
              <option value="ru">Русский</option>
              <option value="uz">Oʻzbekcha</option>
            </NativeSelect>
          )}
        </Field>
        <Button type="submit" size="lg" loading={register.isPending} loadingText={t('common.saving')}>
          {t('auth.createCompany')}
        </Button>
      </form>
    </AuthLayout>
  );
}
