import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AUDIT_ACTIONS, type AuditLogDto, type Paginated } from '@vippi/shared';
import { ChevronDown, ChevronRight, ScrollText } from 'lucide-react';
import { Fragment, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMembers } from '@/entities/member';
import { apiRequest } from '@/shared/api';
import { errorMessage, formatDateTime } from '@/shared/lib';
import { Code, DelayedSkeleton, EmptyState, ErrorState, Input, NativeSelect, Pagination, Skeleton, Table, Td, Th, Tr } from '@/shared/ui';
import { SettingsLayout } from '@/widgets/settings-nav';

const PAGE_SIZE = 50;

interface Filters {
  action: string;
  actorUserId: string;
  from: string;
  to: string;
}

function actorLabel(row: AuditLogDto, t: (k: string) => string): string {
  if (row.actor) return row.actor.fullName;
  if (row.apiKey) return `${t('audit.apiKey')}: ${row.apiKey.name}`;
  return t(`audit.actorType.${row.actorType}`);
}

export function AuditLogPage() {
  const { t } = useTranslation();
  const members = useMembers();
  const [filters, setFilters] = useState<Filters>({ action: '', actorUserId: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const setFilter = (patch: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  };
  const query = {
    page,
    pageSize: PAGE_SIZE,
    action: filters.action || undefined,
    actorUserId: filters.actorUserId || undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
  };
  const logs = useQuery({
    queryKey: ['audit-logs', query],
    queryFn: ({ signal }) => apiRequest<Paginated<AuditLogDto>>('/audit-logs', { query, signal }),
    placeholderData: keepPreviousData,
  });

  return (
    <SettingsLayout>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{t('audit.action')}</span>
          <NativeSelect className="w-60" value={filters.action} onChange={(e) => setFilter({ action: e.target.value })}>
            <option value="">{t('common.all')}</option>
            {AUDIT_ACTIONS.map((a) => (
              <option key={a} value={a}>
                {t(`audit.actions.${a}`)}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{t('audit.actor')}</span>
          <NativeSelect className="w-52" value={filters.actorUserId} onChange={(e) => setFilter({ actorUserId: e.target.value })}>
            <option value="">{t('common.all')}</option>
            {(members.data ?? []).map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.fullName}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{t('filters.from')}</span>
          <Input type="date" className="w-40" value={filters.from} onChange={(e) => setFilter({ from: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{t('filters.to')}</span>
          <Input type="date" className="w-40" value={filters.to} onChange={(e) => setFilter({ to: e.target.value })} />
        </label>
      </div>
      {logs.isPending ? (
        <DelayedSkeleton>
          <Skeleton className="h-64" />
        </DelayedSkeleton>
      ) : logs.isError ? (
        <ErrorState message={errorMessage(logs.error, t)} onRetry={() => void logs.refetch()} />
      ) : logs.data.items.length === 0 ? (
        <EmptyState icon={ScrollText} title={t('audit.empty')} />
      ) : (
        <>
          <Table caption={t('audit.title')}>
            <thead>
              <tr>
                <Th className="w-8">
                  <span className="sr-only">{t('audit.details')}</span>
                </Th>
                <Th>{t('audit.time')}</Th>
                <Th>{t('audit.action')}</Th>
                <Th>{t('audit.actor')}</Th>
                <Th className="hidden md:table-cell">{t('audit.entity')}</Th>
                <Th className="hidden lg:table-cell">IP</Th>
              </tr>
            </thead>
            <tbody>
              {logs.data.items.map((row) => {
                const open = expanded === row.id;
                return (
                  <Fragment key={row.id}>
                    <Tr>
                      <Td>
                        <button
                          type="button"
                          className="inline-flex size-7 items-center justify-center rounded-sm hover:bg-muted"
                          aria-expanded={open}
                          aria-label={t('audit.details')}
                          onClick={() => setExpanded(open ? null : row.id)}
                        >
                          {open ? <ChevronDown className="size-4" aria-hidden /> : <ChevronRight className="size-4" aria-hidden />}
                        </button>
                      </Td>
                      <Td className="whitespace-nowrap tabular">{formatDateTime(row.createdAt)}</Td>
                      <Td>{t(`audit.actions.${row.action}`, { defaultValue: row.action })}</Td>
                      <Td>{actorLabel(row, t)}</Td>
                      <Td className="hidden font-mono text-xs md:table-cell">
                        {row.entityType ? `${row.entityType}${row.entityId ? ` · ${row.entityId.slice(0, 8)}` : ''}` : '—'}
                      </Td>
                      <Td className="hidden font-mono text-xs lg:table-cell">{row.ip ?? '—'}</Td>
                    </Tr>
                    {open ? (
                      <tr>
                        <td colSpan={6} className="border-b border-border bg-background-subtle px-3 py-2">
                          <Code>{row.metadata ? JSON.stringify(row.metadata, null, 2) : t('audit.noMetadata')}</Code>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </Table>
          <Pagination page={page} pageSize={PAGE_SIZE} total={logs.data.total} onPageChange={setPage} />
        </>
      )}
    </SettingsLayout>
  );
}
