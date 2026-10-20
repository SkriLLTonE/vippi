import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { LeadActivityDto } from '@vippi/shared';
import { useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ActivityItem, leadKeys, useLeadActivities } from '@/entities/lead';
import { useMemberNames } from '@/entities/member';
import { apiRequest } from '@/shared/api';
import { errorMessage } from '@/shared/lib';
import { Button, Card, CardContent, CardHeader, CardTitle, DelayedSkeleton, ErrorState, Field, Skeleton, Textarea } from '@/shared/ui';

const MAX = 2000;

function CommentForm({ leadId }: { leadId: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [body, setBody] = useState('');
  const add = useMutation({
    mutationFn: (text: string) =>
      apiRequest<LeadActivityDto>(`/leads/${leadId}/comments`, { method: 'POST', body: { body: text } }),
    onSuccess: (activity) => {
      qc.setQueryData<LeadActivityDto[]>(leadKeys.activities(leadId), (prev) => [activity, ...(prev ?? [])]);
      setBody('');
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  });
  const submit = () => {
    const text = body.trim();
    if (text && text.length <= MAX && !add.isPending) add.mutate(text);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      submit();
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <Field
        label={t('timeline.comment')}
        hint={t('timeline.ctrlEnter')}
        aside={<span className="text-xs text-subtle-foreground tabular">{body.length}/{MAX}</span>}
      >
        {(c) => (
          <Textarea {...c} rows={2} maxLength={MAX} value={body} onChange={(e) => setBody(e.target.value)} onKeyDown={onKeyDown} />
        )}
      </Field>
      <Button className="self-end" size="sm" disabled={!body.trim()} loading={add.isPending} onClick={submit}>
        {t('timeline.send')}
      </Button>
    </div>
  );
}

export function LeadTimeline({ leadId }: { leadId: string }) {
  const { t } = useTranslation();
  const activities = useLeadActivities(leadId);
  const resolveName = useMemberNames();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('timeline.title')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <CommentForm leadId={leadId} />
        {activities.isPending ? (
          <DelayedSkeleton>
            <div className="flex flex-col gap-3">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          </DelayedSkeleton>
        ) : activities.isError ? (
          <ErrorState message={errorMessage(activities.error, t)} onRetry={() => void activities.refetch()} />
        ) : (
          <ol className="divide-y divide-border" data-testid="timeline">
            {activities.data.map((a) => (
              <ActivityItem key={a.id} activity={a} resolveName={resolveName} />
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
