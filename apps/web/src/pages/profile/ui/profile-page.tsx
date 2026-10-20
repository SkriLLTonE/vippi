import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChangePasswordSchema, UpdateProfileSchema, type ChangePasswordRequest, type MeResponse } from '@vippi/shared';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';
import { setSession, useSession } from '@/entities/session';
import { LocaleSwitch } from '@/features/locale-switch';
import { apiRequest } from '@/shared/api';
import { errorMessage, serverFieldErrors, validationMessage } from '@/shared/lib';
import { Button, Card, CardContent, CardHeader, CardTitle, Field, FormAlert, Input, PageHeader, PasswordInput } from '@/shared/ui';

const NameSchema = z.object({ fullName: UpdateProfileSchema.shape.fullName.unwrap() });
type NameForm = z.infer<typeof NameSchema>;

const PasswordSchema = ChangePasswordSchema.extend({ confirm: z.string() }).refine((v) => v.confirm === v.newPassword, {
  path: ['confirm'],
  message: 'password_mismatch',
});
type PasswordForm = z.infer<typeof PasswordSchema>;

function NameCard() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const me = useSession();
  const form = useForm<NameForm>({ resolver: zodResolver(NameSchema), defaultValues: { fullName: me.user.fullName } });
  const save = useMutation({
    mutationFn: (body: NameForm) => apiRequest<MeResponse>('/me', { method: 'PATCH', body }),
    onSuccess: (next) => {
      setSession(qc, next);
      form.reset({ fullName: next.user.fullName });
      toast.success(t('common.saved'));
    },
  });
  const e = form.formState.errors.fullName;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('profile.personal')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form noValidate onSubmit={form.handleSubmit((v) => save.mutate(v))} className="flex flex-col gap-4">
          <FormAlert>{save.isError ? errorMessage(save.error, t) : null}</FormAlert>
          <Field label={t('profile.fullName')} error={e ? validationMessage(e.message, e.type, t) : undefined}>
            {(c) => <Input {...c} autoComplete="name" {...form.register('fullName')} />}
          </Field>
          <Field label={t('profile.email')}>{(c) => <Input {...c} readOnly value={me.user.email} />}</Field>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">{t('profile.language')}</span>
            <LocaleSwitch className="self-start" />
          </div>
          <Button type="submit" className="self-start" disabled={!form.formState.isDirty} loading={save.isPending} loadingText={t('common.saving')}>
            {t('common.save')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function PasswordCard() {
  const { t } = useTranslation();
  const form = useForm<PasswordForm>({
    resolver: zodResolver(PasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirm: '' },
  });
  const change = useMutation({
    mutationFn: ({ currentPassword, newPassword }: PasswordForm) =>
      apiRequest<void>('/me/password', { method: 'POST', body: { currentPassword, newPassword } satisfies ChangePasswordRequest }),
    onSuccess: () => {
      form.reset();
      toast.success(t('profile.passwordChanged'));
    },
    onError: (err) => {
      for (const { path, code } of serverFieldErrors(err)) {
        if (path === 'currentPassword' || path === 'newPassword') form.setError(path, { message: code });
      }
    },
  });
  const err = (name: keyof PasswordForm) => {
    const e = form.formState.errors[name];
    return e ? validationMessage(e.message, e.type, t) : undefined;
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('profile.password')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form noValidate onSubmit={form.handleSubmit((v) => change.mutate(v))} className="flex flex-col gap-4">
          <FormAlert>
            {change.isError && serverFieldErrors(change.error).length === 0 ? errorMessage(change.error, t) : null}
          </FormAlert>
          <Field label={t('profile.currentPassword')} error={err('currentPassword')}>
            {(c) => <PasswordInput {...c} showLabel={t('auth.showPassword')} hideLabel={t('auth.hidePassword')} autoComplete="current-password" {...form.register('currentPassword')} />}
          </Field>
          <Field label={t('profile.newPassword')} hint={t('auth.passwordHint')} error={err('newPassword')}>
            {(c) => <PasswordInput {...c} showLabel={t('auth.showPassword')} hideLabel={t('auth.hidePassword')} autoComplete="new-password" {...form.register('newPassword')} />}
          </Field>
          <Field label={t('profile.confirmPassword')} error={err('confirm')}>
            {(c) => <PasswordInput {...c} showLabel={t('auth.showPassword')} hideLabel={t('auth.hidePassword')} autoComplete="new-password" {...form.register('confirm')} />}
          </Field>
          <Button type="submit" className="self-start" loading={change.isPending} loadingText={t('common.saving')}>
            {t('profile.changePassword')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function ProfilePage() {
  const { t } = useTranslation();
  return (
    <>
      <PageHeader title={t('profile.title')} />
      <div className="grid max-w-5xl gap-6 lg:grid-cols-2">
        <NameCard />
        <PasswordCard />
      </div>
    </>
  );
}
