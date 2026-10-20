import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AcceptInvitationSchema, type InvitationPreviewDto, type MeResponse } from '@vippi/shared';
import { MailX } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { type z } from 'zod';
import { homePath, setSession } from '@/entities/session';
import { LocaleSwitch } from '@/features/locale-switch';
import { apiRequest, isApiError } from '@/shared/api';
import { applyLocale } from '@/shared/i18n';
import { errorMessage, validationMessage } from '@/shared/lib';
import {
  AuthLayout,
  Button,
  DelayedSkeleton,
  EmptyState,
  ErrorState,
  Field,
  FormAlert,
  Input,
  PasswordInput,
  Skeleton,
} from '@/shared/ui';

const FormSchema = AcceptInvitationSchema.omit({ token: true });
type FormValues = z.infer<typeof FormSchema>;

export function AcceptInvitationPage() {
  const { t } = useTranslation();
  const { token = '' } = useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const preview = useQuery({
    queryKey: ['invitation-preview', token],
    queryFn: ({ signal }) => apiRequest<InvitationPreviewDto>('/invitations/preview', { query: { token }, signal }),
    retry: false,
  });
  const form = useForm<FormValues>({ resolver: zodResolver(FormSchema), defaultValues: { fullName: '', password: '' } });
  const accept = useMutation({
    mutationFn: (v: FormValues) =>
      apiRequest<MeResponse>('/invitations/accept', { method: 'POST', body: { ...v, token } }),
    onSuccess: (me) => {
      setSession(qc, me);
      applyLocale(me.user.locale);
      void navigate(homePath(me), { replace: true });
    },
  });
  const err = (name: keyof FormValues) => {
    const e = form.formState.errors[name];
    return e ? validationMessage(e.message, e.type, t) : undefined;
  };

  const invalid =
    (isApiError(preview.error) && [400, 404, 410].includes(preview.error.status)) ||
    (isApiError(accept.error) && accept.error.code === 'INVITATION_INVALID');

  if (invalid) {
    return (
      <AuthLayout title={t('invite.title')} aside={<LocaleSwitch />}>
        <EmptyState
          icon={MailX}
          title={t('invite.invalid')}
          action={
            <Button asChild variant="outline">
              <Link to="/login">{t('auth.login')}</Link>
            </Button>
          }
        />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={t('invite.title')}
      aside={<LocaleSwitch />}
      subtitle={
        preview.data
          ? t('invite.subtitle', { organization: preview.data.organizationName, role: t(`role.${preview.data.role}`) })
          : undefined
      }
    >
      {preview.isPending ? (
        <DelayedSkeleton>
          <div className="flex flex-col gap-3">
            <Skeleton className="h-9" />
            <Skeleton className="h-9" />
            <Skeleton className="h-10" />
          </div>
        </DelayedSkeleton>
      ) : preview.isError ? (
        <ErrorState message={errorMessage(preview.error, t)} onRetry={() => void preview.refetch()} />
      ) : (
        <form noValidate onSubmit={form.handleSubmit((v) => accept.mutate(v))} className="flex flex-col gap-4">
          <FormAlert>
            {accept.error
              ? isApiError(accept.error) && accept.error.code === 'EMAIL_TAKEN'
                ? t('invite.emailTaken')
                : errorMessage(accept.error, t)
              : null}
          </FormAlert>
          <Field label={t('auth.fullName')} error={err('fullName')}>
            {(c) => <Input {...c} autoComplete="name" autoFocus {...form.register('fullName')} />}
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
          <Button type="submit" size="lg" loading={accept.isPending} loadingText={t('common.saving')}>
            {t('invite.join')}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
