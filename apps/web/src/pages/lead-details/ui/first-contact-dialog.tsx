import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ContactChannel, LeadDto } from '@vippi/shared';
import { Info } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { onLeadChanged } from '@/entities/lead';
import { apiRequest, isApiError } from '@/shared/api';
import { errorMessage } from '@/shared/lib';
import { Alert, Button, Dialog, Field, FormAlert, Segmented, Textarea } from '@/shared/ui';
import { channelOptions } from '../lib/channels';

/** FR-014: the time is fixed at the moment of saving (ADR-017). */
export function FirstContactDialog({ lead, open, onOpenChange }: { lead: LeadDto; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [channel, setChannel] = useState<ContactChannel | undefined>(undefined);
  const [comment, setComment] = useState('');
  const [touched, setTouched] = useState(false);
  const save = useMutation({
    mutationFn: () =>
      apiRequest<LeadDto>(`/leads/${lead.id}/first-contact`, {
        method: 'POST',
        body: { channel, ...(comment.trim() ? { comment: comment.trim() } : {}) },
      }),
    onSuccess: (updated) => {
      onLeadChanged(qc, updated);
      toast.success(t('firstContact.saved'));
      onOpenChange(false);
    },
    onError: (e) => {
      if (isApiError(e) && e.status === 422) {
        toast.error(errorMessage(e, t));
        onLeadChanged(qc, undefined, lead.id);
        void qc.invalidateQueries({ queryKey: ['leads', 'detail', lead.id] });
        onOpenChange(false);
      }
    },
  });
  const channelError = touched && !channel ? t('validation.channel_required') : undefined;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('lead.recordFirstContact')}
      footer={
        <>
          <Button variant="outline" disabled={save.isPending} onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            loading={save.isPending}
            loadingText={t('common.saving')}
            onClick={() => {
              setTouched(true);
              if (channel) save.mutate();
            }}
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Alert tone="info" icon={<Info aria-hidden />}>
          {t('firstContact.hint')}
        </Alert>
        <FormAlert>{save.error && !(isApiError(save.error) && save.error.status === 422) ? errorMessage(save.error, t) : null}</FormAlert>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">{t('firstContact.channel')}</legend>
          <Segmented<ContactChannel>
            wrap
            label={t('firstContact.channel')}
            value={channel}
            onChange={setChannel}
            options={channelOptions(t)}
          />
          {channelError ? (
            <p className="text-xs text-danger" role="alert">
              {channelError}
            </p>
          ) : null}
        </fieldset>
        <Field
          label={t('firstContact.comment')}
          aside={<span className="text-xs text-subtle-foreground tabular">{comment.length}/2000</span>}
        >
          {(c) => <Textarea {...c} maxLength={2000} value={comment} onChange={(e) => setComment(e.target.value)} />}
        </Field>
      </div>
    </Dialog>
  );
}
