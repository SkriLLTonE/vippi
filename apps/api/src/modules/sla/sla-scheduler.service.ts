import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import { Clock } from '../../common/clock.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { ProductEvents } from '../../common/product-events.js';
import { LeadsService, type BreachedLead } from '../leads/leads.service.js';
import { NotificationsService, type NewNotification } from '../notifications/notifications.service.js';

const LOCK_KEY = 7_242_001;
const MAX_BATCHES_PER_RUN = 20;

export interface SlaRunResult {
  locked: boolean;
  breached: number;
  notifications: number;
}

/**
 * FR-033: every minute marks overdue leads and notifies recipients.
 * Idempotent: transaction-level advisory lock (safe with pooled connections), SKIP LOCKED batches,
 * and unique notification dedupe keys.
 */
@Injectable()
export class SlaSchedulerService {
  private readonly logger = new Logger(SlaSchedulerService.name);
  private running = false;
  lastRunAt: Date | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly leads: LeadsService,
    private readonly notifications: NotificationsService,
    private readonly events: ProductEvents,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE, { name: 'sla-scan' })
  async tick(): Promise<void> {
    if (!this.config.SLA_CRON_ENABLED || this.running) return;
    this.running = true;
    try {
      const r = await this.runOnce();
      this.lastRunAt = this.clock.now();
      if (r.breached > 0) this.logger.log({ msg: 'sla scan', ...r });
    } catch (e) {
      this.logger.error({ msg: 'sla scan failed', err: e instanceof Error ? e.message : String(e) });
    } finally {
      this.running = false;
    }
  }

  async runOnce(now: Date = this.clock.now()): Promise<SlaRunResult> {
    return this.prisma.system.$transaction(
      async (tx) => {
        const [lock] = await tx.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_try_advisory_xact_lock(${LOCK_KEY}::bigint) AS locked`;
        if (!lock?.locked) return { locked: false, breached: 0, notifications: 0 };

        const breached: BreachedLead[] = [];
        for (let i = 0; i < MAX_BATCHES_PER_RUN; i++) {
          const batch = await this.leads.markOverdueBatch(tx, now, this.config.SLA_SCAN_BATCH_SIZE);
          breached.push(...batch);
          if (batch.length < this.config.SLA_SCAN_BATCH_SIZE) break;
        }
        if (breached.length === 0) return { locked: true, breached: 0, notifications: 0 };

        const orgIds = [...new Set(breached.map((b) => b.organizationId))];
        const members = await tx.membership.findMany({
          where: { organizationId: { in: orgIds }, status: 'ACTIVE' },
          select: { organizationId: true, userId: true, role: true },
        });
        const items: NewNotification[] = [];
        for (const lead of breached) {
          const orgMembers = members.filter((m) => m.organizationId === lead.organizationId);
          const recipients = new Set<string>();
          if (lead.assigneeId && orgMembers.some((m) => m.userId === lead.assigneeId)) recipients.add(lead.assigneeId);
          const heads = orgMembers.filter((m) => m.role === 'HEAD_OF_SALES');
          const supervisors = heads.length > 0 ? heads : orgMembers.filter((m) => m.role === 'OWNER');
          for (const s of supervisors) recipients.add(s.userId);
          const overdueMinutes = Math.max(0, Math.floor((now.getTime() - lead.firstResponseDueAt.getTime()) / 60_000));
          for (const userId of recipients) {
            items.push({
              organizationId: lead.organizationId,
              userId,
              type: 'SLA_BREACHED',
              leadId: lead.id,
              payload: { leadNumber: lead.number, overdueMinutes },
              dedupeKey: `SLA_BREACHED:${lead.id}:${userId}`,
            });
          }
          this.events.emit('sla_breached', { organizationId: lead.organizationId }, { assigned: lead.assigneeId !== null });
        }
        const created = await this.notifications.createMany(items, tx);
        return { locked: true, breached: breached.length, notifications: created };
      },
      { timeout: 55_000, maxWait: 5_000 },
    );
  }
}
