import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { Request, Response } from 'express';
import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import type { Actor } from '../../common/actor.js';
import { Clock } from '../../common/clock.js';
import { randomToken, sha256Hex } from '../../common/crypto.js';
import { PrismaService, type Tx } from '../../common/prisma/prisma.service.js';
import type { ReqMeta } from '../../common/req-meta.js';

export const SESSION_COOKIE = 'vippi_sid';
const DAY_MS = 86_400_000;
const RENEW_THROTTLE_MS = 10 * 60_000;

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private get ttlMs(): number {
    return this.config.SESSION_TTL_DAYS * DAY_MS;
  }

  async create(tx: Tx, userId: string, organizationId: string, meta: ReqMeta): Promise<string> {
    const token = randomToken();
    const now = this.clock.now();
    const absolute = new Date(now.getTime() + this.config.SESSION_ABSOLUTE_TTL_DAYS * DAY_MS);
    await tx.session.create({
      data: {
        userId,
        organizationId,
        tokenHash: sha256Hex(token),
        expiresAt: new Date(Math.min(now.getTime() + this.ttlMs, absolute.getTime())),
        absoluteExpiresAt: absolute,
        ip: meta.ip,
        userAgent: meta.userAgent,
        createdAt: now,
        lastSeenAt: now,
      },
    });
    return token;
  }

  setCookie(res: Response, token: string): void {
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: this.config.COOKIE_SECURE,
      sameSite: 'lax',
      path: '/',
      maxAge: this.ttlMs,
    });
  }

  clearCookie(res: Response): void {
    res.clearCookie(SESSION_COOKIE, { httpOnly: true, secure: this.config.COOKIE_SECURE, sameSite: 'lax', path: '/' });
  }

  tokenFrom(req: Request): string | null {
    const cookies = req.cookies as Record<string, string | undefined> | undefined;
    const token = cookies?.[SESSION_COOKIE];
    return token && token.length >= 20 && token.length <= 100 ? token : null;
  }

  /** Validates the session cookie; slides expiry (SEC-003). */
  async authenticate(req: Request, res: Response): Promise<Actor | null> {
    const token = this.tokenFrom(req);
    if (!token) return null;
    const session = await this.prisma.system.session.findUnique({
      where: { tokenHash: sha256Hex(token) },
      include: { user: { select: { fullName: true, membership: true } } },
    });
    const now = this.clock.now();
    if (!session || session.revokedAt || session.expiresAt <= now || session.absoluteExpiresAt <= now) return null;
    const membership = session.user.membership;
    if (!membership || membership.status !== 'ACTIVE' || membership.organizationId !== session.organizationId) {
      return null;
    }
    if (session.expiresAt.getTime() - now.getTime() < this.ttlMs - RENEW_THROTTLE_MS) {
      const expiresAt = new Date(Math.min(now.getTime() + this.ttlMs, session.absoluteExpiresAt.getTime()));
      await this.prisma.system.session.update({ where: { id: session.id }, data: { expiresAt, lastSeenAt: now } });
      this.setCookie(res, token);
    }
    return {
      userId: session.userId,
      orgId: session.organizationId,
      role: membership.role,
      sessionId: session.id,
      fullName: session.user.fullName,
    };
  }

  async revoke(sessionId: string): Promise<void> {
    await this.prisma.system.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: this.clock.now() },
    });
  }

  async revokeAllForUser(userId: string, tx?: Tx, exceptSessionId?: string): Promise<void> {
    const client = tx ?? this.prisma.system;
    await client.session.updateMany({
      where: { userId, revokedAt: null, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
      data: { revokedAt: this.clock.now() },
    });
  }

  /** Daily cleanup of expired/revoked sessions (SPEC §16), 03:00 Asia/Tashkent. */
  @Cron('0 3 * * *', { timeZone: 'Asia/Tashkent', name: 'sessions.cleanup' })
  async cleanup(): Promise<number> {
    const threshold = new Date(this.clock.now().getTime() - 7 * DAY_MS);
    const { count } = await this.prisma.system.session.deleteMany({
      where: { OR: [{ absoluteExpiresAt: { lt: threshold } }, { revokedAt: { lt: threshold } }] },
    });
    this.logger.log({ job: 'sessions.cleanup', deleted: count });
    return count;
  }
}
