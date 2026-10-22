import { Inject, Injectable } from '@nestjs/common';
import * as webpush from 'web-push';
import { APP_CONFIG, type AppConfig } from '../../../config/env.js';
import type { PushMessage } from './messages.js';

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** `gone` = the push service says the subscription no longer exists; it must be deleted. */
export type PushResult = 'sent' | 'gone' | 'failed';

export abstract class PushSender {
  abstract send(target: PushTarget, message: PushMessage, urgent: boolean): Promise<PushResult>;
}

@Injectable()
export class WebPushSender extends PushSender {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    super();
  }

  async send(target: PushTarget, message: PushMessage, urgent: boolean): Promise<PushResult> {
    const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = this.config;
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return 'failed';
    try {
      await webpush.sendNotification(
        { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
        JSON.stringify(message),
        {
          vapidDetails: {
            subject: this.config.VAPID_SUBJECT ?? this.config.publicOrigin,
            publicKey: VAPID_PUBLIC_KEY,
            privateKey: VAPID_PRIVATE_KEY,
          },
          TTL: 6 * 3600,
          urgency: urgent ? 'high' : 'normal',
          timeout: 10_000,
        },
      );
      return 'sent';
    } catch (e) {
      if (e instanceof webpush.WebPushError && (e.statusCode === 404 || e.statusCode === 410)) return 'gone';
      throw e;
    }
  }
}
