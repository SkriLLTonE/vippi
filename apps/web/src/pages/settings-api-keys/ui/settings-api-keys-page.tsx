import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CreateApiKeySchema,
  INDUSTRY_TEMPLATES,
  exampleLeadAttributes,
  type ApiKeyDto,
  type CreateApiKeyRequest,
  type CreatedApiKeyDto,
  type Locale,
  type OrgLeadConfig,
} from '@vippi/shared';
import { Copy, Info, KeyRound, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useUiLocale } from '@/entities/industry';
import { useSession } from '@/entities/session';
import { apiRequest } from '@/shared/api';
import { env } from '@/shared/config';
import { copyTextFrom, errorMessage, formatDateTime, validationMessage } from '@/shared/lib';
import {
  Alert,
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
  IconButton,
  Input,
  Skeleton,
  Table,
  Td,
  Th,
  Tr,
} from '@/shared/ui';
import { SettingsLayout } from '@/widgets/settings-nav';
import { apiKeysQueryKey as keys, maskApiKey, revealApiKey } from '../model/api-keys';
import { ApiKeyDialog } from './api-key-dialog';

const MAX_ACTIVE = 5;

/** ADR-025: intake body built from the organization's industry sample and its active custom fields. */
function intakeExampleBody(org: Pick<OrgLeadConfig, 'industry' | 'leadFields'>, locale: Locale): Record<string, unknown> {
  const sample = INDUSTRY_TEMPLATES[org.industry].sample;
  const attributes = exampleLeadAttributes(org.leadFields, org.industry, locale);
  return {
    fullName: 'Aziz Karimov',
    phone: '+998 90 000 00 00',
    source: 'WEBSITE',
    message: sample.message[locale],
    ...sample.realEstate,
    ...(Object.keys(attributes).length > 0 ? { attributes } : {}),
    externalId: 'site-form-123',
  };
}

function curlExample(key: string, body: Record<string, unknown>): string {
  const url = `${window.location.origin}${env.apiBaseUrl}/intake/leads`;
  const json = JSON.stringify(body).replaceAll("'", "'\\''");
  return `curl -X POST '${url}' \\\n  -H 'X-Api-Key: ${key}' \\\n  -H 'Content-Type: application/json' \\\n  -d '${json}'`;
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
          <Alert tone="info" icon={<Info aria-hidden />}>
            {t('apiKeys.copyLater')}
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
  const { organization } = useSession();
  const locale = useUiLocale();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [opened, setOpened] = useState<ApiKeyDto | null>(null);
  const [deleting, setDeleting] = useState<ApiKeyDto | null>(null);
  const list = useQuery({ queryKey: keys, queryFn: ({ signal }) => apiRequest<ApiKeyDto[]>('/api-keys', { signal }) });
  const remove = useMutation({
    mutationFn: (id: string) => apiRequest<void>(`/api-keys/${id}/revoke`, { method: 'POST' }),
    onSuccess: () => {
      setDeleting(null);
      toast.success(t('apiKeys.deleted'));
      void qc.invalidateQueries({ queryKey: keys });
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  });
  const copy = async (k: ApiKeyDto) => {
    try {
      const ok = await copyTextFrom(() => revealApiKey(k.id));
      if (ok) toast.success(t('apiKeys.copied'));
      else toast.error(t('common.copyFailed'));
    } catch (e) {
      toast.error(errorMessage(e, t));
    }
  };
  const limitReached = (list.data?.length ?? 0) >= MAX_ACTIVE;
  const example = curlExample('vpk_…', intakeExampleBody(organization, locale));

  return (
    <SettingsLayout>
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{t('apiKeys.title')}</CardTitle>
            <CardDescription>{t('apiKeys.description')}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Code>
              <span data-testid="intake-example">{example}</span>
            </Code>
            <p className="text-xs text-muted-foreground">{t('apiKeys.exampleHint')}</p>
            <CopyButton text={example} size="sm" className="self-start" />
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
                  <Td className="font-medium">
                    <button
                      type="button"
                      className="rounded-sm text-left text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                      onClick={() => setOpened(k)}
                    >
                      {k.name}
                    </button>
                  </Td>
                  <Td className="font-mono text-xs" data-testid="api-key-mask">
                    {maskApiKey(k)}
                  </Td>
                  <Td className="hidden md:table-cell">
                    <span className="tabular">{formatDateTime(k.createdAt)}</span>
                    {k.createdBy ? <span className="text-muted-foreground"> · {k.createdBy.fullName}</span> : null}
                  </Td>
                  <Td className="hidden tabular lg:table-cell">{k.lastUsedAt ? formatDateTime(k.lastUsedAt) : '—'}</Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-1">
                      <IconButton
                        icon={Copy}
                        label={t('apiKeys.copyNamed', { name: k.name })}
                        tooltip={k.revealable ? t('apiKeys.copy') : t('apiKeys.legacyCopy')}
                        disabled={!k.revealable}
                        onClick={() => void copy(k)}
                      />
                      <IconButton
                        icon={Trash2}
                        label={t('apiKeys.deleteNamed', { name: k.name })}
                        tooltip={t('apiKeys.delete')}
                        className="text-danger"
                        onClick={() => setDeleting(k)}
                      />
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
      <CreateKeyDialog open={createOpen} onOpenChange={setCreateOpen} />
      {opened ? <ApiKeyDialog key={opened.id} apiKey={opened} onClose={() => setOpened(null)} /> : null}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => (v ? undefined : setDeleting(null))}
        title={t('apiKeys.deleteTitle', { name: deleting?.name ?? '' })}
        description={t('apiKeys.deleteText')}
        confirmLabel={t('apiKeys.delete')}
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </SettingsLayout>
  );
}
