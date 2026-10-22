import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DashboardQuerySchema, MyStatsQuerySchema, type DashboardQuery, type MyStatsQuery } from '@vippi/shared';
import type { Actor } from '../../common/actor.js';
import { CurrentActor, RequirePermission } from '../../common/decorators.js';
import { ApiZodQuery, ZodPipe } from '../../common/zod.js';
import { AnalyticsService } from './analytics.service.js';

@ApiTags('analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('dashboard')
  @RequirePermission('dashboard.read')
  @ApiZodQuery(DashboardQuerySchema)
  dashboard(@CurrentActor() actor: Actor, @Query(new ZodPipe(DashboardQuerySchema)) q: DashboardQuery) {
    return this.analytics.dashboard(actor, q);
  }

  @Get('me')
  @RequirePermission('stats.self.read')
  @ApiZodQuery(MyStatsQuerySchema)
  me(@CurrentActor() actor: Actor, @Query(new ZodPipe(MyStatsQuerySchema)) q: MyStatsQuery) {
    return this.analytics.myStats(actor, q);
  }
}
