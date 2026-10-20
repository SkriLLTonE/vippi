import { Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { NotificationListQuerySchema, type NotificationListQuery } from '@vippi/shared';
import type { Actor } from '../../common/actor.js';
import { Authenticated, CurrentActor } from '../../common/decorators.js';
import { ApiZodQuery, ZodPipe } from '../../common/zod.js';
import { UuidParam } from '../../common/params.js';
import { NotificationsService } from './notifications.service.js';

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @Authenticated()
  @ApiZodQuery(NotificationListQuerySchema)
  list(@CurrentActor() actor: Actor, @Query(new ZodPipe(NotificationListQuerySchema)) q: NotificationListQuery) {
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

  @Post(':id/read')
  @Authenticated()
  @HttpCode(204)
  async read(@CurrentActor() actor: Actor, @Param('id', UuidParam) id: string): Promise<void> {
    await this.notifications.markRead(actor, id);
  }
}
