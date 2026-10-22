import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  NotificationListQuerySchema,
  PushSubscriptionSchema,
  PushUnsubscribeSchema,
  UpdateNotificationSettingsSchema,
  type NotificationListQuery,
  type NotificationSettingsDto,
  type NotificationTestResultDto,
  type PushSubscriptionRequest,
  type PushUnsubscribeRequest,
  type UpdateNotificationSettingsRequest,
} from '@vippi/shared';
import type { Actor } from '../../common/actor.js';
import { Authenticated, CurrentActor } from '../../common/decorators.js';
import { RequestMeta, type ReqMeta } from '../../common/req-meta.js';
import { ApiZodBody, ApiZodQuery, ZodPipe } from '../../common/zod.js';
import { UuidParam } from '../../common/params.js';
import { NotificationSettingsService } from './notification-settings.service.js';
import { NotificationsService } from './notifications.service.js';

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly settings: NotificationSettingsService,
  ) {}

  @Get()
  @Authenticated()
  @ApiZodQuery(NotificationListQuerySchema)
  list(
    @CurrentActor() actor: Actor,
    @Query(new ZodPipe(NotificationListQuerySchema)) q: NotificationListQuery,
  ) {
    return this.notifications.list(actor, q);
  }

  @Get('unread-count')
  @Authenticated()
  unreadCount(@CurrentActor() actor: Actor) {
    return this.notifications.unreadCount(actor);
  }

  @Post('read-all')
  @Authenticated()
  @HttpCode(200)
  readAll(@CurrentActor() actor: Actor) {
    return this.notifications.markAllRead(actor);
  }

  @Get('settings')
  @Authenticated()
  getSettings(@CurrentActor() actor: Actor): Promise<NotificationSettingsDto> {
    return this.settings.get(actor);
  }

  @Patch('settings')
  @Authenticated()
  @ApiZodBody(UpdateNotificationSettingsSchema)
  updateSettings(
    @CurrentActor() actor: Actor,
    @Body(new ZodPipe(UpdateNotificationSettingsSchema)) body: UpdateNotificationSettingsRequest,
  ): Promise<NotificationSettingsDto> {
    return this.settings.update(actor, body);
  }

  @Post('test')
  @Authenticated()
  @HttpCode(200)
  sendTest(@CurrentActor() actor: Actor): Promise<NotificationTestResultDto> {
    return this.settings.sendTest(actor);
  }

  @Post('push-subscriptions')
  @Authenticated()
  @HttpCode(204)
  @ApiZodBody(PushSubscriptionSchema)
  async subscribe(
    @CurrentActor() actor: Actor,
    @Body(new ZodPipe(PushSubscriptionSchema)) body: PushSubscriptionRequest,
    @RequestMeta() meta: ReqMeta,
  ): Promise<void> {
    await this.settings.subscribe(actor, body, meta);
  }

  @Post('push-subscriptions/remove')
  @Authenticated()
  @HttpCode(204)
  @ApiZodBody(PushUnsubscribeSchema)
  async unsubscribe(
    @CurrentActor() actor: Actor,
    @Body(new ZodPipe(PushUnsubscribeSchema)) body: PushUnsubscribeRequest,
  ): Promise<void> {
    await this.settings.unsubscribe(actor, body);
  }

  @Post(':id/read')
  @Authenticated()
  @HttpCode(204)
  async read(@CurrentActor() actor: Actor, @Param('id', UuidParam) id: string): Promise<void> {
    await this.notifications.markRead(actor, id);
  }
}
