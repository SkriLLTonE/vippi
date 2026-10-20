import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SlaPolicySchema, type SlaPolicyRequest } from '@vippi/shared';
import type { Actor } from '../../common/actor.js';
import { CurrentActor, RequirePermission } from '../../common/decorators.js';
import { RequestMeta, type ReqMeta } from '../../common/req-meta.js';
import { ApiZodBody, ZodPipe } from '../../common/zod.js';
import { SlaPolicyService } from './sla-policy.service.js';

@ApiTags('sla')
@Controller('sla-policy')
export class SlaController {
  constructor(private readonly policies: SlaPolicyService) {}

  @Get()
  @RequirePermission('sla.manage')
  get(@CurrentActor() actor: Actor) {
    return this.policies.get(actor.orgId);
  }

  @Put()
  @RequirePermission('sla.manage')
  @ApiZodBody(SlaPolicySchema)
  update(
    @CurrentActor() actor: Actor,
    @Body(new ZodPipe(SlaPolicySchema)) body: SlaPolicyRequest,
    @RequestMeta() meta: ReqMeta,
  ) {
    return this.policies.update(actor, body, meta);
  }
}
