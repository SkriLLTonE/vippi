import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuditAction, AuditLogDto, AuditLogQuery, Paginated } from '@vippi/shared';
import { zonedPeriodToUtc } from '@vippi/shared';
import { PrismaService, type Tx } from '../../common/prisma/prisma.service.js';
import type { ReqMeta } from '../../common/req-meta.js';

export interface AuditEntry {
  organizationId: string | null;
  action: AuditAction;
  actorUserId?: string | null;
  actorApiKeyId?: string | null;
  system?: boolean;
  entityType?: string | null;
  entityId?: string | null;
  subjectHash?: string | null;
  metadata?: Record<string, unknown> | null;
  meta?: ReqMeta;
}

/** Append-only audit journal (FR-090, SEC-018): exposes only append and list. */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async append(entry: AuditEntry, tx?: Tx): Promise<void> {
    const client = tx ?? this.prisma.db;
    const data: Prisma.AuditLogUncheckedCreateInput = {
      organizationId: entry.organizationId,
      action: entry.action,
      actorType: entry.system ? 'SYSTEM' : entry.actorApiKeyId ? 'API_KEY' : 'USER',
      actorUserId: entry.actorUserId ?? null,
      actorApiKeyId: entry.actorApiKeyId ?? null,
      entityType: entry.entityType ?? null,
      entityId: entry.entityId ?? null,
      subjectHash: entry.subjectHash ?? null,
      metadata: (entry.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      ip: entry.meta?.ip ?? null,
      userAgent: entry.meta?.userAgent ?? null,
    };
    if (entry.organizationId) {
      await client.auditLog.create({ data });
    } else {
      // Failed login of an unknown email has no tenant; written via the system client.
      await this.prisma.system.auditLog.create({ data });
    }
  }

  async countRecentFailedLogins(subjectHash: string, since: Date): Promise<number> {
    return this.prisma.system.auditLog.count({
      where: { subjectHash, action: 'AUTH_LOGIN_FAILED', createdAt: { gt: since } },
    });
  }

  async oldestRecentFailedLogin(subjectHash: string, since: Date): Promise<Date | null> {
    const row = await this.prisma.system.auditLog.findFirst({
      where: { subjectHash, action: 'AUTH_LOGIN_FAILED', createdAt: { gt: since } },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    });
    return row?.createdAt ?? null;
  }

  async list(orgId: string, q: AuditLogQuery): Promise<Paginated<AuditLogDto>> {
    const where: Prisma.AuditLogWhereInput = { organizationId: orgId };
    if (q.action) where.action = q.action;
    if (q.actorUserId) where.actorUserId = q.actorUserId;
    if (q.from || q.to) {
      const { start, end } = zonedPeriodToUtc(q.from ?? '2000-01-01', q.to ?? '2100-01-01');
      where.createdAt = { gte: start, lt: end };
    }
    const [total, rows] = await Promise.all([
      this.prisma.db.auditLog.count({ where }),
      this.prisma.db.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: {
          actorUser: { select: { id: true, fullName: true } },
          actorApiKey: { select: { id: true, name: true } },
        },
      }),
    ]);
    return {
      page: q.page,
      pageSize: q.pageSize,
      total,
      items: rows.map((r) => ({
        id: r.id,
        action: r.action,
        actorType: r.actorType,
        actor: r.actorUser,
        apiKey: r.actorApiKey,
        entityType: r.entityType,
        entityId: r.entityId,
        metadata: (r.metadata as Record<string, unknown> | null) ?? null,
        ip: r.ip,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }
}
