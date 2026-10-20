import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  buildLeadSearchText,
  CSV_TEMPLATE_HEADERS,
  OPEN_LEAD_STATUSES,
  type CsvImportResult,
  type CsvLeadRowNormalized,
  type CsvPreviewResult,
  type CsvRowError,
} from '@vippi/shared';
import type { Actor } from '../../common/actor.js';
import { Clock } from '../../common/clock.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { ProductEvents } from '../../common/product-events.js';
import type { ReqMeta } from '../../common/req-meta.js';
import { AuditService } from '../audit/audit.service.js';
import { computeDueAt, historicalSlaState } from '../sla/domain/compute-due-at.js';
import { SlaPolicyService } from '../sla/sla-policy.service.js';
import { parseLeadsCsv } from './domain/csv-import.js';
import { LeadsService } from './leads.service.js';

const MAX_ERRORS = 500;
const BATCH = 500;
const DUPLICATE_WINDOW_MS = 30 * 86_400_000;

interface Validated {
  totalRows: number;
  valid: Array<CsvLeadRowNormalized & { assigneeId: string | null }>;
  duplicates: number;
  errors: CsvRowError[];
}

@Injectable()
export class LeadsImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly sla: SlaPolicyService,
    private readonly leads: LeadsService,
    private readonly audit: AuditService,
    private readonly events: ProductEvents,
  ) {}

  template(): string {
    const example = [
      'Test Lead',
      '+998 00 123 45 67',
      'INSTAGRAM',
      '2 xonali kvartira kerak',
      '60000',
      'USD',
      'YUNUSOBOD',
      'APARTMENT',
      '2',
      '',
      '2026-10-01 10:00',
      '2026-10-01 10:40',
      'crm-0001',
    ];
    return `\uFEFF${CSV_TEMPLATE_HEADERS.join(',')}\r\n${example.join(',')}\r\n`;
  }

  private async validate(actor: Actor, buffer: Buffer, now: Date): Promise<Validated> {
    const parsed = parseLeadsCsv(buffer, now);
    const errors = [...parsed.errors];

    const emails = [...new Set(parsed.rows.map((r) => r.assigneeEmail).filter((e): e is string => e !== null))];
    const members = emails.length
      ? await this.prisma.db.membership.findMany({
          where: { organizationId: actor.orgId, status: 'ACTIVE', user: { email: { in: emails } } },
          select: { userId: true, user: { select: { email: true } } },
        })
      : [];
    const emailToUser = new Map(members.map((m) => [m.user.email.toLowerCase(), m.userId]));

    const externalIds = parsed.rows.map((r) => r.externalId).filter((e): e is string => e !== null);
    const existing = externalIds.length
      ? await this.prisma.db.lead.findMany({
          where: { organizationId: actor.orgId, externalId: { in: externalIds } },
          select: { externalId: true },
        })
      : [];
    const seen = new Set(existing.map((e) => e.externalId));

    const valid: Validated['valid'] = [];
    let duplicates = 0;
    for (const r of parsed.rows) {
      let assigneeId: string | null = null;
      if (r.assigneeEmail) {
        assigneeId = emailToUser.get(r.assigneeEmail) ?? null;
        if (!assigneeId) {
          errors.push({ row: r.row, column: 'assigneeEmail', code: 'assignee_invalid' });
          continue;
        }
      }
      if (r.externalId) {
        if (seen.has(r.externalId)) {
          duplicates += 1;
          continue;
        }
        seen.add(r.externalId);
      }
      valid.push({ ...r, assigneeId });
    }
    errors.sort((a, b) => a.row - b.row);
    return { totalRows: parsed.totalRows, valid, duplicates, errors };
  }

  async preview(actor: Actor, buffer: Buffer): Promise<CsvPreviewResult> {
    const v = await this.validate(actor, buffer, this.clock.now());
    const invalidRows = new Set(v.errors.map((e) => e.row)).size;
    return {
      totalRows: v.totalRows,
      validRows: v.valid.length,
      invalidRows,
      duplicateRows: v.duplicates,
      errors: v.errors.slice(0, MAX_ERRORS),
      sample: v.valid.slice(0, 20).map(({ assigneeId: _a, ...row }) => row),
    };
  }

  /** FR-061: imports only valid rows in one transaction; no notifications for historical breaches. */
  async import(actor: Actor, buffer: Buffer, meta: ReqMeta): Promise<CsvImportResult> {
    const now = this.clock.now();
    const v = await this.validate(actor, buffer, now);
    const invalidRows = new Set(v.errors.map((e) => e.row)).size;
    const policy = await this.sla.getForOrg(actor.orgId);
    let historical = 0;

    await this.prisma.db.$transaction(
      async (tx) => {
        const phones = [...new Set(v.valid.map((r) => r.phone).filter((p): p is string => p !== null))];
        const dupRows = phones.length
          ? await tx.lead.findMany({
              where: {
                organizationId: actor.orgId,
                phone: { in: phones },
                deletedAt: null,
                status: { in: [...OPEN_LEAD_STATUSES] },
                receivedAt: { gte: new Date(now.getTime() - DUPLICATE_WINDOW_MS) },
              },
              orderBy: { receivedAt: 'asc' },
              select: { id: true, phone: true },
            })
          : [];
        const firstByPhone = new Map<string, string>();
        for (const d of dupRows) if (d.phone && !firstByPhone.has(d.phone)) firstByPhone.set(d.phone, d.id);

        if (v.valid.length === 0) return;
        let number = await this.leads.reserveNumbers(tx, actor.orgId, v.valid.length);
        for (let i = 0; i < v.valid.length; i += BATCH) {
          const chunk = v.valid.slice(i, i + BATCH);
          const leads: Prisma.LeadCreateManyInput[] = [];
          const activities: Prisma.LeadActivityCreateManyInput[] = [];
          for (const r of chunk) {
            const id = randomUUID();
            const receivedAt = r.receivedAt ? new Date(r.receivedAt) : now;
            const firstResponseAt = r.firstResponseAt ? new Date(r.firstResponseAt) : null;
            const dueAt = computeDueAt(receivedAt, policy);
            const sla = historicalSlaState(dueAt, firstResponseAt, now);
            if (r.receivedAt) historical += 1;
            leads.push({
              id,
              organizationId: actor.orgId,
              number: number++,
              fullName: r.fullName,
              phone: r.phone,
              source: r.source,
              message: r.message,
              budgetAmount: r.budget ? BigInt(r.budget.amount) : null,
              budgetCurrency: r.budget?.currency ?? null,
              district: r.district,
              propertyType: r.propertyType,
              rooms: r.rooms,
              searchText: buildLeadSearchText(r),
              status: firstResponseAt ? 'CONTACTED' : 'NEW',
              assigneeId: r.assigneeId,
              createdById: actor.userId,
              createdVia: 'CSV',
              externalId: r.externalId,
              receivedAt,
              firstResponseDueAt: dueAt,
              firstResponseAt,
              slaState: sla.slaState,
              slaBreachedAt: sla.slaBreachedAt,
              possibleDuplicateOfId: r.phone ? (firstByPhone.get(r.phone) ?? null) : null,
            });
            activities.push({
              organizationId: actor.orgId,
              leadId: id,
              type: 'CREATED',
              actorUserId: actor.userId,
              payload: { via: 'CSV', row: r.row },
              createdAt: now,
            });
            if (r.phone && !firstByPhone.has(r.phone) && !firstResponseAt) firstByPhone.set(r.phone, id);
          }
          await tx.lead.createMany({ data: leads });
          await tx.leadActivity.createMany({ data: activities });
        }
        await this.audit.append(
          {
            organizationId: actor.orgId,
            action: 'CSV_IMPORTED',
            actorUserId: actor.userId,
            entityType: 'Lead',
            metadata: { totalRows: v.totalRows, imported: v.valid.length, skipped: invalidRows + v.duplicates },
            meta,
          },
          tx,
        );
      },
      { timeout: 60_000, maxWait: 10_000 },
    );
    this.events.emit(
      'csv_import_completed',
      { organizationId: actor.orgId, userId: actor.userId },
      { rows: v.totalRows, imported: v.valid.length, skipped: invalidRows + v.duplicates, historical },
    );
    return { imported: v.valid.length, skipped: invalidRows + v.duplicates, errors: v.errors.slice(0, MAX_ERRORS) };
  }
}
