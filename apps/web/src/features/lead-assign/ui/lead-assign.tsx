import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { LeadDto, UserRef } from '@vippi/shared';
import { Hand } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { onLeadChanged } from '@/entities/lead';
import { useAssignees } from '@/entities/member';
import { apiRequest } from '@/shared/api';
import { errorMessage } from '@/shared/lib';
import { Button, NativeSelect, type ButtonProps } from '@/shared/ui';

/** Assign / unassign (O, H; FR-012). Saves on change. */
export function AssignSelect({
  leadId,
  leadNumber,
  assignee,
  className,
}: {
  leadId: string;
  leadNumber: number;
  assignee: UserRef | null;
  className?: string;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const assignees = useAssignees();
  const assign = useMutation({
    mutationFn: (assigneeId: string | null) =>
      apiRequest<LeadDto>(`/leads/${leadId}/assign`, { method: 'POST', body: { assigneeId } }),
    onSuccess: (lead) => {
      onLeadChanged(qc, lead);
      toast.success(
        lead.assignee ? t('lead.assignedTo', { name: lead.assignee.fullName }) : t('lead.unassignedToast'),
      );
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  });
  const options = assignee && !assignees.some((a) => a.id === assignee.id) ? [assignee, ...assignees] : assignees;
  return (
    <NativeSelect
      className={className}
      aria-label={t('lead.assignLabel', { number: leadNumber })}
      value={assignee?.id ?? ''}
      disabled={assign.isPending}
      aria-busy={assign.isPending || undefined}
      onChange={(e) => assign.mutate(e.target.value || null)}
    >
      <option value="">{t('lead.unassigned')}</option>
      {options.map((m) => (
        <option key={m.id} value={m.id}>
          {m.fullName}
        </option>
      ))}
    </NativeSelect>
  );
}

/** «Взять себе» for managers on unassigned leads (FR-012). */
export function TakeLeadButton({ leadId, ...props }: { leadId: string } & Omit<ButtonProps, 'onClick'>) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const take = useMutation({
    mutationFn: () => apiRequest<LeadDto>(`/leads/${leadId}/take`, { method: 'POST' }),
    onSuccess: (lead) => {
      onLeadChanged(qc, lead);
      toast.success(t('lead.taken', { number: lead.number }));
    },
    onError: (e) => {
      toast.error(errorMessage(e, t));
      onLeadChanged(qc, undefined, leadId);
    },
  });
  return (
    <Button variant="outline" {...props} loading={take.isPending} onClick={() => take.mutate()}>
      <Hand aria-hidden />
      {t('lead.takeMine')}
    </Button>
  );
}
