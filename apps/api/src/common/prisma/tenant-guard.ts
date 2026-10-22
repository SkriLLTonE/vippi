import { PrismaClient } from '@prisma/client';

export const TENANT_MODELS = new Set([
  'Membership',
  'Invitation',
  'ApiKey',
  'Lead',
  'LeadActivity',
  'SlaPolicy',
  'Notification',
  'PushSubscription',
  'AiInsight',
  'AuditLog',
]);

const FILTERED_OPERATIONS = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'findUnique',
  'findUniqueOrThrow',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'delete',
  'deleteMany',
  'count',
  'aggregate',
  'groupBy',
  'upsert',
]);

const CREATE_OPERATIONS = new Set(['create', 'createMany', 'createManyAndReturn']);

export class TenantGuardError extends Error {
  constructor(model: string, operation: string) {
    super(`Tenant guard: ${model}.${operation} must be scoped by organizationId`);
    this.name = 'TenantGuardError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function whereHasOrganization(where: unknown): boolean {
  if (!isRecord(where)) return false;
  if (where.organizationId !== undefined && where.organizationId !== null) return true;
  if (isRecord(where.organization)) return true;
  const and = where.AND;
  if (Array.isArray(and)) return and.some(whereHasOrganization);
  if (isRecord(and)) return whereHasOrganization(and);
  return false;
}

function dataHasOrganization(data: unknown): boolean {
  if (Array.isArray(data)) return data.length > 0 && data.every(dataHasOrganization);
  if (!isRecord(data)) return false;
  return (typeof data.organizationId === 'string' && data.organizationId.length > 0) || isRecord(data.organization);
}

export function assertTenantScoped(model: string, operation: string, args: unknown): void {
  if (!TENANT_MODELS.has(model)) return;
  const a = isRecord(args) ? args : {};
  if (FILTERED_OPERATIONS.has(operation) && !whereHasOrganization(a.where)) {
    throw new TenantGuardError(model, operation);
  }
  if (CREATE_OPERATIONS.has(operation) && !dataHasOrganization(a.data)) {
    throw new TenantGuardError(model, operation);
  }
}

/**
 * Second line of tenant isolation (SPEC §11.3): every query to a tenant model must be
 * filtered by organizationId. System access (scheduler, seed, pre-auth lookups) uses the raw client.
 */
export function withTenantGuard(client: PrismaClient): PrismaClient {
  const extended = client.$extends({
    name: 'tenant-guard',
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          assertTenantScoped(model, operation, args);
          return query(args);
        },
      },
    },
  });
  // A query-only extension does not change the public surface of the client,
  // so it is safe to expose it with the base PrismaClient type.
  return extended as unknown as PrismaClient;
}
