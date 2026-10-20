import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  allowedLostReasons,
  allowedTargets,
  type ChangeStatusRequest,
  type LeadDto,
  type LeadStatus,
  type LostReason,
} from '@vippi/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { leadKeys, onLeadChanged } from '@/entities/lead';
import { useSession } from '@/entities/session';
import { apiRequest } from '@/shared/api';
import { errorMessage } from '@/shared/lib';
import { Button, Dialog, Field, NativeSelect, Segmented, Textarea } from '@/shared/ui';

type Target = ChangeStatusRequest['status'];

/** Only allowed transitions are offered (FR-013, canTransition in shared). */
export function ChangeStatusDialog({ lead, open, onOpenChange }: { lead: LeadDto; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { t } = useTranslation();
  const me = useSession();
  const qc = useQueryClient();
  const targets = allowedTargets(lead.status, me.role) as Target[];
  const [status, setStatus] = useState<Target | undefined>(targets[0]);
  const [lostReason, setLostReason] = useState<LostReason | ''>('');
  const [lostComment, setLostComment] = useState('');
  const [touched, setTouched] = useState(false);

  const change = useMutation({
    mutationFn: (body: ChangeStatusRequest) =>
      apiRequest<LeadDto>(`/leads/${lead.id}/status`, { method: 'POST', body }),
    onMutate: async (body) => {
      await qc.cancelQueries({ queryKey: leadKeys.detail(lead.id) });
      const previous = qc.getQueryData<LeadDto>(leadKeys.detail(lead.id));
      if (previous) qc.setQueryData<LeadDto>(leadKeys.detail(lead.id), { ...previous, status: body.status as LeadStatus });
      onOpenChange(false);
      return { previous };
    },
    onSuccess: (updated) => {
      onLeadChanged(qc, updated);
      toast.success(t('status.saved', { status: t(`lead.status.${updated.status}`) }));
    },
    onError: (e, _body, ctx) => {
      if (ctx?.previous) qc.setQueryData(leadKeys.detail(lead.id), ctx.previous);
      toast.error(errorMessage(e, t));
      onLeadChanged(qc, undefined, lead.id);
      void qc.invalidateQueries({ queryKey: leadKeys.detail(lead.id) });
    },
  });

  const reasonMissing = status === 'LOST' && !lostReason;
  const commentMissing = status === 'LOST' && lostReason === 'OTHER' && lostComment.trim().length < 3;

  const submit = () => {
    setTouched(true);
    if (!status || reasonMissing || commentMissing) return;
    change.mutate({
      status,
      ...(status === 'LOST' && lostReason ? { lostReason } : {}),
      ...(status === 'LOST' && lostComment.trim() ? { lostComment: lostComment.trim() } : {}),
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('status.title')}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} disabled={!status}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {targets.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('status.noTransitions')}</p>
        ) : (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">{t('status.newStatus')}</legend>
            <Segmented<Target>
              wrap
              label={t('status.newStatus')}
              value={status}
              onChange={(v) => {
                setStatus(v);
                setLostReason('');
              }}
              options={targets.map((s) => ({ value: s, label: t(`lead.status.${s}`) }))}
            />
          </fieldset>
        )}
        {status === 'LOST' ? (
          <>
            <Field label={t('status.lostReason')} error={touched && reasonMissing ? t('validation.lost_reason_required') : undefined}>
              {(c) => (
                <NativeSelect {...c} value={lostReason} onChange={(e) => setLostReason(e.target.value as LostReason | '')}>
                  <option value="">{t('common.choose')}</option>
                  {allowedLostReasons(lead.status).map((r) => (
                    <option key={r} value={r}>
                      {t(`lead.lostReason.${r}`)}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
            <Field
              label={lostReason === 'OTHER' ? t('status.lostCommentRequired') : t('status.lostComment')}
              error={touched && commentMissing ? t('validation.lost_comment_required') : undefined}
            >
              {(c) => <Textarea {...c} maxLength={500} value={lostComment} onChange={(e) => setLostComment(e.target.value)} />}
            </Field>
          </>
        ) : null}
      </div>
    </Dialog>
  );
}
