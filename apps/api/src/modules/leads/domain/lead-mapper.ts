import type { Lead, LeadActivity, Prisma } from '@prisma/client';
import { visibleAttributes, type District, type LeadActivityDto, type LeadDto, type LeadFieldDef, type LeadListItem } from '@vippi/shared';

export const leadInclude = {
  assignee: { select: { id: true, fullName: true } },
  firstResponseBy: { select: { id: true, fullName: true } },
  possibleDuplicateOf: { select: { id: true, number: true } },
} satisfies Prisma.LeadInclude;

export type LeadWithRelations = Prisma.LeadGetPayload<{ include: typeof leadInclude }>;

export const listSelect = {
  id: true,
  number: true,
  fullName: true,
  phone: true,
  source: true,
  message: true,
  status: true,
  slaState: true,
  firstResponseDueAt: true,
  firstResponseAt: true,
  receivedAt: true,
  possibleDuplicateOfId: true,
  assignee: { select: { id: true, fullName: true } },
} satisfies Prisma.LeadSelect;

export type LeadListRow = Prisma.LeadGetPayload<{ select: typeof listSelect }>;

export function isForgotten(
  lead: Pick<Lead, 'firstResponseAt' | 'status' | 'receivedAt'>,
  forgottenAfterHours: number,
  now: Date,
): boolean {
  return (
    lead.firstResponseAt === null &&
    lead.status === 'NEW' &&
    now.getTime() - lead.receivedAt.getTime() > forgottenAfterHours * 3_600_000
  );
}

export function toListItem(row: LeadListRow, forgottenAfterHours: number, now: Date): LeadListItem {
  const preview = row.message ? (row.message.length > 140 ? `${row.message.slice(0, 139)}…` : row.message) : null;
  return {
    id: row.id,
    number: row.number,
    fullName: row.fullName,
    phone: row.phone,
    source: row.source,
    messagePreview: preview,
    status: row.status,
    slaState: row.slaState,
    firstResponseDueAt: row.firstResponseDueAt.toISOString(),
    firstResponseAt: row.firstResponseAt?.toISOString() ?? null,
    isForgotten: isForgotten(row, forgottenAfterHours, now),
    assignee: row.assignee,
    possibleDuplicate: row.possibleDuplicateOfId !== null,
    receivedAt: row.receivedAt.toISOString(),
  };
}

export function toLeadDto(
  lead: LeadWithRelations,
  forgottenAfterHours: number,
  now: Date,
  fieldDefs: readonly LeadFieldDef[] = [],
): LeadDto {
  return {
    id: lead.id,
    number: lead.number,
    fullName: lead.fullName,
    phone: lead.phone,
    source: lead.source,
    sourceDetail: lead.sourceDetail,
    message: lead.message,
    budget:
      lead.budgetAmount !== null && lead.budgetCurrency !== null
        ? { amount: lead.budgetAmount.toString(), currency: lead.budgetCurrency }
        : null,
    district: (lead.district as District | null) ?? null,
    propertyType: lead.propertyType,
    rooms: lead.rooms,
    attributes: visibleAttributes(fieldDefs, lead.attributes),
    status: lead.status,
    lostReason: lead.lostReason,
    lostComment: lead.lostComment,
    assignee: lead.assignee,
    createdVia: lead.createdVia,
    externalId: lead.externalId,
    receivedAt: lead.receivedAt.toISOString(),
    firstResponseDueAt: lead.firstResponseDueAt.toISOString(),
    firstResponseAt: lead.firstResponseAt?.toISOString() ?? null,
    firstResponseBy: lead.firstResponseBy,
    firstResponseChannel: lead.firstResponseChannel,
    slaState: lead.slaState,
    slaBreachedAt: lead.slaBreachedAt?.toISOString() ?? null,
    possibleDuplicateOf: lead.possibleDuplicateOf,
    isForgotten: isForgotten(lead, forgottenAfterHours, now),
    closedAt: lead.closedAt?.toISOString() ?? null,
    createdAt: lead.createdAt.toISOString(),
    updatedAt: lead.updatedAt.toISOString(),
  };
}

export function toActivityDto(
  a: LeadActivity & { actor: { id: string; fullName: string } | null },
): LeadActivityDto {
  return {
    id: a.id,
    type: a.type,
    actor: a.actor,
    body: a.body,
    payload: (a.payload as Record<string, unknown> | null) ?? null,
    createdAt: a.createdAt.toISOString(),
  };
}
