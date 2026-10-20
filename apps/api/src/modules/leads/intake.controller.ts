import { Body, Controller, Post, Res, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { IntakeLeadSchema, type IntakeLeadRequest } from '@vippi/shared';
import type { ApiKeyActor } from '../../common/actor.js';
import { ApiKeyAuth, CurrentApiKey } from '../../common/decorators.js';
import { ApiKeyGuard } from '../../common/guards.js';
import { ApiZodBody, ZodPipe } from '../../common/zod.js';
import { LeadsService } from './leads.service.js';

@ApiTags('intake')
@Controller('intake')
export class IntakeController {
  constructor(private readonly leads: LeadsService) {}

  /** FR-063: 201 for a new lead, 200 when `externalId` was already received. */
  @Post('leads')
  @ApiKeyAuth()
  @UseGuards(ApiKeyGuard)
  @ApiHeader({ name: 'X-Api-Key', required: true })
  @ApiZodBody(IntakeLeadSchema)
  async create(
    @CurrentApiKey() key: ApiKeyActor,
    @Body(new ZodPipe(IntakeLeadSchema)) body: IntakeLeadRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.leads.createFromIntake(key, body);
    res.status(result.duplicate ? 200 : 201);
    return result;
  }
}
