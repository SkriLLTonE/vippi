import { Injectable } from '@nestjs/common';
import type { OrganizationDto, UpdateOrganizationRequest } from '@vippi/shared';
import type { Actor } from '../../common/actor.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import type { ReqMeta } from '../../common/req-meta.js';
import { AuditService } from '../audit/audit.service.js';

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
    };
  }

  /** FR-009, ADR-016 */
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
        },
      });
      if (input.name !== undefined && input.name !== before.name) {
        await this.audit.append(
          {
            organizationId: actor.orgId,
            action: 'ORG_SETTINGS_UPDATED',
            actorUserId: actor.userId,
            entityType: 'Organization',
            entityId: actor.orgId,
            metadata: { fields: ['name'] },
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
    });
    return this.get(actor.orgId);
  }
}
