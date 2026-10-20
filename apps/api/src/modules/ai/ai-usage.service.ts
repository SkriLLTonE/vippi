import { Inject, Injectable } from '@nestjs/common';
import { startOfZonedDay, zonedDateString } from '@vippi/shared';
import { Clock } from '../../common/clock.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { APP_CONFIG, type AppConfig } from '../../config/env.js';

export interface AiUsage {
  requestsToday: number;
  tokensToday: number;
  userLastHour: number;
}

/** AI-007: soft per-org daily and per-user hourly limits, counted from non-fallback AiInsight rows. */
@Injectable()
export class AiUsageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async usage(orgId: string, userId: string | null): Promise<AiUsage> {
    const now = this.clock.now();
    const dayStart = startOfZonedDay(zonedDateString(now));
    const [day, hour] = await Promise.all([
      this.prisma.db.aiInsight.aggregate({
        where: { organizationId: orgId, isFallback: false, createdAt: { gte: dayStart } },
        _count: { _all: true },
        _sum: { inputTokens: true, outputTokens: true },
      }),
      userId
        ? this.prisma.db.aiInsight.count({
            where: {
              organizationId: orgId,
              createdById: userId,
              isFallback: false,
              createdAt: { gte: new Date(now.getTime() - 3_600_000) },
            },
          })
        : Promise.resolve(0),
    ]);
    return {
      requestsToday: day._count._all,
      tokensToday: (day._sum.inputTokens ?? 0) + (day._sum.outputTokens ?? 0),
      userLastHour: hour,
    };
  }

  async exceeded(orgId: string, userId: string | null): Promise<boolean> {
    const u = await this.usage(orgId, userId);
    return (
      u.requestsToday >= this.config.AI_DAILY_REQUEST_LIMIT_PER_ORG ||
      u.tokensToday >= this.config.AI_DAILY_TOKEN_LIMIT_PER_ORG ||
      u.userLastHour >= this.config.AI_USER_HOURLY_LIMIT
    );
  }
}
