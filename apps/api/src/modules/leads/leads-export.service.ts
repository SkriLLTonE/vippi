import { Inject, Injectable } from '@nestjs/common';
import {
  CSV_EXPORT_HEADERS,
  formatDateTimeTz,
  parseLeadFieldDefs,
  visibleAttributes,
  zonedParts,
  type LeadAttributeValue,
  type LeadExportQuery,
} from '@vippi/shared';
import type { Actor } from '../../common/actor.js';
import { AppException } from '../../common/app-exception.js';
import { Clock } from '../../common/clock.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { ProductEvents } from '../../common/product-events.js';
import type { ReqMeta } from '../../common/req-meta.js';
import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import { AuditService } from '../audit/audit.service.js';
import { SlaPolicyService } from '../sla/sla-policy.service.js';
import { csvLine } from './domain/csv-export.js';
import { buildLeadWhere, leadOrderBy } from './domain/lead-where.js';

const pad = (n: number) => String(n).padStart(2, '0');
const fmt = (d: Date | null) => (d ? formatDateTimeTz(d) : null);
const attributeCell = (v: LeadAttributeValue | undefined) =>
  v === undefined ? null : typeof v === 'object' ? `${v.amount} ${v.currency}` : v;

@Injectable()
export class LeadsExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly sla: SlaPolicyService,
    private readonly audit: AuditService,
    private readonly events: ProductEvents,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** FR-064: same filters and visibility as the list, no paging. */
  async export(actor: Actor, q: LeadExportQuery, meta: ReqMeta): Promise<{ filename: string; body: string }> {
    const now = this.clock.now();
    const policy = await this.sla.getForOrg(actor.orgId);
    const where = buildLeadWhere(actor, q, now, policy.forgottenAfterHours);
    const total = await this.prisma.db.lead.count({ where });
    if (total > this.config.EXPORT_MAX_ROWS) {
      throw new AppException(422, 'EXPORT_TOO_LARGE', `Too many rows (${total} > ${this.config.EXPORT_MAX_ROWS})`, [
        { path: 'filters', code: 'export_too_large', message: String(this.config.EXPORT_MAX_ROWS) },
      ]);
    }
    const rows = await this.prisma.db.lead.findMany({
      where,
      orderBy: leadOrderBy(q.sort),
      include: { assignee: { select: { fullName: true, email: true } } },
    });

    const org = await this.prisma.system.organization.findUniqueOrThrow({
      where: { id: actor.orgId },
      select: { leadFieldDefs: true },
    });
    const fieldDefs = parseLeadFieldDefs(org.leadFieldDefs);

    // Fixed headers first (import template compatibility), then one `attr:<key>` column per active custom field.
    let body = `\uFEFF${csvLine([...CSV_EXPORT_HEADERS, ...fieldDefs.map((d) => `attr:${d.key}`)])}`;
    for (const l of rows) {
      const attrs = visibleAttributes(fieldDefs, l.attributes);
      body += csvLine([
        l.number,
        fmt(l.receivedAt),
        l.fullName,
        l.phone,
        l.source,
        l.sourceDetail,
        l.message,
        l.budgetAmount?.toString() ?? null,
        l.budgetCurrency,
        l.district,
        l.propertyType,
        l.rooms,
        l.status,
        l.lostReason,
        l.slaState,
        fmt(l.firstResponseDueAt),
        fmt(l.firstResponseAt),
        l.firstResponseChannel,
        l.assignee?.email ?? null,
        l.assignee?.fullName ?? null,
        l.createdVia,
        l.externalId,
        l.possibleDuplicateOfId !== null,
        ...fieldDefs.map((d) => attributeCell(attrs[d.key])),
      ]);
    }

    const { q: search, sort, ...filters } = q;
    await this.audit.append({
      organizationId: actor.orgId,
      action: 'LEADS_EXPORTED',
      actorUserId: actor.userId,
      entityType: 'Lead',
      metadata: { rows: rows.length, filters: { ...filters, sort }, hasSearch: Boolean(search) },
      meta,
    });
    this.events.emit('leads_exported', { organizationId: actor.orgId, userId: actor.userId }, { rows: rows.length });

    const p = zonedParts(now);
    const filename = `leads-${p.year}${pad(p.month)}${pad(p.day)}-${pad(p.hour)}${pad(p.minute)}.csv`;
    return { filename, body };
  }
}
