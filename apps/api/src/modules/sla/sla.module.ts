import { Global, Module } from '@nestjs/common';
import { LeadsModule } from '../leads/leads.module.js';
import { SlaPolicyService } from './sla-policy.service.js';
import { SlaSchedulerService } from './sla-scheduler.service.js';
import { SlaController } from './sla.controller.js';

@Global()
@Module({
  imports: [LeadsModule],
  controllers: [SlaController],
  providers: [SlaPolicyService, SlaSchedulerService],
  exports: [SlaPolicyService, SlaSchedulerService],
})
export class SlaModule {}
