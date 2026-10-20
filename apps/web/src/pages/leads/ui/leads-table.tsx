import type { LeadListItem, LeadSort } from '@vippi/shared';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import {
  DuplicateBadge,
  ForgottenBadge,
  LeadStatusBadge,
  SlaBadge,
  SourceLabel,
} from '@/entities/lead';
import { formatDateTime, formatPhone } from '@/shared/lib';
import { SortableTh, Table, Td, Th, Tr } from '@/shared/ui';

function sortDirection(sort: LeadSort, field: 'receivedAt' | 'firstResponseDueAt'): 'asc' | 'desc' | null {
  if (sort === field) return 'asc';
  if (sort === `-${field}`) return 'desc';
  return null;
}

function nextSort(sort: LeadSort, field: 'receivedAt' | 'firstResponseDueAt'): LeadSort {
  return sort === `-${field}` ? field : (`-${field}` as LeadSort);
}

export function LeadsTable({
  items,
  sort,
  onSort,
}: {
  items: LeadListItem[];
  sort: LeadSort;
  onSort: (sort: LeadSort) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <>
      <div className="hidden md:block">
        <Table caption={t('nav.leads')}>
          <thead>
            <tr>
              <Th className="w-16">№</Th>
              <Th>{t('lead.field.client')}</Th>
              <Th>{t('lead.field.source')}</Th>
              <Th className="hidden xl:table-cell">{t('lead.field.message')}</Th>
              <Th>{t('lead.field.status')}</Th>
              <SortableTh
                label={t('lead.field.sla')}
                direction={sortDirection(sort, 'firstResponseDueAt')}
                onToggle={() => onSort(nextSort(sort, 'firstResponseDueAt'))}
              />
              <Th className="hidden lg:table-cell">{t('lead.field.assignee')}</Th>
              <SortableTh
                label={t('lead.field.receivedAt')}
                direction={sortDirection(sort, 'receivedAt')}
                onToggle={() => onSort(nextSort(sort, 'receivedAt'))}
              />
            </tr>
          </thead>
          <tbody>
            {items.map((lead) => (
              <Tr
                key={lead.id}
                data-testid="lead-row"
                className="cursor-pointer hover:bg-background-subtle"
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest('a')) return;
                  void navigate(`/leads/${lead.id}`);
                }}
              >
                <Td className="tabular text-muted-foreground">
                  <Link to={`/leads/${lead.id}`} className="font-medium text-primary hover:underline">
                    #{lead.number}
                  </Link>
                </Td>
                <Td>
                  <div className="flex flex-col">
                    <span className="font-medium">{lead.fullName ?? t('lead.noName')}</span>
                    <span className="text-xs text-muted-foreground tabular">{formatPhone(lead.phone)}</span>
                  </div>
                  {lead.possibleDuplicate || lead.isForgotten ? (
                    <div className="mt-1 flex gap-1">
                      {lead.possibleDuplicate ? <DuplicateBadge /> : null}
                      {lead.isForgotten ? <ForgottenBadge /> : null}
                    </div>
                  ) : null}
                </Td>
                <Td>
                  <SourceLabel source={lead.source} />
                </Td>
                <Td className="hidden max-w-xs xl:table-cell">
                  <span className="line-clamp-1 text-muted-foreground">{lead.messagePreview ?? '—'}</span>
                </Td>
                <Td>
                  <LeadStatusBadge status={lead.status} />
                </Td>
                <Td>
                  <SlaBadge lead={lead} />
                </Td>
                <Td className="hidden lg:table-cell">
                  {lead.assignee?.fullName ?? <span className="text-subtle-foreground">{t('lead.unassigned')}</span>}
                </Td>
                <Td className="whitespace-nowrap text-muted-foreground tabular">{formatDateTime(lead.receivedAt)}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </div>
      <ul className="flex flex-col gap-2 md:hidden">
        {items.map((lead) => (
          <li key={lead.id}>
            <Link
              to={`/leads/${lead.id}`}
              data-testid="lead-card"
              className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium">
                  <span className="text-muted-foreground tabular">#{lead.number}</span> {lead.fullName ?? t('lead.noName')}
                </span>
                <span className="text-xs text-muted-foreground tabular">{formatDateTime(lead.receivedAt)}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <LeadStatusBadge status={lead.status} />
                <SlaBadge lead={lead} />
                {lead.possibleDuplicate ? <DuplicateBadge /> : null}
                {lead.isForgotten ? <ForgottenBadge /> : null}
              </div>
              <SourceLabel source={lead.source} />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
