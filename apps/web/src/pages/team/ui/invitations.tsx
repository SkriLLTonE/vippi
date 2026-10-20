import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CreateInvitationSchema,
  invitableRoles,
  type CreateInvitationRequest,
  type CreatedInvitationDto,
  type InvitationDto,
} from '@vippi/shared';
import { MailPlus, TriangleAlert, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useSession } from '@/entities/session';
import { apiRequest, isApiError } from '@/shared/api';
import { errorMessage, formatDateTime, validationMessage } from '@/shared/lib';
import {
  Alert,
  Button,
  Code,
  ConfirmDialog,
  CopyButton,
  DelayedSkeleton,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  FormAlert,
  Input,
  NativeSelect,
  Skeleton,
  Table,
  Td,
  Th,
  Tr,
} from '@/shared/ui';

const invitationKeys = { all: ['invitations'] as const };

function InviteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { t } = useTranslation();
  const me = useSession();
  const qc = useQueryClient();
  const roles = invitableRoles(me.role) as CreateInvitationRequest['role'][];
  const form = useForm<CreateInvitationRequest>({
    resolver: zodResolver(CreateInvitationSchema),
    defaultValues: { email: '', role: 'MANAGER' },
  });
  const create = useMutation({
    mutationFn: (body: CreateInvitationRequest) =>
      apiRequest<CreatedInvitationDto>('/invitations', { method: 'POST', body }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: invitationKeys.all }),
    onError: (e) => {
      if (isApiError(e) && (e.code === 'EMAIL_TAKEN' || e.code === 'INVITATION_EXISTS')) {
        form.setError('email', { message: e.code === 'EMAIL_TAKEN' ? 'email_taken' : 'invitation_exists' });
      }
    },
  });
  const close = () => {
    onOpenChange(false);
    create.reset();
    form.reset();
  };
  const emailError = form.formState.errors.email;
  const result = create.data;
  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : close())} title={t('team.inviteTitle')}>
      {result ? (
        <div className="flex flex-col gap-4" data-testid="invite-result">
          <p className="text-sm">{t('team.inviteCreated', { email: result.email, role: t(`role.${result.role}`) })}</p>
          <Code>
            <span data-testid="invite-url">{result.inviteUrl}</span>
          </Code>
          <Alert tone="warning" icon={<TriangleAlert aria-hidden />}>
            {t('team.inviteOnce')}
          </Alert>
          <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
            <Button variant="outline" onClick={close}>
              {t('common.done')}
            </Button>
            <CopyButton text={result.inviteUrl} variant="default" label={t('team.copyLink')} />
          </div>
        </div>
      ) : (
        <form noValidate onSubmit={form.handleSubmit((v) => create.mutate(v))} className="flex flex-col gap-4">
          <FormAlert>
            {create.error && !(isApiError(create.error) && ['EMAIL_TAKEN', 'INVITATION_EXISTS'].includes(create.error.code))
              ? errorMessage(create.error, t)
              : null}
          </FormAlert>
          <Field label={t('auth.email')} error={emailError ? validationMessage(emailError.message, emailError.type, t) : undefined}>
            {(c) => <Input {...c} type="email" autoComplete="off" autoFocus {...form.register('email')} />}
          </Field>
          <Field label={t('team.role')}>
            {(c) => (
              <NativeSelect {...c} {...form.register('role')}>
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {t(`role.${r}`)}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
          <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
            <Button variant="outline" onClick={close}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={create.isPending} loadingText={t('common.saving')}>
              {t('team.invite')}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

export function InvitationsTab() {
  const { t } = useTranslation();
  const me = useSession();
  const qc = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [revoking, setRevoking] = useState<InvitationDto | null>(null);
  const list = useQuery({
    queryKey: invitationKeys.all,
    queryFn: ({ signal }) => apiRequest<InvitationDto[]>('/invitations', { signal }),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => apiRequest<void>(`/invitations/${id}/revoke`, { method: 'POST' }),
    onSuccess: () => {
      setRevoking(null);
      toast.success(t('team.revoked'));
      void qc.invalidateQueries({ queryKey: invitationKeys.all });
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  });
  const canRevoke = (inv: InvitationDto) => me.role === 'OWNER' || inv.invitedBy?.id === me.user.id;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button onClick={() => setInviteOpen(true)} data-testid="invite-button">
          <UserPlus aria-hidden />
          {t('team.invite')}
        </Button>
      </div>
      {list.isPending ? (
        <DelayedSkeleton>
          <Skeleton className="h-24" />
        </DelayedSkeleton>
      ) : list.isError ? (
        <ErrorState message={errorMessage(list.error, t)} onRetry={() => void list.refetch()} />
      ) : list.data.length === 0 ? (
        <EmptyState icon={MailPlus} title={t('team.noInvitations')} />
      ) : (
        <Table caption={t('team.invitations')}>
          <thead>
            <tr>
              <Th>{t('auth.email')}</Th>
              <Th>{t('team.role')}</Th>
              <Th className="hidden md:table-cell">{t('team.invitedBy')}</Th>
              <Th>{t('team.expires')}</Th>
              <Th>
                <span className="sr-only">{t('common.actions')}</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {list.data.map((inv) => (
              <Tr key={inv.id}>
                <Td>{inv.email}</Td>
                <Td>{t(`role.${inv.role}`)}</Td>
                <Td className="hidden md:table-cell">{inv.invitedBy?.fullName ?? '—'}</Td>
                <Td className="tabular">{formatDateTime(inv.expiresAt)}</Td>
                <Td className="text-right">
                  {canRevoke(inv) ? (
                    <Button variant="ghost" size="sm" className="text-danger" onClick={() => setRevoking(inv)}>
                      {t('team.revoke')}
                    </Button>
                  ) : null}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} />
      <ConfirmDialog
        open={!!revoking}
        onOpenChange={(v) => (v ? undefined : setRevoking(null))}
        title={t('team.revokeTitle', { email: revoking?.email ?? '' })}
        description={t('team.revokeText')}
        confirmLabel={t('team.revoke')}
        loading={revoke.isPending}
        onConfirm={() => revoking && revoke.mutate(revoking.id)}
      />
    </div>
  );
}
