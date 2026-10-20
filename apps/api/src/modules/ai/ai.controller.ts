import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  AnalysisRequestSchema,
  ApplyFieldsSchema,
  DraftSentSchema,
  ReplyDraftRequestSchema,
  type AnalysisRequest,
  type ApplyFieldsRequest,
  type DraftSentRequest,
  type ReplyDraftRequest,
} from '@vippi/shared';
import type { Actor } from '../../common/actor.js';
import { CurrentActor, RequireFeature, RequirePermission } from '../../common/decorators.js';
import { UuidParam } from '../../common/params.js';
import { ApiZodBody, ZodPipe } from '../../common/zod.js';
import { AiService } from './ai.service.js';

@ApiTags('ai')
@Controller()
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Get('leads/:id/ai')
  @RequirePermission('ai.use')
  state(@CurrentActor() actor: Actor, @Param('id', UuidParam) id: string) {
    return this.ai.leadState(actor, id);
  }

  @Post('leads/:id/ai/analysis')
  @HttpCode(200)
  @RequirePermission('ai.use')
  @ApiZodBody(AnalysisRequestSchema)
  analysis(
    @CurrentActor() actor: Actor,
    @Param('id', UuidParam) id: string,
    @Body(new ZodPipe(AnalysisRequestSchema)) body: AnalysisRequest,
  ) {
    return this.ai.analyze(actor, id, body.force ?? false);
  }

  @Post('leads/:id/ai/reply-draft')
  @HttpCode(200)
  @RequirePermission('ai.use')
  @ApiZodBody(ReplyDraftRequestSchema)
  replyDraft(
    @CurrentActor() actor: Actor,
    @Param('id', UuidParam) id: string,
    @Body(new ZodPipe(ReplyDraftRequestSchema)) body: ReplyDraftRequest,
  ) {
    return this.ai.replyDraft(actor, id, body);
  }

  @Post('leads/:id/ai/apply-fields')
  @HttpCode(200)
  @RequirePermission('ai.use')
  @ApiZodBody(ApplyFieldsSchema)
  applyFields(
    @CurrentActor() actor: Actor,
    @Param('id', UuidParam) id: string,
    @Body(new ZodPipe(ApplyFieldsSchema)) body: ApplyFieldsRequest,
  ) {
    return this.ai.applyFields(actor, id, body);
  }

  @Post('leads/:id/ai/draft-sent')
  @HttpCode(200)
  @RequirePermission('ai.use')
  @ApiZodBody(DraftSentSchema)
  draftSent(
    @CurrentActor() actor: Actor,
    @Param('id', UuidParam) id: string,
    @Body(new ZodPipe(DraftSentSchema)) body: DraftSentRequest,
  ) {
    return this.ai.draftSent(actor, id, body);
  }

  @Post('analytics/weekly-summary')
  @HttpCode(200)
  @RequirePermission('dashboard.read')
  @RequireFeature('WEEKLY_SUMMARY')
  weeklySummary(@CurrentActor() actor: Actor) {
    return this.ai.weeklySummary(actor);
  }

  @Get('ai/status')
  @RequirePermission('ai.statusRead')
  status(@CurrentActor() actor: Actor) {
    return this.ai.status(actor);
  }
}
