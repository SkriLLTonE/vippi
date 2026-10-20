import type { Prisma } from '@prisma/client';
import { hasPermission, normalizeSearchQuery, zonedPeriodToUtc, type LeadFilters, type LeadSort } from '@vippi/shared';
import type { Actor } from '../../../common/actor.js';

/** FR-018: managers see their own and unassigned leads only. */
export function visibilityFilter(actor: Actor): Prisma.LeadWhereInput {
  if (hasPermission(actor.role, 'lead.readAll')) return {};
  return { OR: [{ assigneeId: actor.userId }, { assigneeId: null }] };
}

/** Shared by list, export and drill-down (FR-017, FR-064). */
export function buildLeadWhere(
  actor: Actor,
  f: Partial<LeadFilters>,
  now: Date,
  forgottenAfterHours: number,
): Prisma.LeadWhereInput {
  const and: Prisma.LeadWhereInput[] = [{ organizationId: actor.orgId }, { deletedAt: null }, visibilityFilter(actor)];
  if (f.status?.length) and.push({ status: { in: f.status } });
  if (f.source?.length) and.push({ source: { in: f.source } });
  if (f.slaState?.length) and.push({ slaState: { in: f.slaState } });
  if (f.assigneeId === 'none') and.push({ assigneeId: null });
  else if (f.assigneeId === 'me') and.push({ assigneeId: actor.userId });
  else if (f.assigneeId) and.push({ assigneeId: f.assigneeId });
  if (f.forgotten) {
    and.push({
      firstResponseAt: null,
      status: 'NEW',
      receivedAt: { lt: new Date(now.getTime() - forgottenAfterHours * 3_600_000) },
    });
  }
  if (f.from || f.to) {
    const { start, end } = zonedPeriodToUtc(f.from ?? '2000-01-01', f.to ?? '2100-01-01');
    and.push({ receivedAt: { gte: start, lt: end } });
  }
  if (f.q) {
    const q = normalizeSearchQuery(f.q);
    if (q.length > 0) and.push({ searchText: { contains: q } });
  }
  return { AND: and, organizationId: actor.orgId };
}

export function leadOrderBy(sort: LeadSort | undefined): Prisma.LeadOrderByWithRelationInput[] {
  switch (sort) {
    case 'receivedAt':
      return [{ receivedAt: 'asc' }, { number: 'asc' }];
    case 'firstResponseDueAt':
      return [{ firstResponseDueAt: 'asc' }, { number: 'asc' }];
    case '-firstResponseDueAt':
      return [{ firstResponseDueAt: 'desc' }, { number: 'desc' }];
    default:
      return [{ receivedAt: 'desc' }, { number: 'desc' }];
  }
}
