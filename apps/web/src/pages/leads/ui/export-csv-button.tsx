import { useMutation } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { apiDownload, isApiError, type QueryParams } from '@/shared/api';
import { errorMessage } from '@/shared/lib';
import { Button } from '@/shared/ui';

/** Exports the current filtered selection (FR-064, ADR-019). */
export function ExportCsvButton({ filters }: { filters: QueryParams }) {
  const { t } = useTranslation();
  const exportCsv = useMutation({
    mutationFn: () => apiDownload('/leads/export.csv', filters, 'leads.csv'),
    onSuccess: (name) => toast.success(t('export.done', { name })),
    onError: (e) =>
      toast.error(isApiError(e) && e.code === 'EXPORT_TOO_LARGE' ? t('export.tooLarge') : errorMessage(e, t)),
  });
  return (
    <Button
      variant="outline"
      data-testid="export-csv"
      loading={exportCsv.isPending}
      loadingText={t('export.running')}
      onClick={() => exportCsv.mutate()}
    >
      <Download aria-hidden />
      {t('export.button')}
    </Button>
  );
}
