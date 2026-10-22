import { Global, Module } from '@nestjs/common';
import { EmailSender, SmtpEmailSender } from './delivery/email-sender.js';
import { NotificationDispatcherService } from './delivery/notification-dispatcher.service.js';
import { PushSender, WebPushSender } from './delivery/push-sender.js';
import { NotificationSettingsService } from './notification-settings.service.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationSettingsService,
    NotificationDispatcherService,
    { provide: PushSender, useClass: WebPushSender },
    { provide: EmailSender, useClass: SmtpEmailSender },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
