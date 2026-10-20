import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  invitableRoles,
  type AcceptInvitationRequest,
  type CreatedInvitationDto,
  type CreateInvitationRequest,
  type InvitationDto,
  type InvitationPreviewDto,
  type MeResponse,
} from '@vippi/shared';
import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import type { Actor } from '../../common/actor.js';
import { AppException, notFound } from '../../common/app-exception.js';
import { Clock } from '../../common/clock.js';
import { randomToken, sha256Hex } from '../../common/crypto.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { ProductEvents } from '../../common/product-events.js';
import type { ReqMeta } from '../../common/req-meta.js';
import { AuditService } from '../audit/audit.service.js';
import { AuthService, emailTaken } from '../identity-access/auth.service.js';
import { PasswordService } from '../identity-access/password.service.js';
import { SessionsService } from '../identity-access/sessions.service.js';

const INVITATION_TTL_MS = 7 * 86_400_000;

const invalid = () => new AppException(410, 'INVITATION_INVALID', 'Invitation is invalid or expired');

@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly clock: Clock,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionsService,
    private readonly auth: AuthService,
    private readonly events: ProductEvents,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** FR-007: pending (not accepted, not revoked, not expired). */
  async listPending(actor: Actor): Promise<InvitationDto[]> {
    const rows = await this.prisma.db.invitation.findMany({
      where: { organizationId: actor.orgId, acceptedAt: null, revokedAt: null, expiresAt: { gt: this.clock.now() } },
      include: { invitedBy: { select: { id: true, fullName: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id,
      email: r.email,
      role: r.role,
      invitedBy: r.invitedBy,
      expiresAt: r.expiresAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /** FR-005, AC-008…AC-011 */
  async create(actor: Actor, input: CreateInvitationRequest, meta: ReqMeta): Promise<CreatedInvitationDto> {
    if (!invitableRoles(actor.role).includes(input.role)) {
      throw new AppException(403, 'FORBIDDEN', 'Role cannot be invited by current user');
    }
    if (await this.auth.emailTaken(input.email)) throw emailTaken();
    const now = this.clock.now();
    const token = randomToken();
    try {
      const inv = await this.prisma.db.$transaction(async (tx) => {
        await tx.invitation.updateMany({
          where: {
            organizationId: actor.orgId,
            email: input.email,
            acceptedAt: null,
            revokedAt: null,
            expiresAt: { lte: now },
          },
          data: { revokedAt: now },
        });
        const existing = await tx.invitation.count({
          where: { organizationId: actor.orgId, email: input.email, acceptedAt: null, revokedAt: null },
        });
        if (existing > 0) throw invitationExists();
        const created = await tx.invitation.create({
          data: {
            organizationId: actor.orgId,
            email: input.email,
            role: input.role,
            tokenHash: sha256Hex(token),
            invitedById: actor.userId,
            expiresAt: new Date(now.getTime() + INVITATION_TTL_MS),
            createdAt: now,
          },
        });
        await this.audit.append(
          {
            organizationId: actor.orgId,
            action: 'INVITATION_CREATED',
            actorUserId: actor.userId,
            entityType: 'Invitation',
            entityId: created.id,
            metadata: { role: input.role },
            meta,
          },
          tx,
        );
        return created;
      });
      this.events.emit('invitation_created', { organizationId: actor.orgId, userId: actor.userId }, { role: input.role });
      return {
        id: inv.id,
        email: inv.email,
        role: inv.role,
        invitedBy: { id: actor.userId, fullName: actor.fullName },
        expiresAt: inv.expiresAt.toISOString(),
        createdAt: inv.createdAt.toISOString(),
        inviteUrl: `${this.config.publicOrigin}/invite/${token}`,
      };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw invitationExists();
      throw e;
    }
  }

  /** FR-007 */
  async revoke(actor: Actor, id: string, meta: ReqMeta): Promise<void> {
    const inv = await this.prisma.db.invitation.findFirst({ where: { id, organizationId: actor.orgId } });
    if (!inv) throw notFound();
    if (actor.role === 'HEAD_OF_SALES' && inv.invitedById !== actor.userId) {
      throw new AppException(403, 'FORBIDDEN', 'Only own invitations can be revoked');
    }
    if (inv.acceptedAt || inv.revokedAt) return;
    await this.prisma.db.$transaction(async (tx) => {
      await tx.invitation.update({
        where: { id: inv.id, organizationId: actor.orgId },
        data: { revokedAt: this.clock.now() },
      });
      await this.audit.append(
        {
          organizationId: actor.orgId,
          action: 'INVITATION_REVOKED',
          actorUserId: actor.userId,
          entityType: 'Invitation',
          entityId: inv.id,
          meta,
        },
        tx,
      );
    });
  }

  private async findValidByToken(token: string) {
    const inv = await this.prisma.system.invitation.findUnique({
      where: { tokenHash: sha256Hex(token) },
      include: { organization: { select: { name: true } } },
    });
    if (!inv || inv.acceptedAt || inv.revokedAt || inv.expiresAt <= this.clock.now()) throw invalid();
    return inv;
  }

  /** FR-006, SEC-019: only organization name and role are disclosed. */
  async preview(token: string): Promise<InvitationPreviewDto> {
    const inv = await this.findValidByToken(token);
    return { organizationName: inv.organization.name, role: inv.role };
  }

  /** FR-006, AC-012…AC-014 */
  async accept(input: AcceptInvitationRequest, meta: ReqMeta): Promise<{ token: string; me: MeResponse }> {
    const inv = await this.findValidByToken(input.token);
    if (await this.auth.emailTaken(inv.email)) throw emailTaken();
    if (input.password.toLowerCase() === inv.email.toLowerCase()) {
      throw new AppException(400, 'VALIDATION_FAILED', 'Password must differ from email', [
        { path: 'password', code: 'password_equals_email', message: 'Password must differ from email' },
      ]);
    }
    const passwordHash = await this.passwords.hash(input.password);
    const org = await this.prisma.system.organization.findUniqueOrThrow({ where: { id: inv.organizationId } });
    try {
      const result = await this.prisma.db.$transaction(async (tx) => {
        const claimed = await tx.invitation.updateMany({
          where: { id: inv.id, organizationId: inv.organizationId, acceptedAt: null, revokedAt: null },
          data: { acceptedAt: this.clock.now() },
        });
        if (claimed.count !== 1) throw invalid();
        const user = await tx.user.create({
          data: { email: inv.email, passwordHash, fullName: input.fullName, locale: org.defaultLocale },
        });
        await tx.invitation.update({
          where: { id: inv.id, organizationId: inv.organizationId },
          data: { acceptedUserId: user.id },
        });
        await tx.membership.create({ data: { organizationId: inv.organizationId, userId: user.id, role: inv.role } });
        const token = await this.sessions.create(tx, user.id, inv.organizationId, meta);
        await this.audit.append(
          {
            organizationId: inv.organizationId,
            action: 'INVITATION_ACCEPTED',
            actorUserId: user.id,
            entityType: 'Invitation',
            entityId: inv.id,
            metadata: { role: inv.role },
            meta,
          },
          tx,
        );
        return { token, userId: user.id };
      });
      this.events.emit('invitation_accepted', { organizationId: inv.organizationId, userId: result.userId }, { role: inv.role });
      return { token: result.token, me: await this.auth.me(result.userId, inv.organizationId, inv.role) };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw emailTaken();
      throw e;
    }
  }
}

function invitationExists(): AppException {
  return new AppException(409, 'INVITATION_EXISTS', 'Active invitation already exists', [
    { path: 'email', code: 'invitation_exists', message: 'Active invitation already exists' },
  ]);
}
