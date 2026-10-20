import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { LeadDto } from '@vippi/shared';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  LeadFormFields,
  formToUpdateRequest,
  leadFormSchema,
  leadToForm,
  onLeadChanged,
  type LeadFormInput,
  type LeadFormValues,
} from '@/entities/lead';
import { apiRequest, isApiError } from '@/shared/api';
import { errorMessage, serverFieldErrors } from '@/shared/lib';
import { Button, Dialog, FormAlert } from '@/shared/ui';

function EditForm({ lead, onDone }: { lead: LeadDto; onDone: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const sourceEditable = lead.createdVia === 'MANUAL';
  const form = useForm<LeadFormInput, unknown, LeadFormValues>({
    resolver: zodResolver(leadFormSchema),
    defaultValues: leadToForm(lead),
  });
  const save = useMutation({
    mutationFn: (v: LeadFormValues) =>
      apiRequest<LeadDto>(`/leads/${lead.id}`, { method: 'PATCH', body: formToUpdateRequest(v, sourceEditable) }),
    onSuccess: (updated) => {
      onLeadChanged(qc, updated);
      toast.success(t('common.saved'));
      onDone();
    },
    onError: (e) => {
      for (const d of serverFieldErrors(e)) {
        const field = d.path.split('.')[0] ?? '';
        const name = field === 'budget' ? 'budgetAmount' : field;
        if (name in leadToForm(lead)) form.setError(name as keyof LeadFormInput, { message: d.code });
      }
    },
  });
  return (
    <form noValidate onSubmit={form.handleSubmit((v) => save.mutate(v))} className="flex flex-col gap-4">
      <FormAlert>
        {save.error && !(isApiError(save.error) && save.error.code === 'VALIDATION_FAILED') ? errorMessage(save.error, t) : null}
      </FormAlert>
      <LeadFormFields form={form} sourceLocked={!sourceEditable} />
      <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 md:flex-row md:justify-end">
        <Button variant="outline" onClick={onDone} disabled={save.isPending}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" loading={save.isPending} loadingText={t('common.saving')}>
          {t('common.save')}
        </Button>
      </div>
    </form>
  );
}

export function EditLeadDialog({ lead, open, onOpenChange }: { lead: LeadDto; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t('lead.editTitle', { number: lead.number })} size="lg">
      {open ? <EditForm lead={lead} onDone={() => onOpenChange(false)} /> : null}
    </Dialog>
  );
}
