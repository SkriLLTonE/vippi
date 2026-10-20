import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CreateApiKeySchema, type ApiKeyDto, type CreateApiKeyRequest, type CreatedApiKeyDto } from '@vippi/shared';
import { KeyRound, Plus, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { apiRequest } from '@/shared/api';
import { env } from '@/shared/config';
import { errorMessage, formatDateTime, validationMessage } from '@/shared/lib';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Code,
  ConfirmDialog,
  CopyButton,
  DelayedSkeleton,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  FormAlert,
  Input,
  Skeleton,
  Table,
  Td,
  Th,
  Tr,
} from '@/shared/ui';
import { SettingsLayout } from '@/widgets/settings-nav';

const MAX_ACTIVE = 5;
const keys = ['api-keys'] as const;

function curlExample(key: string): string {
  const url = `${window.location.origin}${env.apiBaseUrl}/intake/leads`;
  const body = JSON.stringify({
    fullName: 'Aziz Karimov',
    phone: '+998 90 000 00 00',
    source: 'WEBSITE',
    message: 'Chilonzorda 2 xonali kvartira kerak',
    externalId: 'site-form-123',
  });
  return `curl -X POST '${url}' \\\n  -H 'X-Api-Key: ${key}' \\\n  -H 'Content-Type: application/json' \\\n  -d '${body}'`;
}

function CreateKeyDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const form = useForm<CreateApiKeyRequest>({ resolver: zodResolver(CreateApiKeySchema), defaultValues: { name: '' } });
  const create = useMutation({
    mutationFn: (body: CreateApiKeyRequest) => apiRequest<CreatedApiKeyDto>('/api-keys', { method: 'POST', body }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys }),
  });
  const close = () => {
    onOpenChange(false);
    create.reset();
    form.reset();
  };
  const nameError = form.formState.errors.name;
  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : close())} title={t('apiKeys.createTitle')} size="lg">
      {create.data ? (
        <div className="flex flex-col gap-4" data-testid="api-key-created">
          <Code>
            <span data-testid="api-key-value">{create.data.key}</span>
          </Code>
          <Alert tone="warning" icon={<TriangleAlert aria-hidden />}>
            {t('apiKeys.shownOnce')}
          </Alert>
          <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
            <Button variant="outline" onClick={close}>
              {t('common.done')}
            </Button>
            <CopyButton text={create.data.key} variant="default" />
          </div>
        </div>
      ) : (
        <form noValidate onSubmit={form.handleSubmit((v) => create.mutate(v))} className="flex flex-col gap-4">
          <FormAlert>{create.error ? errorMessage(create.error, t) : null}</FormAlert>
          <Field label={t('apiKeys.name')} hint={t('apiKeys.nameHint')} error={nameError ? validationMessage(nameError.message, nameError.type, t) : undefined}>
            {(c) => <Input {...c} autoFocus {...form.register('name')} />}
          </Field>
          <div className="flex flex-col-reverse gap-2 md:flex-row md:justify-end">
            <Button variant="outline" onClick={close}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={create.isPending} loadingText={t('common.saving')}>
              {t('apiKeys.create')}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

export function SettingsApiKeysPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [revoking, setRevoking] = useState<ApiKeyDto | null>(null);
  const list = useQuery({ queryKey: keys, queryFn: ({ signal }) => apiRequest<ApiKeyDto[]>('/api-keys', { signal }) });
  const revoke = useMutation({
    mutationFn: (id: string) => apiRequest<void>(`/api-keys/${id}/revoke`, { method: 'POST' }),
    onSuccess: () => {
      setRevoking(null);
      toast.success(t('apiKeys.revoked'));
      void qc.invalidateQueries({ queryKey: keys });
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  });
  const active = (list.data ?? []).filter((k) => !k.revokedAt);
  const limitReached = active.length >= MAX_ACTIVE;

  return (
    <SettingsLayout>
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{t('apiKeys.title')}</CardTitle>
            <CardDescription>{t('apiKeys.description')}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Code>{curlExample('vpk_…')}</Code>
            <CopyButton text={curlExample('vpk_…')} size="sm" className="self-start" />
          </CardContent>
        </Card>
        <div className="flex items-center justify-end gap-3">
          {limitReached ? <span className="text-sm text-muted-foreground">{t('apiKeys.limit', { max: MAX_ACTIVE })}</span> : null}
          <Button onClick={() => setCreateOpen(true)} disabled={limitReached || list.isPending}>
            <Plus aria-hidden />
            {t('apiKeys.create')}
          </Button>
        </div>
        {list.isPending ? (
          <DelayedSkeleton>
            <Skeleton className="h-32" />
          </DelayedSkeleton>
        ) : list.isError ? (
          <ErrorState message={errorMessage(list.error, t)} onRetry={() => void list.refetch()} />
        ) : list.data.length === 0 ? (
          <EmptyState icon={KeyRound} title={t('apiKeys.empty')} />
        ) : (
          <Table caption={t('apiKeys.title')}>
            <thead>
              <tr>
                <Th>{t('apiKeys.name')}</Th>
                <Th>{t('apiKeys.prefix')}</Th>
                <Th className="hidden md:table-cell">{t('apiKeys.created')}</Th>
                <Th className="hidden lg:table-cell">{t('apiKeys.lastUsed')}</Th>
                <Th>
                  <span className="sr-only">{t('common.actions')}</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((k) => (
                <Tr key={k.id}>
                  <Td className="font-medium">{k.name}</Td>
                  <Td className="font-mono text-xs">{k.prefix}…</Td>
                  <Td className="hidden md:table-cell">
                    <span className="tabular">{formatDateTime(k.createdAt)}</span>
                    {k.createdBy ? <span className="text-muted-foreground"> · {k.createdBy.fullName}</span> : null}
                  </Td>
                  <Td className="hidden tabular lg:table-cell">{k.lastUsedAt ? formatDateTime(k.lastUsedAt) : '—'}</Td>
                  <Td className="text-right">
                    {k.revokedAt ? (
                      <Badge className="bg-status-lost-bg text-status-lost">{t('apiKeys.revokedBadge')}</Badge>
                    ) : (
                      <Button variant="ghost" size="sm" className="text-danger" onClick={() => setRevoking(k)}>
                        {t('apiKeys.revoke')}
                      </Button>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
      <CreateKeyDialog open={createOpen} onOpenChange={setCreateOpen} />
      <ConfirmDialog
        open={!!revoking}
        onOpenChange={(v) => (v ? undefined : setRevoking(null))}
        title={t('apiKeys.revokeTitle', { name: revoking?.name ?? '' })}
        description={t('apiKeys.revokeText')}
        confirmLabel={t('apiKeys.revoke')}
        loading={revoke.isPending}
        onConfirm={() => revoking && revoke.mutate(revoking.id)}
      />
    </SettingsLayout>
  );
}
