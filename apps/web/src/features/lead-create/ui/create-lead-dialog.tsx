import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { LeadDto } from '@vippi/shared';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import {
  LeadFormFields,
  emptyLeadForm,
  formToCreateRequest,
  leadFormSchema,
  onLeadChanged,
  type LeadFormConfig,
  type LeadFormInput,
  type LeadFormValues,
} from '@/entities/lead';
import { useAssignees } from '@/entities/member';
import { useCan, useSession } from '@/entities/session';
import { apiRequest, isApiError } from '@/shared/api';
import { errorMessage, serverFieldErrors } from '@/shared/lib';
import { Button, Dialog, FormAlert, type ButtonProps } from '@/shared/ui';

const FORM_FIELDS = new Set<string>(Object.keys(emptyLeadForm));

function CreateLeadForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const can = useCan();
  const { organization } = useSession();
  const config: LeadFormConfig = {
    industryPreset: organization.industryPreset,
    leadFields: organization.leadFields.filter((f) => f.showInCreate || f.required),
  };
  const canAssign = can('lead.assign');
  const assignees = useAssignees({ enabled: canAssign });
  const qc = useQueryClient();
  const navigate = useNavigate();
  const form = useForm<LeadFormInput, unknown, LeadFormValues>({
    resolver: zodResolver(leadFormSchema),
    defaultValues: emptyLeadForm,
  });
  const create = useMutation({
    mutationFn: (values: LeadFormValues) =>
      apiRequest<LeadDto>('/leads', { method: 'POST', body: formToCreateRequest(values, config) }),
    onSuccess: (lead) => {
      onLeadChanged(qc, lead);
      const dup = lead.possibleDuplicateOf;
      if (dup) {
        toast.warning(t('lead.createdDuplicate', { number: dup.number }), {
          action: { label: t('common.open'), onClick: () => void navigate(`/leads/${dup.id}`) },
        });
      } else {
        toast.success(t('lead.created', { number: lead.number }));
      }
      onDone();
      void navigate(`/leads/${lead.id}`);
    },
    onError: (e) => {
      for (const d of serverFieldErrors(e)) {
        const [field = '', attrKey] = d.path.split('.');
        if (field === 'attributes' && attrKey) {
          form.setError(`attributes.${attrKey}`, { message: d.code });
          continue;
        }
        const name = field === 'budget' ? 'budgetAmount' : field;
        if (FORM_FIELDS.has(name)) form.setError(name as keyof LeadFormInput, { message: d.code });
      }
      if (isApiError(e) && e.code === 'ASSIGNEE_INVALID') form.setError('assigneeId', { message: 'assignee_invalid' });
    },
  });
  const generalError =
    create.error && !(isApiError(create.error) && ['VALIDATION_FAILED', 'ASSIGNEE_INVALID'].includes(create.error.code))
      ? errorMessage(create.error, t)
      : null;

  return (
    <form
      id="create-lead-form"
      noValidate
      onSubmit={form.handleSubmit((v) => create.mutate(v))}
      className="flex flex-col gap-4"
    >
      <FormAlert>{generalError}</FormAlert>
      <LeadFormFields
        form={form}
        assignees={canAssign ? assignees : undefined}
        industryPreset={config.industryPreset}
        leadFields={config.leadFields}
        industry={organization.industry}
      />
      <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 md:flex-row md:justify-end">
        <Button variant="outline" onClick={onDone} disabled={create.isPending}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" loading={create.isPending} loadingText={t('common.saving')}>
          {t('lead.create')}
        </Button>
      </div>
    </form>
  );
}

export function CreateLeadButton(props: Omit<ButtonProps, 'onClick'> & { label?: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { label, ...rest } = props;
  return (
    <>
      <Button {...rest} onClick={() => setOpen(true)}>
        <Plus aria-hidden />
        {label ?? t('lead.new')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen} title={t('lead.newTitle')} size="lg">
        {open ? <CreateLeadForm onDone={() => setOpen(false)} /> : null}
      </Dialog>
    </>
  );
}
