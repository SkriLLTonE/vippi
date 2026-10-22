import { z } from 'zod';
import type { NotificationType } from '../enums.js';
import { booleanQuery } from './common.js';

export const NotificationListQuerySchema = z
  .object({
    unreadOnly: booleanQuery.optional(),
    limit: z.coerce.number().int().min(1).max(50).default(50),
  })
  .strict();
export type NotificationListQuery = z.infer<typeof NotificationListQuerySchema>;

export interface NotificationDto {
  id: string;
  type: NotificationType;
  leadId: string | null;
  payload: { leadNumber?: number; overdueMinutes?: number; assignedByName?: string };
  readAt: string | null;
  createdAt: string;
}

/**
 * The server POSTs to the subscription endpoint, so only browser push services are accepted
 * (no requests to arbitrary or internal hosts).
 */
const PUSH_SERVICE_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^[a-z0-9-]+\.notify\.windows\.com$/,
  /^web\.push\.apple\.com$/,
];

/** https only, no userinfo or explicit port: host is everything up to the first `/`. */
const ENDPOINT_RE = /^https:\/\/([a-z0-9.-]+)\/[^\s]*$/i;

export function isAllowedPushEndpoint(endpoint: string): boolean {
  const host = ENDPOINT_RE.exec(endpoint)?.[1]?.toLowerCase();
  return !!host && PUSH_SERVICE_HOSTS.some((re) => re.test(host));
}

const pushEndpointSchema = z
  .string()
  .max(1000)
  .refine(isAllowedPushEndpoint, { message: 'push_endpoint_not_allowed' });

const base64UrlKey = (max: number) =>
  z
    .string()
    .min(8)
    .max(max)
    .regex(/^[A-Za-z0-9_-]+={0,2}$/);

export const PushSubscriptionSchema = z
  .object({
    endpoint: pushEndpointSchema,
    keys: z.object({ p256dh: base64UrlKey(200), auth: base64UrlKey(100) }).strict(),
  })
  .strict();
export type PushSubscriptionRequest = z.infer<typeof PushSubscriptionSchema>;

export const PushUnsubscribeSchema = z.object({ endpoint: z.string().min(1).max(1000) }).strict();
export type PushUnsubscribeRequest = z.infer<typeof PushUnsubscribeSchema>;

export const UpdateNotificationSettingsSchema = z.object({ emailEnabled: z.boolean() }).strict();
export type UpdateNotificationSettingsRequest = z.infer<typeof UpdateNotificationSettingsSchema>;

export interface NotificationSettingsDto {
  /** Whether the server has a channel configured at all (VAPID keys / SMTP). */
  channels: { push: boolean; email: boolean };
  /** VAPID application server key for PushManager.subscribe; null when push is not configured. */
  vapidPublicKey: string | null;
  emailEnabled: boolean;
  email: string;
  pushSubscriptions: number;
}

export interface NotificationTestResultDto {
  /** Devices the push service accepted the test message for. */
  push: number;
  email: boolean;
}
