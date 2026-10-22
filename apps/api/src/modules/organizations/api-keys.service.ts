import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ApiKey } from '@prisma/client';
import type { ApiKeyDto, CreatedApiKeyDto, CreateApiKeyRequest, RevealedApiKeyDto } from '@vippi/shared';
import type { Actor, ApiKeyActor } from '../../common/actor.js';
import { AppException, notFound } from '../../common/app-exception.js';
import { Clock } from '../../common/clock.js';
import { openSecret, randomToken, sealSecret, sha256Hex } from '../../common/crypto.js';
import { PrismaService, type Tx } from '../../common/prisma/prisma.service.js';
import { RateLimiter } from '../../common/rate-limiter.js';
import type { ReqMeta } from '../../common/req-meta.js';
import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import { AuditService } from '../audit/audit.service.js';

const MAX_ACTIVE_KEYS = 5;
const LAST_USED_THROTTLE_MS = 60_000;
const REVEAL_LIMIT = 30;
const REVEAL_WINDOW_MS = 10 * 60_000;

type KeyRow = ApiKey & { createdBy: { id: string; fullName: string } | null };

function toDto(r: KeyRow): ApiKeyDto {
  return {
    id: r.id,
    name: r.name,
    prefix: r.prefix,
    createdAt: r.createdAt.toISOString(),
    createdBy: r.createdBy,
    lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
    revokedAt: r.revokedAt?.toISOString() ?? null,
    last3: r.keyLast3,
    revealable: r.keyCiphertext !== null,
  };
}

@Injectable()
export class ApiKeysService {
  private readonly logger = new Logger(ApiKeysService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly clock: Clock,
    private readonly limiter: RateLimiter,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Active keys only: deleted (revoked) keys stay in the database for the audit trail. */
  async list(actor: Actor): Promise<ApiKeyDto[]> {
    const rows = await this.prisma.db.apiKey.findMany({
      where: { organizationId: actor.orgId, revokedAt: null },
      include: { createdBy: { select: { id: true, fullName: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toDto);
  }

  /** FR-062, SEC-008, AC-058 */
  async create(actor: Actor, input: CreateApiKeyRequest, meta: ReqMeta): Promise<CreatedApiKeyDto> {
    return this.prisma.db.$transaction(async (tx) => {
      await this.lockOrganization(tx, actor.orgId);
      const active = await tx.apiKey.count({ where: { organizationId: actor.orgId, revokedAt: null } });
      if (active >= MAX_ACTIVE_KEYS) throw new AppException(422, 'API_KEY_LIMIT', 'Active API key limit reached');
      const created = await this.insertKey(tx, actor, input.name);
      await this.audit.append(
        {
          organizationId: actor.orgId,
          action: 'API_KEY_CREATED',
          actorUserId: actor.userId,
          entityType: 'ApiKey',
          entityId: created.id,
          metadata: { prefix: created.prefix },
          meta,
        },
        tx,
      );
      return created;
    });
  }

  /** "Delete" in the UI: soft revoke, the row stays for audit. */
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

  /** Decrypts an active key for copying. Never logged; every reveal is audited. */
  async reveal(actor: Actor, id: string, meta: ReqMeta): Promise<RevealedApiKeyDto> {
    const retryAfter = this.limiter.hit(`api-key-reveal:${actor.userId}`, REVEAL_LIMIT, REVEAL_WINDOW_MS);
    if (retryAfter > 0) {
      throw new AppException(429, 'RATE_LIMITED', 'Too many API key reveals', undefined, { 'Retry-After': String(retryAfter) });
    }
    const row = await this.prisma.db.apiKey.findFirst({ where: { id, organizationId: actor.orgId, revokedAt: null } });
    if (!row) throw notFound();
    const key = row.keyCiphertext ? openSecret(row.keyCiphertext, this.config.apiKeyEncryptionKey, actor.orgId) : null;
    if (!key) {
      if (row.keyCiphertext) this.logger.warn({ msg: 'API key ciphertext cannot be decrypted (encryption key changed?)', apiKeyId: row.id });
      throw new AppException(422, 'API_KEY_NOT_REVEALABLE', 'This key was created before encryption at rest; rotate it');
    }
    await this.audit.append({
      organizationId: actor.orgId,
      action: 'API_KEY_REVEALED',
      actorUserId: actor.userId,
      entityType: 'ApiKey',
      entityId: row.id,
      metadata: { prefix: row.prefix },
      meta,
    });
    return { key };
  }

  /** Atomically replaces a key: new key with the same name, the old one stops working immediately. */
  async rotate(actor: Actor, id: string, meta: ReqMeta): Promise<CreatedApiKeyDto> {
    return this.prisma.db.$transaction(async (tx) => {
      await this.lockOrganization(tx, actor.orgId);
      const old = await tx.apiKey.findFirst({ where: { id, organizationId: actor.orgId, revokedAt: null } });
      if (!old) throw notFound();
      // Revoke first so the active-key count never exceeds the limit.
      await tx.apiKey.update({ where: { id: old.id, organizationId: actor.orgId }, data: { revokedAt: this.clock.now() } });
      const created = await this.insertKey(tx, actor, old.name);
      await this.audit.append(
        {
          organizationId: actor.orgId,
          action: 'API_KEY_ROTATED',
          actorUserId: actor.userId,
          entityType: 'ApiKey',
          entityId: created.id,
          metadata: { prefix: created.prefix, replacedKeyId: old.id, replacedPrefix: old.prefix },
          meta,
        },
        tx,
      );
      return created;
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

  /** Serializes key changes per organization to enforce the active-key limit. */
  private async lockOrganization(tx: Tx, orgId: string): Promise<void> {
    await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${orgId}::uuid FOR UPDATE`;
  }

  private async insertKey(tx: Tx, actor: Actor, name: string): Promise<CreatedApiKeyDto> {
    const key = `vpk_${randomToken()}`;
    const row = await tx.apiKey.create({
      data: {
        organizationId: actor.orgId,
        name,
        prefix: key.slice(0, 12),
        keyHash: sha256Hex(key),
        keyCiphertext: sealSecret(key, this.config.apiKeyEncryptionKey, actor.orgId),
        keyLast3: key.slice(-3),
        createdById: actor.userId,
      },
    });
    return { ...toDto({ ...row, createdBy: { id: actor.userId, fullName: actor.fullName } }), key };
  }
}
