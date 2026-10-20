import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { LeadDto } from '@vippi/shared';
import { ArrowRightLeft, Ellipsis, PencilLine, PhoneOutgoing, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { DuplicateBadge, ForgottenBadge, LeadStatusBadge, SlaBadge } from '@/entities/lead';
import { AssignSelect, TakeLeadButton } from '@/features/lead-assign';
import { apiRequest } from '@/shared/api';
import { errorMessage } from '@/shared/lib';
import {
  Button,
  ConfirmDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui';
import { useLeadAccess } from '../model/use-lead-access';
import { ChangeStatusDialog } from './change-status-dialog';
import { EditLeadDialog } from './edit-lead-dialog';
import { FirstContactDialog } from './first-contact-dialog';

export function LeadHeader({ lead }: { lead: LeadDto }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const access = useLeadAccess(lead);
  const [dialog, setDialog] = useState<'contact' | 'status' | 'edit' | 'delete' | null>(null);
  const close = (open: boolean) => (open ? undefined : setDialog(null));
  const needsContact = lead.status === 'NEW' && !lead.firstResponseAt;

  const remove = useMutation({
    mutationFn: () => apiRequest<void>(`/leads/${lead.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['leads'] });
      toast.success(t('lead.deleted', { number: lead.number }));
      void navigate('/leads', { replace: true });
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  });

  const primary = access.canAct ? (
    needsContact ? (
      <Button onClick={() => setDialog('contact')} data-testid="first-contact-button">
        <PhoneOutgoing aria-hidden />
        {t('lead.recordFirstContact')}
      </Button>
    ) : (
      <Button onClick={() => setDialog('status')} data-testid="change-status-button">
        <ArrowRightLeft aria-hidden />
        {t('status.change')}
      </Button>
    )
  ) : null;

  return (
    <header className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 shadow-sm md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="text-xl font-semibold md:text-2xl" data-testid="lead-title">
            {t('lead.title', { number: lead.number })} · {lead.fullName ?? t('lead.noName')}
          </h1>
          <div className="flex flex-wrap gap-1.5">
            <LeadStatusBadge status={lead.status} />
            {lead.possibleDuplicateOf ? <DuplicateBadge /> : null}
            {lead.isForgotten ? <ForgottenBadge /> : null}
          </div>
        </div>
        <SlaBadge lead={lead} size="lg" />
      </div>
      <div className="flex flex-wrap items-center gap-2 max-md:sticky max-md:bottom-16">
        {primary}
        {needsContact && access.canAct && lead.status === 'NEW' ? (
          <Button variant="outline" onClick={() => setDialog('status')}>
            {t('status.change')}
          </Button>
        ) : null}
        {access.canAssign ? (
          <AssignSelect className="w-56" leadId={lead.id} leadNumber={lead.number} assignee={lead.assignee} />
        ) : access.canTake ? (
          <TakeLeadButton leadId={lead.id} />
        ) : null}
        {access.canAct || access.canDelete ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={t('common.moreActions')}>
                <Ellipsis aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {access.canAct ? (
                <DropdownMenuItem onSelect={() => setDialog('edit')}>
                  <PencilLine aria-hidden />
                  {t('common.edit')}
                </DropdownMenuItem>
              ) : null}
              {access.canDelete ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem destructive onSelect={() => setDialog('delete')}>
                    <Trash2 aria-hidden />
                    {t('common.delete')}
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
      {dialog === 'contact' ? <FirstContactDialog lead={lead} open onOpenChange={close} /> : null}
      {dialog === 'status' ? <ChangeStatusDialog lead={lead} open onOpenChange={close} /> : null}
      <EditLeadDialog lead={lead} open={dialog === 'edit'} onOpenChange={close} />
      <ConfirmDialog
        open={dialog === 'delete'}
        onOpenChange={close}
        title={t('lead.deleteTitle', { number: lead.number })}
        description={t('lead.deleteText')}
        confirmLabel={t('common.delete')}
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </header>
  );
}
