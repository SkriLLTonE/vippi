import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, loadConfig } from '../config/env.js';
import { Clock } from './clock.js';
import { PrismaService } from './prisma/prisma.service.js';
import { ProductEvents } from './product-events.js';
import { RateLimiter } from './rate-limiter.js';

@Global()
@Module({
  providers: [
    { provide: APP_CONFIG, useFactory: () => loadConfig() },
    PrismaService,
    Clock,
    ProductEvents,
    RateLimiter,
  ],
  exports: [APP_CONFIG, PrismaService, Clock, ProductEvents, RateLimiter],
})
export class CoreModule {}
