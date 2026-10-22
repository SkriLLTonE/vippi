import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { APP_CONFIG, type AppConfig } from '../../../config/env.js';
import { Clock } from '../../../common/clock.js';
import { PrismaService } from '../../../common/prisma/prisma.service.js';
import { EmailSender } from './email-sender.js';
import { renderEmail, renderPush, type DeliverableNotification } from './messages.js';
import { PushSender } from './push-sender.js';

const LOCK_KEY = 7_242_002;
const BATCH_SIZE = 100;
/** A notification that waited longer (e.g. the free instance slept) is no longer worth a push/email. */
const MAX_AGE_MS = 6 * 3600_000;

/** SMTP/push error messages may echo recipient addresses, so only codes are logged. */
function errorSummary(reason: unknown): Record<string, unknown> {
  if (typeof reason !== 'object' || reason === null) return { err: 'unknown' };
  const e = reason as { name?: unknown; code?: unknown; responseCode?: unknown; statusCode?: unknown };
  return { err: e.name, code: e.code, responseCode: e.responseCode, statusCode: e.statusCode };
}

export interface DispatchResult {
  locked: boolean;
  claimed: number;
  push: number;
  email: number;
  failed: number;
}

/**
 * ADR-023: outbox for Web Push and email. In-app notifications are written inside business transactions;
 * this job claims undispatched rows (dispatchedAt := now) under an advisory lock and delivers them
 * after commit. At-most-once: a failed send is logged, not retried — the in-app copy stays the source of truth.
 */
@Injectable()
export class NotificationDispatcherService {
  private readonly logger = new Logger(NotificationDispatcherService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly pushSender: PushSender,
    private readonly emailSender: EmailSender,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Cron('*/15 * * * * *', { name: 'notification-dispatch' })
  async tick(): Promise<void> {
    if (!this.config.NOTIFY_DISPATCH_ENABLED || this.running) return;
    this.running = true;
    try {
      const r = await this.runOnce();
      if (r.claimed > 0) this.logger.log({ msg: 'notification dispatch', ...r });
    } catch (e) {
      this.logger.error({
        msg: 'notification dispatch failed',
        err: e instanceof Error ? e.message : String(e),
      });
    } finally {
      this.running = false;
    }
  }

  async runOnce(now: Date = this.clock.now()): Promise<DispatchResult> {
    const result: DispatchResult = { locked: true, claimed: 0, push: 0, email: 0, failed: 0 };
    const claimed = await this.prisma.system.$transaction(async (tx) => {
      const [lock] = await tx.$queryRaw<
        Array<{ locked: boolean }>
      >`SELECT pg_try_advisory_xact_lock(${LOCK_KEY}::bigint) AS locked`;
      if (!lock?.locked) return null;
      const rows = await tx.notification.findMany({
        where: { dispatchedAt: null },
        orderBy: { createdAt: 'asc' },
        take: BATCH_SIZE,
        select: {
          id: true,
          organizationId: true,
          userId: true,
          type: true,
          leadId: true,
          payload: true,
          createdAt: true,
        },
      });
      if (rows.length > 0) {
        await tx.notification.updateMany({
          where: { id: { in: rows.map((r) => r.id) } },
          data: { dispatchedAt: now },
        });
      }
      return rows;
    });
    if (claimed === null) return { ...result, locked: false };
    result.claimed = claimed.length;

    const { push: pushOn, email: emailOn } = this.config.notifyChannels;
    const fresh = claimed.filter((n) => now.getTime() - n.createdAt.getTime() <= MAX_AGE_MS);
    if (fresh.length === 0 || (!pushOn && !emailOn)) return result;

    const userIds = [...new Set(fresh.map((n) => n.userId))];
    const [users, subscriptions] = await Promise.all([
      this.prisma.system.user.findMany({
        where: { id: { in: userIds } },
        select: {
          id: true,
          email: true,
          locale: true,
          emailNotificationsEnabled: true,
          membership: {
            select: { organizationId: true, status: true, organization: { select: { isDemo: true } } },
          },
        },
      }),
      pushOn
        ? this.prisma.system.pushSubscription.findMany({ where: { userId: { in: userIds } } })
        : Promise.resolve([]),
    ]);
    const userById = new Map(users.map((u) => [u.id, u]));
    const goneEndpoints = new Set<string>();

    for (const n of fresh) {
      const user = userById.get(n.userId);
      const m = user?.membership;
      if (!user || !m || m.status !== 'ACTIVE' || m.organizationId !== n.organizationId) continue;
      const item: DeliverableNotification = {
        id: n.id,
        type: n.type,
        leadId: n.leadId,
        payload: n.payload as DeliverableNotification['payload'],
      };
      const tasks: Array<Promise<void>> = [];

      if (pushOn) {
        const message = renderPush(item, user.locale, this.config.publicOrigin);
        for (const s of subscriptions) {
          if (s.userId !== user.id || s.organizationId !== n.organizationId || goneEndpoints.has(s.endpoint))
            continue;
          tasks.push(
            this.pushSender.send(s, message, n.type === 'SLA_BREACHED').then((r) => {
              if (r === 'sent') result.push++;
              else if (r === 'gone') goneEndpoints.add(s.endpoint);
              else result.failed++;
            }),
          );
        }
      }

      // Demo organizations use synthetic, undeliverable addresses.
      if (emailOn && user.emailNotificationsEnabled && !m.organization.isDemo) {
        tasks.push(
          this.emailSender
            .send(user.email, renderEmail(item, user.locale, this.config.publicOrigin))
            .then(() => {
              result.email++;
            }),
        );
      }

      for (const r of await Promise.allSettled(tasks)) {
        if (r.status === 'rejected') {
          result.failed++;
          this.logger.warn({
            msg: 'notification delivery failed',
            notificationId: n.id,
            ...errorSummary(r.reason),
          });
        }
      }
    }

    if (goneEndpoints.size > 0) {
      await this.prisma.system.pushSubscription.deleteMany({
        where: { endpoint: { in: [...goneEndpoints] } },
      });
    }
    return result;
  }
}
