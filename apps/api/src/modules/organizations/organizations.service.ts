import { Injectable } from '@nestjs/common';
import type { Organization, Prisma } from '@prisma/client';
import {
  parseLeadFieldDefs,
  parseStatusLabels,
  type OrgLeadConfig,
  type OrganizationDto,
  type UpdateOrganizationRequest,
} from '@vippi/shared';
import type { Actor } from '../../common/actor.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import type { ReqMeta } from '../../common/req-meta.js';
import { AuditService } from '../audit/audit.service.js';

/** ADR-024: lead configuration exposed to the web via `/organization` and `/auth/me`. */
export function toOrgLeadConfig(org: Pick<Organization, 'industryPreset' | 'leadFieldDefs' | 'statusLabels'>): OrgLeadConfig {
  return {
    industryPreset: org.industryPreset,
    leadFields: parseLeadFieldDefs(org.leadFieldDefs),
    statusLabels: parseStatusLabels(org.statusLabels),
  };
}

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get(orgId: string): Promise<OrganizationDto> {
    const org = await this.prisma.db.organization.findUniqueOrThrow({ where: { id: orgId } });
    return {
      id: org.id,
      name: org.name,
      timezone: org.timezone,
      isDemo: org.isDemo,
      aiExternalProcessingEnabled: org.aiExternalProcessingEnabled,
      ...toOrgLeadConfig(org),
    };
  }

  /** FR-009, ADR-016, ADR-024 */
  async update(actor: Actor, input: UpdateOrganizationRequest, meta: ReqMeta): Promise<OrganizationDto> {
    const before = await this.prisma.db.organization.findUniqueOrThrow({ where: { id: actor.orgId } });
    await this.prisma.db.$transaction(async (tx) => {
      await tx.organization.update({
        where: { id: actor.orgId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.aiExternalProcessingEnabled !== undefined
            ? { aiExternalProcessingEnabled: input.aiExternalProcessingEnabled }
            : {}),
          ...(input.industryPreset !== undefined ? { industryPreset: input.industryPreset } : {}),
          ...(input.statusLabels !== undefined ? { statusLabels: input.statusLabels as Prisma.InputJsonValue } : {}),
        },
      });
      const settingsFields: string[] = [];
      if (input.name !== undefined && input.name !== before.name) settingsFields.push('name');
      if (
        input.statusLabels !== undefined &&
        JSON.stringify(input.statusLabels) !== JSON.stringify(parseStatusLabels(before.statusLabels))
      ) {
        settingsFields.push('statusLabels');
      }
      if (settingsFields.length > 0) {
        await this.audit.append(
          {
            organizationId: actor.orgId,
            action: 'ORG_SETTINGS_UPDATED',
            actorUserId: actor.userId,
            entityType: 'Organization',
            entityId: actor.orgId,
            metadata: { fields: settingsFields },
            meta,
          },
          tx,
        );
      }
      if (
        input.aiExternalProcessingEnabled !== undefined &&
        input.aiExternalProcessingEnabled !== before.aiExternalProcessingEnabled
      ) {
        await this.audit.append(
          {
            organizationId: actor.orgId,
            action: 'ORG_AI_PROCESSING_TOGGLED',
            actorUserId: actor.userId,
            entityType: 'Organization',
            entityId: actor.orgId,
            metadata: { from: before.aiExternalProcessingEnabled, to: input.aiExternalProcessingEnabled },
            meta,
          },
          tx,
        );
      }
      if (input.industryPreset !== undefined && input.industryPreset !== before.industryPreset) {
        await this.audit.append(
          {
            organizationId: actor.orgId,
            action: 'ORG_INDUSTRY_PRESET_CHANGED',
            actorUserId: actor.userId,
            entityType: 'Organization',
            entityId: actor.orgId,
            metadata: { from: before.industryPreset, to: input.industryPreset },
            meta,
          },
          tx,
        );
      }
    });
    return this.get(actor.orgId);
  }
}
