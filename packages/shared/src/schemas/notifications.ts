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
