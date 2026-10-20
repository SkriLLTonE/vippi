import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  permissionsFor,
  type ChangePasswordRequest,
  type LoginRequest,
  type MeResponse,
  type RegisterOrganizationRequest,
  type Role,
  type UpdateProfileRequest,
  type Locale,
} from '@vippi/shared';
import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import type { Actor } from '../../common/actor.js';
import { AppException } from '../../common/app-exception.js';
import { Clock } from '../../common/clock.js';
import { sha256Hex } from '../../common/crypto.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { ProductEvents } from '../../common/product-events.js';
import type { ReqMeta } from '../../common/req-meta.js';
import { AuditService } from '../audit/audit.service.js';
import { PasswordService } from './password.service.js';
import { SessionsService } from './sessions.service.js';

const LOGIN_WINDOW_MS = 15 * 60_000;
const LOGIN_MAX_FAILURES = 5;

export interface AuthResult {
  token: string;
  me: MeResponse;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionsService,
    private readonly audit: AuditService,
    private readonly clock: Clock,
    private readonly events: ProductEvents,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async emailTaken(email: string): Promise<boolean> {
    return (await this.prisma.system.user.count({ where: { email } })) > 0;
  }

  /** FR-001 */
  async register(input: RegisterOrganizationRequest, meta: ReqMeta): Promise<AuthResult> {
    if (await this.emailTaken(input.email)) throw emailTaken();
    const passwordHash = await this.passwords.hash(input.password);
    const locale = input.locale ?? 'ru';
    try {
      const result = await this.prisma.db.$transaction(async (tx) => {
        const org = await tx.organization.create({ data: { name: input.organizationName, defaultLocale: locale } });
        const user = await tx.user.create({
          data: { email: input.email, passwordHash, fullName: input.fullName, locale, lastLoginAt: this.clock.now() },
        });
        await tx.membership.create({ data: { organizationId: org.id, userId: user.id, role: 'OWNER' } });
        await tx.slaPolicy.create({ data: { organizationId: org.id } });
        const token = await this.sessions.create(tx, user.id, org.id, meta);
        await this.audit.append(
          {
            organizationId: org.id,
            action: 'ORG_REGISTERED',
            actorUserId: user.id,
            entityType: 'Organization',
            entityId: org.id,
            meta,
          },
          tx,
        );
        return { token, userId: user.id, orgId: org.id };
      });
      this.events.emit('org_registered', { organizationId: result.orgId, userId: result.userId });
      return { token: result.token, me: await this.me(result.userId, result.orgId, 'OWNER') };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw emailTaken();
      throw e;
    }
  }

  /** FR-002, SEC-004, SEC-019 */
  async login(input: LoginRequest, meta: ReqMeta): Promise<AuthResult> {
    const subjectHash = sha256Hex(input.email.toLowerCase());
    const since = new Date(this.clock.now().getTime() - LOGIN_WINDOW_MS);
    const failures = await this.audit.countRecentFailedLogins(subjectHash, since);
    if (failures >= LOGIN_MAX_FAILURES) {
      const oldest = await this.audit.oldestRecentFailedLogin(subjectHash, since);
      const retryAfter = oldest
        ? Math.max(1, Math.ceil((oldest.getTime() + LOGIN_WINDOW_MS - this.clock.now().getTime()) / 1000))
        : 900;
      await this.audit.append({
        organizationId: null,
        action: 'AUTH_LOGIN_FAILED',
        metadata: { reason: 'RATE_LIMITED' },
        meta,
      });
      throw new AppException(429, 'RATE_LIMITED', 'Too many login attempts', undefined, {
        'Retry-After': String(retryAfter),
      });
    }

    const user = await this.prisma.system.user.findUnique({
      where: { email: input.email },
      include: { membership: true },
    });
    const valid = user ? await this.passwords.verify(user.passwordHash, input.password) : await this.passwords.verifyDummy(input.password);
    const membership = user?.membership;
    if (!user || !valid || !membership || membership.status !== 'ACTIVE') {
      await this.audit.append({
        organizationId: membership?.organizationId ?? null,
        action: 'AUTH_LOGIN_FAILED',
        actorUserId: user?.id ?? null,
        subjectHash,
        metadata: { reason: 'INVALID_CREDENTIALS' },
        meta,
      });
      throw new AppException(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }

    const token = await this.prisma.db.$transaction(async (tx) => {
      const t = await this.sessions.create(tx, user.id, membership.organizationId, meta);
      await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: this.clock.now() } });
      await this.audit.append(
        {
          organizationId: membership.organizationId,
          action: 'AUTH_LOGIN_SUCCEEDED',
          actorUserId: user.id,
          entityType: 'User',
          entityId: user.id,
          meta,
        },
        tx,
      );
      return t;
    });
    return { token, me: await this.me(user.id, membership.organizationId, membership.role) };
  }

  async logout(actor: Actor, meta: ReqMeta): Promise<void> {
    await this.sessions.revoke(actor.sessionId);
    await this.audit.append({
      organizationId: actor.orgId,
      action: 'AUTH_LOGOUT',
      actorUserId: actor.userId,
      entityType: 'User',
      entityId: actor.userId,
      meta,
    });
  }

  async me(userId: string, orgId: string, role: Role): Promise<MeResponse> {
    const [user, org] = await Promise.all([
      this.prisma.system.user.findUniqueOrThrow({ where: { id: userId } }),
      this.prisma.system.organization.findUniqueOrThrow({ where: { id: orgId } }),
    ]);
    return {
      user: { id: user.id, email: user.email, fullName: user.fullName, locale: user.locale as Locale },
      organization: {
        id: org.id,
        name: org.name,
        isDemo: org.isDemo,
        aiExternalProcessingEnabled: org.aiExternalProcessingEnabled,
        timezone: org.timezone,
      },
      role,
      permissions: permissionsFor(role),
      features: this.config.features,
      serverTime: this.clock.now().toISOString(),
    };
  }

  /** FR-004 */
  async updateProfile(actor: Actor, input: UpdateProfileRequest): Promise<MeResponse> {
    await this.prisma.system.user.update({
      where: { id: actor.userId },
      data: { ...(input.fullName ? { fullName: input.fullName } : {}), ...(input.locale ? { locale: input.locale } : {}) },
    });
    if (input.locale) this.events.emit('locale_switched', { organizationId: actor.orgId, userId: actor.userId }, { to: input.locale });
    return this.me(actor.userId, actor.orgId, actor.role);
  }

  /** FR-004: change password, revoke all other sessions. */
  async changePassword(actor: Actor, input: ChangePasswordRequest, meta: ReqMeta): Promise<void> {
    const user = await this.prisma.system.user.findUniqueOrThrow({ where: { id: actor.userId } });
    if (!(await this.passwords.verify(user.passwordHash, input.currentPassword))) {
      throw new AppException(400, 'VALIDATION_FAILED', 'Current password is incorrect', [
        { path: 'currentPassword', code: 'invalid_current_password', message: 'Current password is incorrect' },
      ]);
    }
    if (input.newPassword.toLowerCase() === user.email.toLowerCase()) {
      throw new AppException(400, 'VALIDATION_FAILED', 'Password must differ from email', [
        { path: 'newPassword', code: 'password_equals_email', message: 'Password must differ from email' },
      ]);
    }
    const passwordHash = await this.passwords.hash(input.newPassword);
    await this.prisma.db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: actor.userId }, data: { passwordHash } });
      await this.sessions.revokeAllForUser(actor.userId, tx, actor.sessionId);
      await this.audit.append(
        {
          organizationId: actor.orgId,
          action: 'PASSWORD_CHANGED',
          actorUserId: actor.userId,
          entityType: 'User',
          entityId: actor.userId,
          meta,
        },
        tx,
      );
    });
  }
}

export function emailTaken(): AppException {
  return new AppException(409, 'EMAIL_TAKEN', 'Email is already registered', [
    { path: 'email', code: 'email_taken', message: 'Email is already registered' },
  ]);
}
