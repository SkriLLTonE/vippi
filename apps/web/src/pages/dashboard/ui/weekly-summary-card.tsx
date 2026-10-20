import { useMutation } from '@tanstack/react-query';
import type { AiResultEnvelope, WeeklySummary } from '@vippi/shared';
import { FileText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AiSourceBadge } from '@/entities/ai-insight';
import { apiRequest } from '@/shared/api';
import { errorMessage, formatDateTime } from '@/shared/lib';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, ErrorState, Skeleton } from '@/shared/ui';

/** FR-074 / AI-004: numbers in bullets are validated against aggregates on the server. */
export function WeeklySummaryCard() {
  const { t } = useTranslation();
  const summary = useMutation({
    mutationFn: () => apiRequest<AiResultEnvelope<WeeklySummary>>('/analytics/weekly-summary', { method: 'POST', body: {} }),
  });
  const env = summary.data;
  return (
    <Card data-testid="weekly-summary">
      <CardHeader className="flex-row items-start justify-between gap-2">
        <div>
          <CardTitle>{t('dashboard.weeklyTitle')}</CardTitle>
          <CardDescription>{t('dashboard.weeklyText')}</CardDescription>
        </div>
        <Button
          variant={env ? 'outline' : 'default'}
          size="sm"
          onClick={() => summary.mutate()}
          loading={summary.isPending}
          loadingText={t('ai.generatingShort')}
        >
          <FileText aria-hidden />
          {t('dashboard.weeklyGenerate')}
        </Button>
      </CardHeader>
      <CardContent>
        {summary.isPending ? (
          <div className="flex flex-col gap-2" role="status" aria-live="polite">
            <p className="text-sm text-muted-foreground">{t('ai.generating')}</p>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : summary.isError ? (
          <ErrorState message={errorMessage(summary.error, t)} onRetry={() => summary.mutate()} />
        ) : env ? (
          <div className="flex flex-col gap-3">
            <AiSourceBadge info={env} />
            <ul className="list-disc pl-5 text-sm">
              {env.result.bullets.map((b) => (
                <li key={b} className="py-0.5">
                  {b}
                </li>
              ))}
            </ul>
            <p className="text-xs text-subtle-foreground">{t('ai.generatedAt', { time: formatDateTime(env.createdAt) })}</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
