import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  NotificationSettingsDto,
  NotificationTestResultDto,
  PushSubscriptionRequest,
  PushUnsubscribeRequest,
  UpdateNotificationSettingsRequest,
} from '@vippi/shared';
import type { Actor } from '../../common/actor.js';
import { AppException, notFound, unprocessable } from '../../common/app-exception.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { RateLimiter } from '../../common/rate-limiter.js';
import type { ReqMeta } from '../../common/req-meta.js';
import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import { EmailSender } from './delivery/email-sender.js';
import { renderTest } from './delivery/messages.js';
import { PushSender } from './delivery/push-sender.js';

const MAX_SUBSCRIPTIONS_PER_USER = 10;
const TEST_LIMIT = 5;
const TEST_WINDOW_MS = 10 * 60_000;

const channelOff = () =>
  unprocessable('SERVICE_UNAVAILABLE', 'Notification channel is not configured on the server');

@Injectable()
export class NotificationSettingsService {
  private readonly logger = new Logger(NotificationSettingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly limiter: RateLimiter,
    private readonly pushSender: PushSender,
    private readonly emailSender: EmailSender,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async get(actor: Actor): Promise<NotificationSettingsDto> {
    const [user, pushSubscriptions] = await Promise.all([
      this.prisma.system.user.findUnique({
        where: { id: actor.userId },
        select: { email: true, emailNotificationsEnabled: true },
      }),
      this.prisma.db.pushSubscription.count({ where: { organizationId: actor.orgId, userId: actor.userId } }),
    ]);
    if (!user) throw notFound();
    return {
      channels: this.config.notifyChannels,
      vapidPublicKey: this.config.notifyChannels.push ? (this.config.VAPID_PUBLIC_KEY ?? null) : null,
      emailEnabled: user.emailNotificationsEnabled,
      email: user.email,
      pushSubscriptions,
    };
  }

  async update(actor: Actor, body: UpdateNotificationSettingsRequest): Promise<NotificationSettingsDto> {
    if (body.emailEnabled && !this.config.notifyChannels.email) throw channelOff();
    await this.prisma.system.user.update({
      where: { id: actor.userId },
      data: { emailNotificationsEnabled: body.emailEnabled },
    });
    return this.get(actor);
  }

  /**
   * A push endpoint belongs to one browser profile: re-subscribing it from another account moves it,
   * so a shared device never keeps delivering the previous user's notifications.
   */
  async subscribe(actor: Actor, body: PushSubscriptionRequest, meta: ReqMeta): Promise<void> {
    if (!this.config.notifyChannels.push) throw channelOff();
    await this.prisma.system.$transaction(async (tx) => {
      await tx.pushSubscription.deleteMany({ where: { endpoint: body.endpoint } });
      await tx.pushSubscription.create({
        data: {
          organizationId: actor.orgId,
          userId: actor.userId,
          endpoint: body.endpoint,
          p256dh: body.keys.p256dh,
          auth: body.keys.auth,
          userAgent: meta.userAgent?.slice(0, 256) ?? null,
        },
      });
      const stale = await tx.pushSubscription.findMany({
        where: { userId: actor.userId },
        orderBy: { createdAt: 'desc' },
        skip: MAX_SUBSCRIPTIONS_PER_USER,
        select: { id: true },
      });
      if (stale.length > 0)
        await tx.pushSubscription.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
    });
  }

  async sendTest(actor: Actor): Promise<NotificationTestResultDto> {
    const retryAfter = this.limiter.hit(`notify-test:${actor.userId}`, TEST_LIMIT, TEST_WINDOW_MS);
    if (retryAfter > 0) {
      throw new AppException(429, 'RATE_LIMITED', 'Too many test notifications', undefined, {
        'Retry-After': String(retryAfter),
      });
    }
    const user = await this.prisma.system.user.findUnique({
      where: { id: actor.userId },
      select: {
        email: true,
        locale: true,
        emailNotificationsEnabled: true,
        membership: { select: { organization: { select: { isDemo: true } } } },
      },
    });
    if (!user) throw notFound();
    const message = renderTest(user.locale, this.config.publicOrigin);
    const result: NotificationTestResultDto = { push: 0, email: false };

    if (this.config.notifyChannels.push) {
      const subs = await this.prisma.db.pushSubscription.findMany({
        where: { organizationId: actor.orgId, userId: actor.userId },
      });
      const gone: string[] = [];
      await Promise.allSettled(
        subs.map(async (s) => {
          const r = await this.pushSender.send(s, message.push, false);
          if (r === 'sent') result.push++;
          else if (r === 'gone') gone.push(s.endpoint);
        }),
      );
      if (gone.length > 0) {
        await this.prisma.db.pushSubscription.deleteMany({
          where: { organizationId: actor.orgId, endpoint: { in: gone } },
        });
      }
    }

    if (
      this.config.notifyChannels.email &&
      user.emailNotificationsEnabled &&
      !user.membership?.organization.isDemo
    ) {
      try {
        await this.emailSender.send(user.email, message.email);
        result.email = true;
      } catch (e) {
        this.logger.warn({ msg: 'test email failed', err: (e as { code?: unknown }).code ?? 'unknown' });
      }
    }
    return result;
  }

  async unsubscribe(actor: Actor, body: PushUnsubscribeRequest): Promise<void> {
    await this.prisma.db.pushSubscription.deleteMany({
      where: { organizationId: actor.orgId, userId: actor.userId, endpoint: body.endpoint },
    });
  }
}
