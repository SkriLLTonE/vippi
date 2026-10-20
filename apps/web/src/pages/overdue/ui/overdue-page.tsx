import { useQuery } from '@tanstack/react-query';
import type { SlaPolicyDto } from '@vippi/shared';
import { CircleCheck } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { SourceLabel, useOverdueLeads } from '@/entities/lead';
import { useCan } from '@/entities/session';
import { AssignSelect, TakeLeadButton } from '@/features/lead-assign';
import { apiRequest } from '@/shared/api';
import { errorMessage, formatDateTime, formatDuration, formatPhone } from '@/shared/lib';
import { Button, DelayedSkeleton, EmptyState, ErrorState, PageHeader, Pagination, Skeleton, Table, Td, Th, Tr } from '@/shared/ui';

export function OverduePage() {
  const { t } = useTranslation();
  const can = useCan();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const overdue = useOverdueLeads({ page, pageSize });
  const policy = useQuery({
    queryKey: ['sla-policy'],
    queryFn: ({ signal }) => apiRequest<SlaPolicyDto>('/sla-policy', { signal }),
    enabled: can('sla.manage'),
  });
  const minutes = policy.data?.firstResponseMinutes;

  let body: ReactNode;
  if (overdue.isPending) {
    body = (
      <DelayedSkeleton>
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-11" />
          ))}
        </div>
      </DelayedSkeleton>
    );
  } else if (overdue.isError && !overdue.data) {
    body = <ErrorState message={errorMessage(overdue.error, t)} onRetry={() => void overdue.refetch()} />;
  } else if (overdue.data.total === 0) {
    body = <EmptyState icon={CircleCheck} tone="success" title={t('overdue.allGood')} />;
  } else {
    body = (
      <>
        <Table caption={t('nav.overdue')}>
          <thead>
            <tr>
              <Th className="w-16">№</Th>
              <Th>{t('lead.field.client')}</Th>
              <Th className="hidden md:table-cell">{t('lead.field.source')}</Th>
              <Th>{t('lead.field.assignee')}</Th>
              <Th aria-sort="descending">{t('overdue.overdueBy')}</Th>
              <Th className="hidden lg:table-cell">{t('lead.field.receivedAt')}</Th>
              <Th>
                <span className="sr-only">{t('common.actions')}</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {overdue.data.items.map((lead) => (
              <Tr key={lead.id} data-testid="overdue-row">
                <Td className="tabular">
                  <Link to={`/leads/${lead.id}`} className="font-medium text-primary hover:underline">
                    #{lead.number}
                  </Link>
                </Td>
                <Td>
                  <span className="block font-medium">{lead.fullName ?? t('lead.noName')}</span>
                  <span className="text-xs text-muted-foreground tabular">{formatPhone(lead.phone)}</span>
                </Td>
                <Td className="hidden md:table-cell">
                  <SourceLabel source={lead.source} />
                </Td>
                <Td>
                  {can('lead.assign') ? (
                    <AssignSelect className="w-48" leadId={lead.id} leadNumber={lead.number} assignee={lead.assignee} />
                  ) : (
                    (lead.assignee?.fullName ?? <span className="text-subtle-foreground">{t('lead.unassigned')}</span>)
                  )}
                </Td>
                <Td className="font-semibold text-danger tabular">{formatDuration(lead.overdueMinutes * 60, t)}</Td>
                <Td className="hidden whitespace-nowrap text-muted-foreground tabular lg:table-cell">
                  {formatDateTime(lead.receivedAt)}
                </Td>
                <Td>
                  <div className="flex justify-end gap-2">
                    {can('lead.take') && !lead.assignee ? <TakeLeadButton leadId={lead.id} size="sm" /> : null}
                    <Button asChild variant="ghost" size="sm">
                      <Link to={`/leads/${lead.id}`}>{t('common.open')}</Link>
                    </Button>
                  </div>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
        <Pagination
          page={overdue.data.page}
          pageSize={overdue.data.pageSize}
          total={overdue.data.total}
          onPageChange={setPage}
          onPageSizeChange={(s) => {
            setPageSize(s);
            setPage(1);
          }}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={t('nav.overdue')}
        count={overdue.data?.total}
        description={minutes ? t('overdue.description', { minutes }) : t('overdue.descriptionGeneric')}
      />
      {body}
    </>
  );
}
