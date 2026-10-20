import { Module } from '@nestjs/common';
import { IntakeController } from './intake.controller.js';
import { LeadsController } from './leads.controller.js';
import { LeadsExportService } from './leads-export.service.js';
import { LeadsImportService } from './leads-import.service.js';
import { LeadsService } from './leads.service.js';

@Module({
  controllers: [LeadsController, IntakeController],
  providers: [LeadsService, LeadsImportService, LeadsExportService],
  exports: [LeadsService],
})
export class LeadsModule {}
