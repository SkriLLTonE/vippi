import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LoginSchema, type LoginRequest, type MeResponse } from '@vippi/shared';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { homePath, setSession } from '@/entities/session';
import { LocaleSwitch } from '@/features/locale-switch';
import { apiRequest, isApiError } from '@/shared/api';
import { applyLocale } from '@/shared/i18n';
import { errorMessage, validationMessage } from '@/shared/lib';
import { Alert, AuthLayout, Button, Field, FormAlert, Input, PasswordInput } from '@/shared/ui';

function safeNext(next: string | null): string | null {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : null;
}

export function LoginPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const form = useForm<LoginRequest>({ resolver: zodResolver(LoginSchema), defaultValues: { email: '', password: '' } });
  const login = useMutation({
    mutationFn: (body: LoginRequest) => apiRequest<MeResponse>('/auth/login', { method: 'POST', body }),
    onSuccess: (me) => {
      setSession(qc, me);
      applyLocale(me.user.locale);
      void navigate(safeNext(params.get('next')) ?? homePath(me), { replace: true });
    },
  });
  const err = (name: keyof LoginRequest) => {
    const e = form.formState.errors[name];
    return e ? validationMessage(e.message, e.type, t) : undefined;
  };
  const error = login.error
    ? isApiError(login.error) && login.error.code === 'INVALID_CREDENTIALS'
      ? t('auth.invalidCredentials')
      : errorMessage(login.error, t)
    : null;

  return (
    <AuthLayout
      title={t('auth.loginTitle')}
      aside={<LocaleSwitch />}
      footer={
        <>
          {t('auth.noAccount')}{' '}
          <Link to="/register" className="font-medium text-primary hover:underline">
            {t('auth.registerCompany')}
          </Link>
        </>
      }
    >
      <form noValidate onSubmit={form.handleSubmit((v) => login.mutate(v))} className="flex flex-col gap-4">
        {params.get('expired') ? <Alert tone="info">{t('auth.sessionExpired')}</Alert> : null}
        <FormAlert>{error}</FormAlert>
        <Field label={t('auth.email')} error={err('email')}>
          {(c) => <Input {...c} type="email" autoComplete="email" autoFocus {...form.register('email')} />}
        </Field>
        <Field label={t('auth.password')} error={err('password')}>
          {(c) => (
            <PasswordInput
              {...c}
              autoComplete="current-password"
              showLabel={t('auth.showPassword')}
              hideLabel={t('auth.hidePassword')}
              {...form.register('password')}
            />
          )}
        </Field>
        <Button type="submit" size="lg" loading={login.isPending} loadingText={t('auth.loggingIn')}>
          {t('auth.login')}
        </Button>
        <p className="text-center text-xs text-subtle-foreground">{t('auth.demoHint')}</p>
      </form>
    </AuthLayout>
  );
}
