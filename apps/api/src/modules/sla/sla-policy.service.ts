import { Inject, Injectable } from '@nestjs/common';
import type { SlaPolicy } from '@prisma/client';
import type { SlaPolicyDto, SlaPolicyRequest } from '@vippi/shared';
import { APP_CONFIG, type AppConfig } from '../../config/env.js';
import type { Actor } from '../../common/actor.js';
import { PrismaService, type Tx } from '../../common/prisma/prisma.service.js';
import type { ReqMeta } from '../../common/req-meta.js';
import { AuditService } from '../audit/audit.service.js';

export function toPolicyDto(p: SlaPolicy): SlaPolicyDto {
  return {
    firstResponseMinutes: p.firstResponseMinutes,
    forgottenAfterHours: p.forgottenAfterHours,
    businessHoursEnabled: p.businessHoursEnabled,
    workdays: [...p.workdays].sort(),
    workStart: p.workStart,
    workEnd: p.workEnd,
    updatedAt: p.updatedAt.toISOString(),
  };
}

@Injectable()
export class SlaPolicyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Effective policy: business hours are ignored when the BUSINESS_HOURS feature is cut (ADR-020). */
  async getForOrg(orgId: string, tx?: Tx): Promise<SlaPolicy> {
    const client = tx ?? this.prisma.db;
    let policy = await client.slaPolicy.findFirst({ where: { organizationId: orgId } });
    policy ??= await client.slaPolicy.create({ data: { organizationId: orgId } });
    if (!this.config.features.BUSINESS_HOURS) return { ...policy, businessHoursEnabled: false };
    return policy;
  }

  async get(orgId: string): Promise<SlaPolicyDto> {
    return toPolicyDto(await this.getForOrg(orgId));
  }

  /** FR-030/FR-031: applies to leads created after saving; audited with from/to. */
  async update(actor: Actor, input: SlaPolicyRequest, meta: ReqMeta): Promise<SlaPolicyDto> {
    const before = await this.getForOrg(actor.orgId);
    const businessHoursEnabled = this.config.features.BUSINESS_HOURS ? input.businessHoursEnabled : false;
    const updated = await this.prisma.db.$transaction(async (tx) => {
      const row = await tx.slaPolicy.update({
        where: { id: before.id, organizationId: actor.orgId },
        data: { ...input, businessHoursEnabled, workdays: [...new Set(input.workdays)].sort(), updatedById: actor.userId },
      });
      const { updatedAt: _a, ...from } = toPolicyDto(before);
      const { updatedAt: _b, ...to } = toPolicyDto(row);
      await this.audit.append(
        {
          organizationId: actor.orgId,
          action: 'SLA_POLICY_UPDATED',
          actorUserId: actor.userId,
          entityType: 'SlaPolicy',
          entityId: row.id,
          metadata: { from, to },
          meta,
        },
        tx,
      );
      return row;
    });
    return toPolicyDto(updated);
  }
}
