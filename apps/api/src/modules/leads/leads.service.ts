import { Injectable } from '@nestjs/common';
import { Prisma, type ActivityType, type Lead } from '@prisma/client';
import {
  buildLeadSearchText,
  canTransition,
  hasPermission,
  OPEN_LEAD_STATUSES,
  type AiApplicableField,
  type ChangeStatusRequest,
  type CommentRequest,
  type ContactChannel,
  type CreateLeadRequest,
  type FirstContactRequest,
  type IntakeLeadRequest,
  type LeadActivityDto,
  type LeadCreatedVia,
  type LeadDto,
  type LeadListItem,
  type LeadListQuery,
  type OverdueLeadItem,
  type OverdueQuery,
  type Paginated,
  type UpdateLeadRequest,
} from '@vippi/shared';
import type { Actor, ApiKeyActor } from '../../common/actor.js';
import { AppException, forbidden, notFound } from '../../common/app-exception.js';
import { Clock } from '../../common/clock.js';
import { PrismaService, type Tx } from '../../common/prisma/prisma.service.js';
import { ProductEvents } from '../../common/product-events.js';
import type { ReqMeta } from '../../common/req-meta.js';
import { AuditService } from '../audit/audit.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { computeDueAt } from '../sla/domain/compute-due-at.js';
import { SlaPolicyService } from '../sla/sla-policy.service.js';
import {
  leadInclude,
  listSelect,
  toActivityDto,
  toLeadDto,
  toListItem,
  type LeadWithRelations,
} from './domain/lead-mapper.js';
import { buildLeadWhere, leadOrderBy, visibilityFilter } from './domain/lead-where.js';

const DUPLICATE_WINDOW_MS = 30 * 86_400_000;

export interface LeadFieldsInput {
  fullName?: string | null;
  phone?: string | null;
  source: CreateLeadRequest['source'];
  sourceDetail?: string | null;
  message?: string | null;
  budget?: { amount: string; currency: 'UZS' | 'USD' } | null;
  district?: string | null;
  propertyType?: CreateLeadRequest['propertyType'] | null;
  rooms?: number | null;
}

export interface BreachedLead {
  id: string;
  organizationId: string;
  number: number;
  assigneeId: string | null;
  firstResponseDueAt: Date;
}

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly sla: SlaPolicyService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly events: ProductEvents,
  ) {}

  // ---------------------------------------------------------------- helpers

  async assertAssignable(orgId: string, userId: string, tx?: Tx): Promise<void> {
    const client = tx ?? this.prisma.db;
    const m = await client.membership.findFirst({ where: { organizationId: orgId, userId, status: 'ACTIVE' } });
    if (!m) throw new AppException(422, 'ASSIGNEE_INVALID', 'Assignee must be an active member of the organization');
  }

  async findPossibleDuplicate(orgId: string, phone: string | null | undefined, now: Date, tx?: Tx) {
    if (!phone) return null;
    const client = tx ?? this.prisma.db;
    return client.lead.findFirst({
      where: {
        organizationId: orgId,
        phone,
        deletedAt: null,
        status: { in: [...OPEN_LEAD_STATUSES] },
        receivedAt: { gte: new Date(now.getTime() - DUPLICATE_WINDOW_MS) },
      },
      orderBy: { receivedAt: 'asc' },
      select: { id: true, number: true },
    });
  }

  /** Reserves `count` consecutive lead numbers inside the transaction. */
  async reserveNumbers(tx: Tx, orgId: string, count: number): Promise<number> {
    const org = await tx.organization.update({
      where: { id: orgId },
      data: { nextLeadNumber: { increment: count } },
      select: { nextLeadNumber: true },
    });
    return org.nextLeadNumber - count;
  }

  fieldsToData(f: LeadFieldsInput): Omit<Prisma.LeadUncheckedCreateInput, 'organizationId' | 'number' | 'createdVia' | 'receivedAt' | 'firstResponseDueAt'> {
    return {
      fullName: f.fullName ?? null,
      phone: f.phone ?? null,
      source: f.source,
      sourceDetail: f.sourceDetail ?? null,
      message: f.message ?? null,
      budgetAmount: f.budget ? BigInt(f.budget.amount) : null,
      budgetCurrency: f.budget?.currency ?? null,
      district: f.district ?? null,
      propertyType: f.propertyType ?? null,
      rooms: f.rooms ?? null,
      searchText: buildLeadSearchText(f),
    };
  }

  private async addActivity(
    tx: Tx,
    orgId: string,
    leadId: string,
    type: ActivityType,
    actorUserId: string | null,
    payload?: Record<string, unknown>,
    body?: string,
  ) {
    return tx.leadActivity.create({
      data: {
        organizationId: orgId,
        leadId,
        type,
        actorUserId,
        body: body ?? null,
        payload: (payload ?? undefined) as Prisma.InputJsonValue | undefined,
        createdAt: this.clock.now(),
      },
    });
  }

  private async notifyAssigned(tx: Tx, orgId: string, lead: { id: string; number: number }, activityId: string, assigneeId: string, byName: string) {
    await this.notifications.createMany(
      [
        {
          organizationId: orgId,
          userId: assigneeId,
          type: 'LEAD_ASSIGNED',
          leadId: lead.id,
          payload: { leadNumber: lead.number, assignedByName: byName },
          dedupeKey: `LEAD_ASSIGNED:${activityId}:${assigneeId}`,
        },
      ],
      tx,
    );
  }

  private async loadVisible(actor: Actor, id: string, tx?: Tx): Promise<LeadWithRelations> {
    const client = tx ?? this.prisma.db;
    const lead = await client.lead.findFirst({
      where: { AND: [{ id, organizationId: actor.orgId, deletedAt: null }, visibilityFilter(actor)], organizationId: actor.orgId },
      include: leadInclude,
    });
    if (!lead) throw notFound();
    return lead;
  }

  /** "Own" leads rule for managers (PRD §14). */
  private assertCanAct(actor: Actor, lead: Pick<Lead, 'assigneeId'>): void {
    if (hasPermission(actor.role, 'lead.editAny')) return;
    if (lead.assigneeId !== actor.userId) throw forbidden();
  }

  private async toDto(lead: LeadWithRelations): Promise<LeadDto> {
    const policy = await this.sla.getForOrg(lead.organizationId);
    return toLeadDto(lead, policy.forgottenAfterHours, this.clock.now());
  }

  async getDto(actor: Actor, id: string): Promise<LeadDto> {
    return this.toDto(await this.loadVisible(actor, id));
  }

  /** For the AI module: visible lead with permission checks applied by the caller. */
  async getVisibleLead(actor: Actor, id: string): Promise<LeadWithRelations> {
    return this.loadVisible(actor, id);
  }

  canActOn(actor: Actor, lead: Pick<Lead, 'assigneeId'>): boolean {
    return hasPermission(actor.role, 'lead.editAny') || lead.assigneeId === actor.userId;
  }

  // ---------------------------------------------------------------- create

  /** FR-010, FR-011, FR-032 */
  async create(actor: Actor, input: CreateLeadRequest): Promise<LeadDto> {
    const now = this.clock.now();
    const assigneeId = actor.role === 'MANAGER' ? actor.userId : (input.assigneeId ?? null);
    if (assigneeId && assigneeId !== actor.userId) await this.assertAssignable(actor.orgId, assigneeId);
    const policy = await this.sla.getForOrg(actor.orgId);
    const duplicate = await this.findPossibleDuplicate(actor.orgId, input.phone, now);

    const lead = await this.prisma.db.$transaction(async (tx) => {
      const number = await this.reserveNumbers(tx, actor.orgId, 1);
      const created = await tx.lead.create({
        data: {
          ...this.fieldsToData(input),
          organizationId: actor.orgId,
          number,
          assigneeId,
          createdById: actor.userId,
          createdVia: 'MANUAL',
          receivedAt: now,
          firstResponseDueAt: computeDueAt(now, policy),
          possibleDuplicateOfId: duplicate?.id ?? null,
        },
      });
      await this.addActivity(tx, actor.orgId, created.id, 'CREATED', actor.userId, { via: 'MANUAL' });
      if (assigneeId) {
        const act = await this.addActivity(tx, actor.orgId, created.id, 'ASSIGNED', actor.userId, {
          from: null,
          to: assigneeId,
        });
        if (assigneeId !== actor.userId) {
          await this.notifyAssigned(tx, actor.orgId, created, act.id, assigneeId, actor.fullName);
        }
      }
      return tx.lead.findFirstOrThrow({ where: { id: created.id, organizationId: actor.orgId }, include: leadInclude });
    });
    this.emitCreated(actor.orgId, actor.userId, 'MANUAL', lead.source, duplicate !== null);
    return this.toDto(lead);
  }

  private emitCreated(orgId: string, userId: string | undefined, via: LeadCreatedVia, source: string, dup: boolean) {
    this.events.emit('lead_created', { organizationId: orgId, userId }, { via, source, possibleDuplicate: dup });
  }

  /** FR-063: idempotent by externalId. */
  async createFromIntake(
    key: ApiKeyActor,
    input: IntakeLeadRequest,
  ): Promise<{ id: string; number: number; duplicate: boolean }> {
    if (input.externalId) {
      const existing = await this.prisma.db.lead.findFirst({
        where: { organizationId: key.orgId, externalId: input.externalId },
        select: { id: true, number: true },
      });
      if (existing) {
        this.events.emit('intake_lead_received', { organizationId: key.orgId }, { duplicate: true });
        return { ...existing, duplicate: true };
      }
    }
    const now = this.clock.now();
    const policy = await this.sla.getForOrg(key.orgId);
    const duplicate = await this.findPossibleDuplicate(key.orgId, input.phone, now);
    try {
      const lead = await this.prisma.db.$transaction(async (tx) => {
        const number = await this.reserveNumbers(tx, key.orgId, 1);
        const created = await tx.lead.create({
          data: {
            ...this.fieldsToData(input),
            organizationId: key.orgId,
            number,
            createdVia: 'API',
            externalId: input.externalId ?? null,
            receivedAt: now,
            firstResponseDueAt: computeDueAt(now, policy),
            possibleDuplicateOfId: duplicate?.id ?? null,
          },
          select: { id: true, number: true, source: true },
        });
        await this.addActivity(tx, key.orgId, created.id, 'CREATED', null, { via: 'API' });
        return created;
      });
      this.emitCreated(key.orgId, undefined, 'API', lead.source, duplicate !== null);
      this.events.emit('intake_lead_received', { organizationId: key.orgId }, { duplicate: false });
      return { id: lead.id, number: lead.number, duplicate: false };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' && input.externalId) {
        const existing = await this.prisma.db.lead.findFirstOrThrow({
          where: { organizationId: key.orgId, externalId: input.externalId },
          select: { id: true, number: true },
        });
        return { ...existing, duplicate: true };
      }
      throw e;
    }
  }

  // ---------------------------------------------------------------- read

  /** FR-017, FR-018 */
  async list(actor: Actor, q: LeadListQuery): Promise<Paginated<LeadListItem>> {
    const now = this.clock.now();
    const policy = await this.sla.getForOrg(actor.orgId);
    const where = buildLeadWhere(actor, q, now, policy.forgottenAfterHours);
    const [total, rows] = await Promise.all([
      this.prisma.db.lead.count({ where }),
      this.prisma.db.lead.findMany({
        where,
        orderBy: leadOrderBy(q.sort),
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        select: listSelect,
      }),
    ]);
    return {
      page: q.page,
      pageSize: q.pageSize,
      total,
      items: rows.map((r) => toListItem(r, policy.forgottenAfterHours, now)),
    };
  }

  /** FR-034 */
  async overdue(actor: Actor, q: OverdueQuery): Promise<Paginated<OverdueLeadItem>> {
    const now = this.clock.now();
    const policy = await this.sla.getForOrg(actor.orgId);
    const and: Prisma.LeadWhereInput[] = [
      { organizationId: actor.orgId, deletedAt: null, slaState: 'BREACHED', firstResponseAt: null },
      { status: { notIn: ['WON', 'LOST'] } },
      visibilityFilter(actor),
    ];
    if (q.assigneeId === 'none') and.push({ assigneeId: null });
    else if (q.assigneeId === 'me') and.push({ assigneeId: actor.userId });
    else if (q.assigneeId) and.push({ assigneeId: q.assigneeId });
    const where: Prisma.LeadWhereInput = { AND: and, organizationId: actor.orgId };
    const [total, rows] = await Promise.all([
      this.prisma.db.lead.count({ where }),
      this.prisma.db.lead.findMany({
        where,
        orderBy: [{ firstResponseDueAt: 'asc' }, { number: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        select: listSelect,
      }),
    ]);
    if (q.page === 1) this.events.emit('overdue_list_viewed', { organizationId: actor.orgId, userId: actor.userId }, { count: total });
    return {
      page: q.page,
      pageSize: q.pageSize,
      total,
      items: rows.map((r) => ({
        ...toListItem(r, policy.forgottenAfterHours, now),
        overdueMinutes: Math.max(0, Math.floor((now.getTime() - r.firstResponseDueAt.getTime()) / 60_000)),
      })),
    };
  }

  async activities(actor: Actor, id: string): Promise<LeadActivityDto[]> {
    await this.loadVisible(actor, id);
    const rows = await this.prisma.db.leadActivity.findMany({
      where: { organizationId: actor.orgId, leadId: id },
      include: { actor: { select: { id: true, fullName: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 500,
    });
    return rows.map(toActivityDto);
  }

  // ---------------------------------------------------------------- update

  /** FR-019 */
  async update(actor: Actor, id: string, input: UpdateLeadRequest): Promise<LeadDto> {
    const lead = await this.loadVisible(actor, id);
    this.assertCanAct(actor, lead);
    if (input.source !== undefined && input.source !== lead.source && lead.createdVia !== 'MANUAL') {
      throw new AppException(400, 'VALIDATION_FAILED', 'Source of imported leads cannot be changed', [
        { path: 'source', code: 'source_locked', message: 'Source of imported leads cannot be changed' },
      ]);
    }
    const data: Prisma.LeadUncheckedUpdateInput = {};
    const changed: string[] = [];
    const set = <K extends keyof Prisma.LeadUncheckedUpdateInput>(field: string, key: K, value: Prisma.LeadUncheckedUpdateInput[K], current: unknown) => {
      if (value !== undefined && value !== current) {
        data[key] = value;
        changed.push(field);
      }
    };
    set('fullName', 'fullName', input.fullName, lead.fullName);
    set('phone', 'phone', input.phone, lead.phone);
    set('source', 'source', input.source, lead.source);
    set('sourceDetail', 'sourceDetail', input.sourceDetail, lead.sourceDetail);
    set('message', 'message', input.message, lead.message);
    set('district', 'district', input.district, lead.district);
    set('propertyType', 'propertyType', input.propertyType, lead.propertyType);
    set('rooms', 'rooms', input.rooms, lead.rooms);
    if (input.budget !== undefined) {
      const amount = input.budget ? BigInt(input.budget.amount) : null;
      const currency = input.budget?.currency ?? null;
      if (amount !== lead.budgetAmount || currency !== lead.budgetCurrency) {
        data.budgetAmount = amount;
        data.budgetCurrency = currency;
        changed.push('budget');
      }
    }
    const nextName = input.fullName !== undefined ? input.fullName : lead.fullName;
    const nextPhone = input.phone !== undefined ? input.phone : lead.phone;
    if (!nextName?.trim() && !nextPhone) {
      throw new AppException(400, 'VALIDATION_FAILED', 'Name or phone required', [
        { path: 'fullName', code: 'name_or_phone_required', message: 'Name or phone required' },
      ]);
    }
    if (changed.length === 0) return this.toDto(lead);
    data.searchText = buildLeadSearchText({
      fullName: nextName,
      phone: nextPhone,
      message: input.message !== undefined ? input.message : lead.message,
    });
    const updated = await this.prisma.db.$transaction(async (tx) => {
      await tx.lead.update({ where: { id, organizationId: actor.orgId }, data });
      await this.addActivity(tx, actor.orgId, id, 'FIELDS_UPDATED', actor.userId, { fields: changed, source: 'USER' });
      return tx.lead.findFirstOrThrow({ where: { id, organizationId: actor.orgId }, include: leadInclude });
    });
    return this.toDto(updated);
  }

  /** FR-072: applies AI/rule-extracted fields (values taken from the stored insight, not the client). */
  async applyExtractedFields(
    actor: Actor,
    id: string,
    values: Partial<Record<AiApplicableField, unknown>>,
    source: 'AI' | 'RULES',
  ): Promise<LeadDto> {
    const lead = await this.loadVisible(actor, id);
    this.assertCanAct(actor, lead);
    const data: Prisma.LeadUncheckedUpdateInput = {};
    const fields: AiApplicableField[] = [];
    if ('budget' in values) {
      const b = values.budget as { amount: number; currency: 'UZS' | 'USD' } | null;
      if (b) {
        data.budgetAmount = BigInt(Math.round(b.amount));
        data.budgetCurrency = b.currency;
        fields.push('budget');
      }
    }
    if ('district' in values && typeof values.district === 'string') {
      data.district = values.district;
      fields.push('district');
    }
    if ('propertyType' in values && typeof values.propertyType === 'string') {
      data.propertyType = values.propertyType as Prisma.LeadUncheckedUpdateInput['propertyType'];
      fields.push('propertyType');
    }
    if ('rooms' in values && typeof values.rooms === 'number') {
      data.rooms = values.rooms;
      fields.push('rooms');
    }
    if (fields.length === 0) {
      throw new AppException(400, 'VALIDATION_FAILED', 'Nothing to apply', [
        { path: 'fields', code: 'nothing_to_apply', message: 'Selected fields have no extracted values' },
      ]);
    }
    const updated = await this.prisma.db.$transaction(async (tx) => {
      await tx.lead.update({ where: { id, organizationId: actor.orgId }, data });
      await this.addActivity(tx, actor.orgId, id, 'FIELDS_UPDATED', actor.userId, { fields, source });
      return tx.lead.findFirstOrThrow({ where: { id, organizationId: actor.orgId }, include: leadInclude });
    });
    this.events.emit('ai_fields_applied', { organizationId: actor.orgId, userId: actor.userId }, { fields });
    return this.toDto(updated);
  }

  /** FR-020 */
  async softDelete(actor: Actor, id: string, meta: ReqMeta): Promise<void> {
    const lead = await this.loadVisible(actor, id);
    await this.prisma.db.$transaction(async (tx) => {
      await tx.lead.update({ where: { id, organizationId: actor.orgId }, data: { deletedAt: this.clock.now() } });
      await this.audit.append(
        {
          organizationId: actor.orgId,
          action: 'LEAD_DELETED',
          actorUserId: actor.userId,
          entityType: 'Lead',
          entityId: id,
          metadata: { number: lead.number },
          meta,
        },
        tx,
      );
    });
  }

  // ---------------------------------------------------------------- assignment

  /** FR-012, AC-036 */
  async assign(actor: Actor, id: string, assigneeId: string | null, meta: ReqMeta): Promise<LeadDto> {
    const lead = await this.loadVisible(actor, id);
    if (assigneeId) await this.assertAssignable(actor.orgId, assigneeId);
    if (lead.assigneeId === assigneeId) return this.toDto(lead);
    const updated = await this.prisma.db.$transaction(async (tx) => {
      await tx.lead.update({ where: { id, organizationId: actor.orgId }, data: { assigneeId } });
      if (assigneeId) {
        const act = await this.addActivity(tx, actor.orgId, id, 'ASSIGNED', actor.userId, {
          from: lead.assigneeId,
          to: assigneeId,
        });
        if (assigneeId !== actor.userId) await this.notifyAssigned(tx, actor.orgId, lead, act.id, assigneeId, actor.fullName);
      } else {
        await this.addActivity(tx, actor.orgId, id, 'UNASSIGNED', actor.userId, { from: lead.assigneeId });
      }
      if (lead.assigneeId) {
        await this.audit.append(
          {
            organizationId: actor.orgId,
            action: 'LEAD_REASSIGNED',
            actorUserId: actor.userId,
            entityType: 'Lead',
            entityId: id,
            metadata: { from: lead.assigneeId, to: assigneeId },
            meta,
          },
          tx,
        );
      }
      return tx.lead.findFirstOrThrow({ where: { id, organizationId: actor.orgId }, include: leadInclude });
    });
    this.events.emit('lead_assigned', { organizationId: actor.orgId, userId: actor.userId }, { selfAssigned: assigneeId === actor.userId });
    return this.toDto(updated);
  }

  /** FR-012: manager takes an unassigned lead. */
  async take(actor: Actor, id: string): Promise<LeadDto> {
    const lead = await this.loadVisible(actor, id);
    if (lead.assigneeId === actor.userId) return this.toDto(lead);
    if (lead.assigneeId !== null) throw notFound();
    const updated = await this.prisma.db.$transaction(async (tx) => {
      const r = await tx.lead.updateMany({
        where: { id, organizationId: actor.orgId, assigneeId: null, deletedAt: null },
        data: { assigneeId: actor.userId },
      });
      if (r.count !== 1) throw notFound();
      await this.addActivity(tx, actor.orgId, id, 'ASSIGNED', actor.userId, { from: null, to: actor.userId, self: true });
      return tx.lead.findFirstOrThrow({ where: { id, organizationId: actor.orgId }, include: leadInclude });
    });
    this.events.emit('lead_assigned', { organizationId: actor.orgId, userId: actor.userId }, { selfAssigned: true });
    return this.toDto(updated);
  }

  /** FR-008: deactivated member's open leads become unassigned (SLA deadlines unchanged). */
  async unassignAllForUser(tx: Tx, orgId: string, userId: string, actorUserId: string): Promise<number> {
    const leads = await tx.lead.findMany({
      where: { organizationId: orgId, assigneeId: userId, deletedAt: null, status: { in: [...OPEN_LEAD_STATUSES] } },
      select: { id: true },
    });
    if (leads.length === 0) return 0;
    await tx.lead.updateMany({
      where: { organizationId: orgId, id: { in: leads.map((l) => l.id) } },
      data: { assigneeId: null },
    });
    await tx.leadActivity.createMany({
      data: leads.map((l) => ({
        organizationId: orgId,
        leadId: l.id,
        type: 'UNASSIGNED' as const,
        actorUserId,
        payload: { from: userId, reason: 'MEMBER_DEACTIVATED' },
        createdAt: this.clock.now(),
      })),
    });
    return leads.length;
  }

  // ---------------------------------------------------------------- status & contact

  /** FR-014, FR-035, AC-025. Runs inside the given transaction when provided (AI draft-sent). */
  async recordFirstContact(
    actor: Actor,
    id: string,
    input: FirstContactRequest,
    opts: { viaAiDraft?: boolean; tx?: Tx } = {},
  ): Promise<void> {
    const run = async (tx: Tx) => {
      const lead = await this.loadVisible(actor, id, tx);
      this.assertCanAct(actor, lead);
      const now = this.clock.now();
      const updated = await tx.$executeRaw`
        UPDATE "Lead" SET
          "firstResponseAt" = ${now},
          "firstResponseById" = ${actor.userId}::uuid,
          "firstResponseChannel" = ${input.channel}::"ContactChannel",
          "status" = 'CONTACTED',
          "slaState" = CASE WHEN "slaState" = 'BREACHED' OR ${now} > "firstResponseDueAt"
                            THEN 'BREACHED'::"SlaState" ELSE 'MET'::"SlaState" END,
          "slaBreachedAt" = COALESCE("slaBreachedAt",
                            CASE WHEN ${now} > "firstResponseDueAt" THEN "firstResponseDueAt" END),
          "updatedAt" = ${now}
        WHERE "id" = ${id}::uuid AND "organizationId" = ${actor.orgId}::uuid
          AND "firstResponseAt" IS NULL AND "status" = 'NEW' AND "deletedAt" IS NULL`;
      if (updated !== 1) {
        if (lead.firstResponseAt) {
          throw new AppException(422, 'FIRST_CONTACT_ALREADY_RECORDED', 'First contact already recorded');
        }
        throw new AppException(422, 'INVALID_STATUS_TRANSITION', 'Lead is closed');
      }
      const after = await tx.lead.findFirstOrThrow({ where: { id, organizationId: actor.orgId } });
      await this.addActivity(tx, actor.orgId, id, 'FIRST_CONTACT', actor.userId, {
        channel: input.channel,
        slaState: after.slaState,
        viaAiDraft: opts.viaAiDraft ?? false,
      });
      if (input.comment) await this.addActivity(tx, actor.orgId, id, 'COMMENT', actor.userId, undefined, input.comment);
      this.events.emit(
        'lead_first_contact_recorded',
        { organizationId: actor.orgId, userId: actor.userId },
        {
          channel: input.channel,
          slaState: after.slaState,
          responseMinutes: Math.round((now.getTime() - after.receivedAt.getTime()) / 60_000),
          viaAiDraft: opts.viaAiDraft ?? false,
        },
      );
    };
    if (opts.tx) await run(opts.tx);
    else await this.prisma.db.$transaction(run);
  }

  async firstContact(actor: Actor, id: string, input: FirstContactRequest): Promise<LeadDto> {
    await this.recordFirstContact(actor, id, input);
    return this.getDto(actor, id);
  }

  /** FR-013, AC-026…AC-028 */
  async changeStatus(actor: Actor, id: string, input: ChangeStatusRequest): Promise<LeadDto> {
    const lead = await this.loadVisible(actor, id);
    this.assertCanAct(actor, lead);
    const check = canTransition(lead.status, input.status, actor.role, input.lostReason ?? null);
    if (!check.ok) {
      if (check.reason === 'FORBIDDEN') throw forbidden();
      if (check.reason === 'LOST_REASON_REQUIRED') {
        throw new AppException(400, 'VALIDATION_FAILED', 'Lost reason required', [
          { path: 'lostReason', code: 'lost_reason_required', message: 'Lost reason required' },
        ]);
      }
      throw new AppException(422, 'INVALID_STATUS_TRANSITION', `Transition ${lead.status} → ${input.status} is not allowed`);
    }
    const now = this.clock.now();
    const data: Prisma.LeadUncheckedUpdateManyInput = { status: input.status };
    if (input.status === 'LOST') {
      data.lostReason = input.lostReason;
      data.lostComment = input.lostReason === 'OTHER' ? (input.lostComment ?? null) : (input.lostComment ?? null);
      data.closedAt = now;
      if (lead.status === 'NEW' && lead.slaState === 'PENDING') data.slaState = 'EXEMPT';
    } else if (input.status === 'WON') {
      data.closedAt = now;
    } else if (input.status === 'CONTACTED') {
      data.closedAt = null;
      data.lostReason = null;
      data.lostComment = null;
    }
    const updated = await this.prisma.db.$transaction(async (tx) => {
      const r = await tx.lead.updateMany({
        where: { id, organizationId: actor.orgId, status: lead.status, deletedAt: null },
        data,
      });
      if (r.count !== 1) throw new AppException(422, 'INVALID_STATUS_TRANSITION', 'Lead status changed concurrently');
      await this.addActivity(tx, actor.orgId, id, 'STATUS_CHANGED', actor.userId, {
        from: lead.status,
        to: input.status,
        ...(input.lostReason ? { lostReason: input.lostReason } : {}),
      });
      if (input.status === 'LOST' && input.lostComment) {
        await this.addActivity(tx, actor.orgId, id, 'COMMENT', actor.userId, undefined, input.lostComment);
      }
      return tx.lead.findFirstOrThrow({ where: { id, organizationId: actor.orgId }, include: leadInclude });
    });
    this.events.emit(
      'lead_status_changed',
      { organizationId: actor.orgId, userId: actor.userId },
      { from: lead.status, to: input.status, lostReason: input.lostReason ?? null },
    );
    return this.toDto(updated);
  }

  /** FR-015: managers may comment on own and unassigned leads (visibility rule). */
  async addComment(actor: Actor, id: string, input: CommentRequest): Promise<LeadActivityDto> {
    await this.loadVisible(actor, id);
    const created = await this.prisma.db.$transaction((tx) =>
      this.addActivity(tx, actor.orgId, id, 'COMMENT', actor.userId, undefined, input.body),
    );
    return toActivityDto({ ...created, actor: { id: actor.userId, fullName: actor.fullName } });
  }

  /** AI module: history events for AI actions. */
  async recordAiActivity(
    actor: Actor,
    id: string,
    type: 'AI_ANALYSIS_GENERATED' | 'AI_DRAFT_SENT',
    payload: Record<string, unknown>,
    tx?: Tx,
  ): Promise<void> {
    if (tx) await this.addActivity(tx, actor.orgId, id, type, actor.userId, payload);
    else await this.prisma.db.$transaction((t) => this.addActivity(t, actor.orgId, id, type, actor.userId, payload));
  }

  // ---------------------------------------------------------------- SLA scheduler (system access)

  /** FR-033: marks overdue leads; returns breached rows. Uses SKIP LOCKED to coexist with first-contact. */
  async markOverdueBatch(tx: Tx, now: Date, batchSize: number): Promise<BreachedLead[]> {
    const rows = await tx.$queryRaw<BreachedLead[]>`
      WITH due AS (
        SELECT "id" FROM "Lead"
        WHERE "slaState" = 'PENDING' AND "firstResponseAt" IS NULL AND "deletedAt" IS NULL
          AND "firstResponseDueAt" <= ${now}
        ORDER BY "firstResponseDueAt"
        FOR UPDATE SKIP LOCKED
        LIMIT ${batchSize}
      )
      UPDATE "Lead" l SET "slaState" = 'BREACHED', "slaBreachedAt" = l."firstResponseDueAt", "updatedAt" = ${now}
      FROM due WHERE l."id" = due."id"
      RETURNING l."id", l."organizationId", l."number", l."assigneeId", l."firstResponseDueAt"`;
    if (rows.length > 0) {
      await tx.leadActivity.createMany({
        data: rows.map((r) => ({
          organizationId: r.organizationId,
          leadId: r.id,
          type: 'SLA_BREACHED' as const,
          actorUserId: null,
          payload: { dueAt: r.firstResponseDueAt.toISOString() },
          createdAt: now,
        })),
      });
    }
    return rows;
  }

  channelLabel(channel: ContactChannel): string {
    return channel;
  }
}
