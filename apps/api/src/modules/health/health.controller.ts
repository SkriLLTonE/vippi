import { Controller, Get, HttpCode } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AppException } from '../../common/app-exception.js';
import { Public } from '../../common/decorators.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { SlaSchedulerService } from '../sla/sla-scheduler.service.js';

@ApiTags('health')
@Controller('api/health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduler: SlaSchedulerService,
  ) {}

  @Get()
  @Public()
  live() {
    return { status: 'ok', lastSlaRunAt: this.scheduler.lastRunAt?.toISOString() ?? null };
  }

  @Get('ready')
  @Public()
  @HttpCode(200)
  async ready() {
    if (!(await this.prisma.ping())) {
      throw new AppException(503, 'SERVICE_UNAVAILABLE', 'Database is not available');
    }
    return { status: 'ready' };
  }
}
