import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';
import { AllExceptionsFilter } from './common/all-exceptions.filter.js';
import { CoreModule } from './common/core.module.js';
import { FeatureGuard, OriginGuard, PermissionsGuard, SessionGuard } from './common/guards.js';
import { loggerParams } from './common/logger.js';
import { APP_CONFIG, type AppConfig } from './config/env.js';
import { AiModule } from './modules/ai/ai.module.js';
import { AnalyticsModule } from './modules/analytics/analytics.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { HealthController } from './modules/health/health.controller.js';
import { IdentityAccessModule } from './modules/identity-access/identity-access.module.js';
import { LeadsModule } from './modules/leads/leads.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { OrganizationsModule } from './modules/organizations/organizations.module.js';
import { SlaModule } from './modules/sla/sla.module.js';

@Module({
  imports: [
    CoreModule,
    LoggerModule.forRootAsync({ inject: [APP_CONFIG], useFactory: (config: AppConfig) => loggerParams(config) }),
    ScheduleModule.forRoot(),
    AuditModule,
    IdentityAccessModule,
    NotificationsModule,
    SlaModule,
    LeadsModule,
    OrganizationsModule,
    AnalyticsModule,
    AiModule,
  ],
  controllers: [HealthController],
  providers: [
    // Order matters: CSRF origin check → session → permission → cut-line feature flag.
    { provide: APP_GUARD, useClass: OriginGuard },
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: FeatureGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
