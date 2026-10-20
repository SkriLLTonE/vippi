import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { NotificationDto, NotificationListQuery, NotificationType } from '@vippi/shared';
import type { Actor } from '../../common/actor.js';
import { notFound } from '../../common/app-exception.js';
import { Clock } from '../../common/clock.js';
import { PrismaService, type Tx } from '../../common/prisma/prisma.service.js';
import { ProductEvents } from '../../common/product-events.js';

export interface NewNotification {
  organizationId: string;
  userId: string;
  type: NotificationType;
  leadId: string;
  payload: { leadNumber: number; overdueMinutes?: number; assignedByName?: string };
  dedupeKey: string;
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly events: ProductEvents,
  ) {}

  /** Idempotent: ON CONFLICT (dedupeKey) DO NOTHING (FR-033, AC-032). */
  async createMany(items: NewNotification[], tx?: Tx): Promise<number> {
    if (items.length === 0) return 0;
    const client = tx ?? this.prisma.db;
    const { count } = await client.notification.createMany({
      data: items.map((n) => ({ ...n, payload: n.payload as Prisma.InputJsonValue })),
      skipDuplicates: true,
    });
    return count;
  }

  async list(actor: Actor, q: NotificationListQuery): Promise<{ items: NotificationDto[] }> {
    const rows = await this.prisma.db.notification.findMany({
      where: { organizationId: actor.orgId, userId: actor.userId, ...(q.unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: 'desc' },
      take: q.limit,
    });
    return {
      items: rows.map((n) => ({
        id: n.id,
        type: n.type,
        leadId: n.leadId,
        payload: n.payload as NotificationDto['payload'],
        readAt: n.readAt?.toISOString() ?? null,
        createdAt: n.createdAt.toISOString(),
      })),
    };
  }

  async unreadCount(actor: Actor): Promise<{ count: number }> {
    const count = await this.prisma.db.notification.count({
      where: { organizationId: actor.orgId, userId: actor.userId, readAt: null },
    });
    return { count };
  }

  async markRead(actor: Actor, id: string): Promise<void> {
    const n = await this.prisma.db.notification.findFirst({
      where: { id, organizationId: actor.orgId, userId: actor.userId },
    });
    if (!n) throw notFound();
    if (n.readAt) return;
    const now = this.clock.now();
    await this.prisma.db.notification.update({ where: { id: n.id, organizationId: actor.orgId }, data: { readAt: now } });
    this.events.emit(
      'notification_opened',
      { organizationId: actor.orgId, userId: actor.userId },
      { type: n.type, ageSeconds: Math.round((now.getTime() - n.createdAt.getTime()) / 1000) },
    );
  }

  async markAllRead(actor: Actor): Promise<{ updated: number }> {
    const { count } = await this.prisma.db.notification.updateMany({
      where: { organizationId: actor.orgId, userId: actor.userId, readAt: null },
      data: { readAt: this.clock.now() },
    });
    return { updated: count };
  }
}
