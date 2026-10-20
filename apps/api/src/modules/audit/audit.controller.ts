import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuditLogQuerySchema, type AuditLogQuery } from '@vippi/shared';
import type { Actor } from '../../common/actor.js';
import { CurrentActor, RequirePermission } from '../../common/decorators.js';
import { ApiZodQuery, ZodPipe } from '../../common/zod.js';
import { AuditService } from './audit.service.js';

@ApiTags('audit')
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  /** The API stays available even if the AUDIT_LOG_UI screen is cut (ADR-020: cut UI, not data). */
  @Get()
  @RequirePermission('audit.read')
  @ApiZodQuery(AuditLogQuerySchema)
  list(@CurrentActor() actor: Actor, @Query(new ZodPipe(AuditLogQuerySchema)) q: AuditLogQuery) {
    return this.audit.list(actor.orgId, q);
  }
}
