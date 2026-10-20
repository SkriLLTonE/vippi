import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CSV_MAX_BYTES,
  CSV_MAX_ROWS,
  type CsvImportResult,
  type CsvPreviewResult,
  type CsvRowError,
} from '@vippi/shared';
import { CircleCheck, Download, FileUp, Upload } from 'lucide-react';
import { useEffect, useRef, useState, type DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useFeature } from '@/entities/session';
import { apiDownload, apiRequest } from '@/shared/api';
import { cn, errorMessage, formatNumber } from '@/shared/lib';
import { Alert, Button, Dialog, FormAlert, Table, Td, Th, Tr, type ButtonProps } from '@/shared/ui';

type Step = 'select' | 'preview' | 'result';

function upload<T>(path: string, file: File): Promise<T> {
  const fd = new FormData();
  fd.append('file', file);
  return apiRequest<T>(path, { method: 'POST', formData: fd });
}

function ErrorList({ errors }: { errors: CsvRowError[] }) {
  const { t } = useTranslation();
  if (errors.length === 0) return null;
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">{t('import.errorsTitle', { count: errors.length })}</h3>
      <ul className="max-h-48 overflow-y-auto rounded-md border border-border bg-background-subtle p-2 text-sm" data-testid="import-errors">
        {errors.map((e, i) => (
          <li key={`${e.row}-${e.column}-${i}`} className="py-0.5">
            {t('import.rowError', {
              row: e.row,
              column: e.column,
              message: t(`validation.${e.code}`, { defaultValue: t('validation.invalid') }),
            })}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ImportFlow({ onClose, onBusyChange }: { onClose: () => void; onBusyChange: (busy: boolean) => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const previewEnabled = useFeature('CSV_IMPORT_PREVIEW');
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('select');
  const [dragOver, setDragOver] = useState(false);

  const template = useMutation({
    mutationFn: () => apiDownload('/leads/import/template', undefined, 'vippi-leads-template.csv'),
    onError: (e) => toast.error(errorMessage(e, t)),
  });
  const preview = useMutation({
    mutationFn: (f: File) => upload<CsvPreviewResult>('/leads/import/preview', f),
    onSuccess: () => setStep('preview'),
  });
  const importer = useMutation({
    mutationFn: (f: File) => upload<CsvImportResult>('/leads/import', f),
    onSuccess: (r) => {
      setStep('result');
      void qc.invalidateQueries({ queryKey: ['leads'] });
      if (r.imported > 0) toast.success(t('import.doneToast', { count: r.imported }));
    },
  });

  const choose = (f: File | undefined) => {
    preview.reset();
    importer.reset();
    if (!f) return;
    if (!f.name.toLowerCase().endsWith('.csv')) {
      setFile(null);
      setFileError(t('errors.UNSUPPORTED_FILE'));
      return;
    }
    if (f.size > CSV_MAX_BYTES) {
      setFile(null);
      setFileError(t('errors.PAYLOAD_TOO_LARGE'));
      return;
    }
    setFileError(null);
    setFile(f);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    choose(e.dataTransfer.files[0]);
  };

  const submitFirstStep = () => {
    if (!file) return;
    if (previewEnabled) preview.mutate(file);
    else importer.mutate(file);
  };

  const busy = importer.isPending;
  useEffect(() => onBusyChange(busy), [busy, onBusyChange]);

  if (step === 'result' && importer.data) {
    const r = importer.data;
    return (
      <div className="flex flex-col gap-4" data-testid="import-result">
        <Alert tone={r.imported > 0 ? 'success' : 'warning'} icon={<CircleCheck aria-hidden />}>
          {t('import.result', { imported: r.imported, skipped: r.skipped })}
        </Alert>
        <ErrorList errors={r.errors} />
        <div className="flex justify-end">
          <Button onClick={onClose}>{t('common.done')}</Button>
        </div>
      </div>
    );
  }

  if (step === 'preview' && preview.data && file) {
    const p = preview.data;
    return (
      <div className="flex flex-col gap-4" data-testid="import-preview">
        <dl className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {[
            ['import.total', p.totalRows],
            ['import.valid', p.validRows],
            ['import.invalid', p.invalidRows],
            ['import.duplicates', p.duplicateRows],
          ].map(([key, value]) => (
            <div key={key as string} className="rounded-md border border-border p-3">
              <dt className="text-xs text-muted-foreground">{t(key as string)}</dt>
              <dd className="text-xl font-semibold tabular">{formatNumber(value as number)}</dd>
            </div>
          ))}
        </dl>
        {p.sample.length > 0 ? (
          <Table caption={t('import.sample')}>
            <thead>
              <tr>
                <Th>{t('import.row')}</Th>
                <Th>{t('lead.field.fullName')}</Th>
                <Th>{t('lead.field.phone')}</Th>
                <Th>{t('lead.field.source')}</Th>
                <Th>{t('lead.field.receivedAt')}</Th>
              </tr>
            </thead>
            <tbody>
              {p.sample.map((r) => (
                <Tr key={r.row}>
                  <Td className="tabular">{r.row}</Td>
                  <Td>{r.fullName ?? '—'}</Td>
                  <Td className="tabular">{r.phone ?? '—'}</Td>
                  <Td>{t(`lead.source.${r.source}`)}</Td>
                  <Td className="tabular">{r.receivedAt ?? '—'}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        ) : null}
        <ErrorList errors={p.errors} />
        <FormAlert>{importer.error ? errorMessage(importer.error, t) : null}</FormAlert>
        <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
          <Button variant="outline" disabled={busy} onClick={() => setStep('select')}>
            {t('common.back')}
          </Button>
          <Button
            disabled={p.validRows === 0}
            loading={busy}
            loadingText={t('import.running')}
            onClick={() => importer.mutate(file)}
          >
            {t('import.submit', { count: p.validRows })}
          </Button>
        </div>
      </div>
    );
  }

  const stepError = fileError ?? (preview.error ? errorMessage(preview.error, t) : importer.error ? errorMessage(importer.error, t) : null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {t('import.limits', { mb: CSV_MAX_BYTES / 1024 / 1024, rows: formatNumber(CSV_MAX_ROWS) })}
        </p>
        <Button variant="link" size="sm" loading={template.isPending} onClick={() => template.mutate()}>
          <Download aria-hidden />
          {t('import.template')}
        </Button>
      </div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={cn(
          'flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border-strong p-8 text-center',
          dragOver && 'border-primary bg-primary-subtle',
        )}
      >
        <FileUp className="size-8 text-subtle-foreground" aria-hidden />
        <p className="text-sm">{file ? file.name : t('import.dropHint')}</p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          data-testid="import-file"
          aria-label={t('import.chooseFile')}
          onChange={(e) => choose(e.target.files?.[0])}
        />
        <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
          <Upload aria-hidden />
          {t('import.chooseFile')}
        </Button>
      </div>
      <FormAlert>{stepError}</FormAlert>
      <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
        <Button variant="outline" disabled={busy} onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button
          disabled={!file}
          loading={preview.isPending || busy}
          loadingText={previewEnabled ? t('import.checking') : t('import.running')}
          onClick={submitFirstStep}
        >
          {previewEnabled ? t('import.next') : t('import.importNow')}
        </Button>
      </div>
    </div>
  );
}

export function ImportCsvButton(props: Omit<ButtonProps, 'onClick'>) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [locked, setLocked] = useState(false);
  return (
    <>
      <Button variant="outline" {...props} onClick={() => setOpen(true)}>
        <Upload aria-hidden />
        {t('import.button')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen} title={t('import.title')} size="lg" locked={locked}>
        {open ? <ImportFlow onClose={() => setOpen(false)} onBusyChange={setLocked} /> : null}
      </Dialog>
    </>
  );
}
