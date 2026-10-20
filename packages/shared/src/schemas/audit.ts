import { z } from 'zod';
import type { AuditActorType } from '../enums.js';
import { AUDIT_ACTIONS } from '../enums.js';
import { dateOnlySchema } from './common.js';

export const AuditLogQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(50),
    action: z.enum(AUDIT_ACTIONS).optional(),
    actorUserId: z.uuid().optional(),
    from: dateOnlySchema.optional(),
    to: dateOnlySchema.optional(),
  })
  .strict();
export type AuditLogQuery = z.infer<typeof AuditLogQuerySchema>;

export interface AuditLogDto {
  id: string;
  action: string;
  actorType: AuditActorType;
  actor: { id: string; fullName: string } | null;
  apiKey: { id: string; name: string } | null;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
}
