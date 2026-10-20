import { Injectable } from '@nestjs/common';
import type { ApiKeyDto, CreatedApiKeyDto, CreateApiKeyRequest } from '@vippi/shared';
import type { Actor, ApiKeyActor } from '../../common/actor.js';
import { AppException, notFound } from '../../common/app-exception.js';
import { Clock } from '../../common/clock.js';
import { randomToken, sha256Hex } from '../../common/crypto.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import type { ReqMeta } from '../../common/req-meta.js';
import { AuditService } from '../audit/audit.service.js';

const MAX_ACTIVE_KEYS = 5;
const LAST_USED_THROTTLE_MS = 60_000;

@Injectable()
export class ApiKeysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  async list(actor: Actor): Promise<ApiKeyDto[]> {
    const rows = await this.prisma.db.apiKey.findMany({
      where: { organizationId: actor.orgId },
      include: { createdBy: { select: { id: true, fullName: true } } },
      orderBy: [{ revokedAt: { sort: 'desc', nulls: 'first' } }, { createdAt: 'desc' }],
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      prefix: r.prefix,
      createdAt: r.createdAt.toISOString(),
      createdBy: r.createdBy,
      lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
      revokedAt: r.revokedAt?.toISOString() ?? null,
    }));
  }

  /** FR-062, SEC-008, AC-058 */
  async create(actor: Actor, input: CreateApiKeyRequest, meta: ReqMeta): Promise<CreatedApiKeyDto> {
    const key = `vpk_${randomToken()}`;
    const created = await this.prisma.db.$transaction(async (tx) => {
      // Serialize key creation per organization to enforce the active-key limit.
      await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${actor.orgId}::uuid FOR UPDATE`;
      const active = await tx.apiKey.count({ where: { organizationId: actor.orgId, revokedAt: null } });
      if (active >= MAX_ACTIVE_KEYS) throw new AppException(422, 'API_KEY_LIMIT', 'Active API key limit reached');
      const row = await tx.apiKey.create({
        data: {
          organizationId: actor.orgId,
          name: input.name,
          prefix: key.slice(0, 12),
          keyHash: sha256Hex(key),
          createdById: actor.userId,
        },
      });
      await this.audit.append(
        {
          organizationId: actor.orgId,
          action: 'API_KEY_CREATED',
          actorUserId: actor.userId,
          entityType: 'ApiKey',
          entityId: row.id,
          metadata: { prefix: row.prefix },
          meta,
        },
        tx,
      );
      return row;
    });
    return {
      id: created.id,
      name: created.name,
      prefix: created.prefix,
      createdAt: created.createdAt.toISOString(),
      createdBy: { id: actor.userId, fullName: actor.fullName },
      lastUsedAt: null,
      revokedAt: null,
      key,
    };
  }

  async revoke(actor: Actor, id: string, meta: ReqMeta): Promise<void> {
    const row = await this.prisma.db.apiKey.findFirst({ where: { id, organizationId: actor.orgId } });
    if (!row) throw notFound();
    if (row.revokedAt) return;
    await this.prisma.db.$transaction(async (tx) => {
      await tx.apiKey.update({ where: { id: row.id, organizationId: actor.orgId }, data: { revokedAt: this.clock.now() } });
      await this.audit.append(
        {
          organizationId: actor.orgId,
          action: 'API_KEY_REVOKED',
          actorUserId: actor.userId,
          entityType: 'ApiKey',
          entityId: row.id,
          meta,
        },
        tx,
      );
    });
  }

  /** Resolves a raw X-Api-Key to its organization (pre-tenant lookup by hash). */
  async resolve(rawKey: string): Promise<ApiKeyActor | null> {
    if (!rawKey.startsWith('vpk_') || rawKey.length > 100) return null;
    const row = await this.prisma.system.apiKey.findUnique({ where: { keyHash: sha256Hex(rawKey) } });
    if (!row || row.revokedAt) return null;
    const now = this.clock.now();
    if (!row.lastUsedAt || now.getTime() - row.lastUsedAt.getTime() > LAST_USED_THROTTLE_MS) {
      await this.prisma.system.apiKey.update({ where: { id: row.id }, data: { lastUsedAt: now } });
    }
    return { apiKeyId: row.id, orgId: row.organizationId };
  }
}
