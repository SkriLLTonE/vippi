import { Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import { AnalyticsModule } from '../analytics/analytics.module.js';
import { LeadsModule } from '../leads/leads.module.js';
import { AiUsageService } from './ai-usage.service.js';
import { AiController } from './ai.controller.js';
import { AiService } from './ai.service.js';
import { AI_PROVIDER } from './providers/ai-provider.interface.js';
import { createAiProvider } from './providers/provider.factory.js';

@Module({
  imports: [LeadsModule, AnalyticsModule],
  controllers: [AiController],
  providers: [
    AiService,
    AiUsageService,
    { provide: AI_PROVIDER, inject: [APP_CONFIG], useFactory: (config: AppConfig) => createAiProvider(config) },
  ],
  exports: [AiService],
})
export class AiModule {}
