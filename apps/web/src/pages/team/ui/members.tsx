import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { MemberDto, Role } from '@vippi/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { memberKeys, useMembers } from '@/entities/member';
import { useCan, useSession } from '@/entities/session';
import { apiRequest } from '@/shared/api';
import { cn, errorMessage, formatDate } from '@/shared/lib';
import {
  Badge,
  Button,
  ConfirmDialog,
  DelayedSkeleton,
  ErrorState,
  NativeSelect,
  Skeleton,
  Table,
  Td,
  Th,
  Tr,
} from '@/shared/ui';

type Pending = { kind: 'role'; member: MemberDto; role: Exclude<Role, 'OWNER'> } | { kind: 'deactivate'; member: MemberDto };

export function MembersTab() {
  const { t } = useTranslation();
  const me = useSession();
  const can = useCan();
  const qc = useQueryClient();
  const members = useMembers();
  const [pending, setPending] = useState<Pending | null>(null);
  const done = (message: string) => {
    setPending(null);
    toast.success(message);
    void qc.invalidateQueries({ queryKey: memberKeys.all });
    void qc.invalidateQueries({ queryKey: ['leads'] });
  };
  const changeRole = useMutation({
    mutationFn: (p: { id: string; role: Role }) => apiRequest<void>(`/members/${p.id}`, { method: 'PATCH', body: { role: p.role } }),
    onSuccess: () => done(t('team.roleChanged')),
    onError: (e) => toast.error(errorMessage(e, t)),
  });
  const deactivate = useMutation({
    mutationFn: (id: string) => apiRequest<{ unassignedLeads: number }>(`/members/${id}/deactivate`, { method: 'POST' }),
    onSuccess: (r) => done(t('team.deactivated', { count: r.unassignedLeads })),
    onError: (e) => toast.error(errorMessage(e, t)),
  });
  const manage = can('member.manage');

  if (members.isPending) {
    return (
      <DelayedSkeleton>
        <Skeleton className="h-40" />
      </DelayedSkeleton>
    );
  }
  if (members.isError) return <ErrorState message={errorMessage(members.error, t)} onRetry={() => void members.refetch()} />;

  return (
    <>
      <Table caption={t('team.members')}>
        <thead>
          <tr>
            <Th>{t('auth.fullName')}</Th>
            <Th className="hidden md:table-cell">{t('auth.email')}</Th>
            <Th>{t('team.role')}</Th>
            <Th>{t('team.status')}</Th>
            <Th className="hidden lg:table-cell">{t('team.since')}</Th>
            {manage ? (
              <Th>
                <span className="sr-only">{t('common.actions')}</span>
              </Th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {members.data.map((m) => {
            const editable = manage && m.userId !== me.user.id && m.role !== 'OWNER' && m.status === 'ACTIVE';
            return (
              <Tr key={m.id} className={cn(m.status === 'DEACTIVATED' && 'text-muted-foreground')}>
                <Td className="font-medium">{m.fullName}</Td>
                <Td className="hidden md:table-cell">{m.email ?? '—'}</Td>
                <Td>
                  {editable ? (
                    <NativeSelect
                      className="w-44"
                      aria-label={t('team.changeRoleFor', { name: m.fullName })}
                      value={m.role}
                      onChange={(e) => setPending({ kind: 'role', member: m, role: e.target.value as Exclude<Role, 'OWNER'> })}
                    >
                      <option value="HEAD_OF_SALES">{t('role.HEAD_OF_SALES')}</option>
                      <option value="MANAGER">{t('role.MANAGER')}</option>
                    </NativeSelect>
                  ) : (
                    t(`role.${m.role}`)
                  )}
                </Td>
                <Td>
                  <Badge className={m.status === 'ACTIVE' ? 'bg-success-bg text-success' : 'bg-status-lost-bg text-status-lost'}>
                    {t(`team.memberStatus.${m.status}`)}
                  </Badge>
                </Td>
                <Td className="hidden tabular lg:table-cell">{m.createdAt ? formatDate(m.createdAt) : '—'}</Td>
                {manage ? (
                  <Td className="text-right">
                    {editable ? (
                      <Button variant="ghost" size="sm" className="text-danger" onClick={() => setPending({ kind: 'deactivate', member: m })}>
                        {t('team.deactivate')}
                      </Button>
                    ) : null}
                  </Td>
                ) : null}
              </Tr>
            );
          })}
        </tbody>
      </Table>
      <ConfirmDialog
        open={pending?.kind === 'role'}
        onOpenChange={(v) => (v ? undefined : setPending(null))}
        destructive={false}
        title={
          pending?.kind === 'role'
            ? t('team.changeRoleTitle', { name: pending.member.fullName, role: t(`role.${pending.role}`) })
            : ''
        }
        description={t('team.changeRoleText')}
        confirmLabel={t('team.changeRole')}
        loading={changeRole.isPending}
        onConfirm={() => pending?.kind === 'role' && changeRole.mutate({ id: pending.member.id, role: pending.role })}
      />
      <ConfirmDialog
        open={pending?.kind === 'deactivate'}
        onOpenChange={(v) => (v ? undefined : setPending(null))}
        title={pending ? t('team.deactivateTitle', { name: pending.member.fullName }) : ''}
        description={pending ? t('team.deactivateText', { name: pending.member.fullName, count: pending.member.openLeads ?? 0 }) : ''}
        confirmLabel={t('team.deactivate')}
        loading={deactivate.isPending}
        onConfirm={() => pending?.kind === 'deactivate' && deactivate.mutate(pending.member.id)}
      />
    </>
  );
}
