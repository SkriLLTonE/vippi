import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  MAX_LEAD_FIELDS,
  parseLeadFieldDefs,
  type LeadFieldDef,
  type UpdateLeadFieldRequest,
} from '@vippi/shared';
import type { Actor } from '../../common/actor.js';
import { AppException, notFound } from '../../common/app-exception.js';
import { PrismaService, type Tx } from '../../common/prisma/prisma.service.js';
import type { ReqMeta } from '../../common/req-meta.js';
import { AuditService } from '../audit/audit.service.js';

/**
 * ADR-024: custom lead field definitions stored as JSON on the organization.
 * Removing a definition keeps stored lead values (they are only hidden).
 */
@Injectable()
export class LeadFieldsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(orgId: string): Promise<LeadFieldDef[]> {
    const org = await this.prisma.db.organization.findUniqueOrThrow({ where: { id: orgId }, select: { leadFieldDefs: true } });
    return parseLeadFieldDefs(org.leadFieldDefs);
  }

  create(actor: Actor, input: LeadFieldDef, meta: ReqMeta): Promise<LeadFieldDef[]> {
    return this.mutate(actor, meta, { op: 'created', key: input.key }, (defs) => {
      if (defs.some((d) => d.key.toLowerCase() === input.key.toLowerCase())) {
        throw new AppException(409, 'CONFLICT', 'Field key already exists', [
          { path: 'key', code: 'key_taken', message: 'Field key already exists' },
        ]);
      }
      if (defs.length >= MAX_LEAD_FIELDS) {
        throw new AppException(422, 'LEAD_FIELDS_LIMIT', `At most ${MAX_LEAD_FIELDS} custom fields per organization`);
      }
      return [...defs, input];
    });
  }

  update(actor: Actor, key: string, input: UpdateLeadFieldRequest, meta: ReqMeta): Promise<LeadFieldDef[]> {
    return this.mutate(actor, meta, { op: 'updated', key }, (defs) => {
      const current = defs.find((d) => d.key === key);
      if (!current) throw notFound();
      if (input.options && current.type !== 'single_select') {
        throw new AppException(400, 'VALIDATION_FAILED', 'Options are allowed only for single_select', [
          { path: 'options', code: 'options_not_allowed', message: 'Options are allowed only for single_select' },
        ]);
      }
      const next: LeadFieldDef = {
        ...current,
        ...(input.label !== undefined ? { label: input.label } : {}),
        ...(input.required !== undefined ? { required: input.required } : {}),
        ...(input.showInCreate !== undefined ? { showInCreate: input.showInCreate } : {}),
        ...(input.options !== undefined ? { options: input.options } : {}),
      };
      return defs.map((d) => (d.key === key ? next : d));
    });
  }

  remove(actor: Actor, key: string, meta: ReqMeta): Promise<LeadFieldDef[]> {
    return this.mutate(actor, meta, { op: 'deleted', key }, (defs) => {
      if (!defs.some((d) => d.key === key)) throw notFound();
      return defs.filter((d) => d.key !== key);
    });
  }

  /** Row lock on the organization serializes concurrent edits of the JSON list (no lost updates). */
  private mutate(
    actor: Actor,
    meta: ReqMeta,
    change: { op: 'created' | 'updated' | 'deleted'; key: string },
    apply: (defs: LeadFieldDef[]) => LeadFieldDef[],
  ): Promise<LeadFieldDef[]> {
    return this.prisma.db.$transaction(async (tx: Tx) => {
      const rows = await tx.$queryRaw<Array<{ leadFieldDefs: unknown }>>`
        SELECT "leadFieldDefs" FROM "Organization" WHERE "id" = ${actor.orgId}::uuid FOR UPDATE`;
      const next = apply(parseLeadFieldDefs(rows[0]?.leadFieldDefs));
      await tx.organization.update({
        where: { id: actor.orgId },
        data: { leadFieldDefs: next as unknown as Prisma.InputJsonValue },
      });
      await this.audit.append(
        {
          organizationId: actor.orgId,
          action: 'LEAD_FIELDS_UPDATED',
          actorUserId: actor.userId,
          entityType: 'Organization',
          entityId: actor.orgId,
          metadata: change,
          meta,
        },
        tx,
      );
      return next;
    });
  }
}
