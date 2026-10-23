import { Injectable } from '@nestjs/common';
import type { Organization, Prisma } from '@prisma/client';
import {
  INDUSTRY_CATALOG_VERSION,
  INDUSTRY_TEMPLATES,
  parseLeadFieldDefs,
  parseStatusLabels,
  planIndustryTemplate,
  presetForIndustry,
  resolveIndustry,
  type ApplyIndustryTemplateResponse,
  type Industry,
  type IndustryPreset,
  type OrgLeadConfig,
  type OrganizationDto,
  type UpdateOrganizationRequest,
} from '@vippi/shared';
import type { Actor } from '../../common/actor.js';
import { PrismaService, type Tx } from '../../common/prisma/prisma.service.js';
import type { ReqMeta } from '../../common/req-meta.js';
import { AuditService } from '../audit/audit.service.js';

type IndustryColumns = Pick<Organization, 'industry' | 'industryPreset'>;

/** ADR-024/025: lead configuration exposed to the web via `/organization` and `/auth/me`. */
export function toOrgLeadConfig(
  org: Pick<Organization, 'industry' | 'industryPreset' | 'leadFieldDefs' | 'statusLabels'>,
): OrgLeadConfig {
  return {
    industry: resolveIndustry(org.industry, org.industryPreset),
    industryPreset: org.industryPreset,
    leadFields: parseLeadFieldDefs(org.leadFieldDefs),
    statusLabels: parseStatusLabels(org.statusLabels),
  };
}

/** Legacy `industryPreset` input (ADR-024): GENERIC keeps a non-real-estate industry, otherwise becomes OTHER. */
function industryFromPreset(preset: IndustryPreset, current: Industry): Industry {
  if (preset === 'REAL_ESTATE') return 'REAL_ESTATE';
  return presetForIndustry(current) === 'GENERIC' ? current : 'OTHER';
}

/** Industry for a new organization: explicit code wins, legacy preset maps to REAL_ESTATE/OTHER. */
export function registrationIndustry(input: { industry?: Industry | undefined; industryPreset?: IndustryPreset | undefined }): Industry {
  if (input.industry) return input.industry;
  return input.industryPreset === 'GENERIC' ? 'OTHER' : 'REAL_ESTATE';
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
      emailFrom: org.emailFrom,
      aiExternalProcessingEnabled: org.aiExternalProcessingEnabled,
      ...toOrgLeadConfig(org),
    };
  }

  /** FR-009, ADR-016, ADR-024, ADR-025 */
  async update(actor: Actor, input: UpdateOrganizationRequest, meta: ReqMeta): Promise<OrganizationDto> {
    const before = await this.prisma.db.organization.findUniqueOrThrow({ where: { id: actor.orgId } });
    const currentIndustry = resolveIndustry(before.industry, before.industryPreset);
    const nextIndustry =
      input.industry ?? (input.industryPreset !== undefined ? industryFromPreset(input.industryPreset, currentIndustry) : undefined);
    await this.prisma.db.$transaction(async (tx) => {
      await tx.organization.update({
        where: { id: actor.orgId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.emailFrom !== undefined ? { emailFrom: input.emailFrom } : {}),
          ...(input.aiExternalProcessingEnabled !== undefined
            ? { aiExternalProcessingEnabled: input.aiExternalProcessingEnabled }
            : {}),
          ...(input.statusLabels !== undefined ? { statusLabels: input.statusLabels as Prisma.InputJsonValue } : {}),
          ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
        },
      });
      const settingsFields: string[] = [];
      if (input.name !== undefined && input.name !== before.name) settingsFields.push('name');
      if (input.emailFrom !== undefined && input.emailFrom !== before.emailFrom) settingsFields.push('emailFrom');
      if (input.timezone !== undefined && input.timezone !== before.timezone) settingsFields.push('timezone');
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
      if (nextIndustry !== undefined) await this.changeIndustry(tx, actor, before, nextIndustry, meta);
    });
    return this.get(actor.orgId);
  }

  /**
   * ADR-025: switch the industry and merge its template. Adds missing fields up to the limit,
   * never removes definitions or stored values; customized status labels change only when confirmed.
   */
  async applyIndustryTemplate(
    actor: Actor,
    input: { industry: Industry; overwriteStatusLabels: boolean },
    meta: ReqMeta,
  ): Promise<ApplyIndustryTemplateResponse> {
    const plan = await this.prisma.db.$transaction(async (tx: Tx) => {
      // Row lock serializes with custom field edits (LeadFieldsService) — no lost updates of the JSON list.
      await tx.$queryRaw`SELECT 1 FROM "Organization" WHERE "id" = ${actor.orgId}::uuid FOR UPDATE`;
      const before = await tx.organization.findUniqueOrThrow({ where: { id: actor.orgId } });
      const result = planIndustryTemplate(
        INDUSTRY_TEMPLATES[input.industry],
        { leadFields: parseLeadFieldDefs(before.leadFieldDefs), statusLabels: parseStatusLabels(before.statusLabels) },
        {
          overwriteStatusLabels: input.overwriteStatusLabels,
          previous: INDUSTRY_TEMPLATES[resolveIndustry(before.industry, before.industryPreset)],
        },
      );
      await tx.organization.update({
        where: { id: actor.orgId },
        data: {
          ...(result.addedFields.length > 0 ? { leadFieldDefs: result.fields as unknown as Prisma.InputJsonValue } : {}),
          ...(result.statusLabelsChanged.length > 0 ? { statusLabels: result.statusLabels as Prisma.InputJsonValue } : {}),
        },
      });
      await this.changeIndustry(tx, actor, before, input.industry, meta);
      await this.audit.append(
        {
          organizationId: actor.orgId,
          action: 'ORG_INDUSTRY_TEMPLATE_APPLIED',
          actorUserId: actor.userId,
          entityType: 'Organization',
          entityId: actor.orgId,
          metadata: {
            industry: input.industry,
            catalogVersion: INDUSTRY_CATALOG_VERSION,
            addedFields: result.addedFields,
            skippedFields: result.skippedFields,
            statusLabelsChanged: result.statusLabelsChanged,
          },
          meta,
        },
        tx,
      );
      return result;
    });
    return {
      organization: await this.get(actor.orgId),
      addedFields: plan.addedFields,
      skippedFields: plan.skippedFields,
      statusLabelsChanged: plan.statusLabelsChanged,
    };
  }

  /** Writes the industry with its derived preset; audits each actual change. */
  private async changeIndustry(tx: Tx, actor: Actor, before: IndustryColumns, next: Industry, meta: ReqMeta): Promise<void> {
    const fromIndustry = resolveIndustry(before.industry, before.industryPreset);
    const preset = presetForIndustry(next);
    if (fromIndustry === next && before.industry === next) return;
    await tx.organization.update({ where: { id: actor.orgId }, data: { industry: next, industryPreset: preset } });
    if (fromIndustry !== next) {
      await this.audit.append(
        {
          organizationId: actor.orgId,
          action: 'ORG_INDUSTRY_CHANGED',
          actorUserId: actor.userId,
          entityType: 'Organization',
          entityId: actor.orgId,
          metadata: { from: fromIndustry, to: next },
          meta,
        },
        tx,
      );
    }
    if (preset !== before.industryPreset) {
      await this.audit.append(
        {
          organizationId: actor.orgId,
          action: 'ORG_INDUSTRY_PRESET_CHANGED',
          actorUserId: actor.userId,
          entityType: 'Organization',
          entityId: actor.orgId,
          metadata: { from: before.industryPreset, to: preset },
          meta,
        },
        tx,
      );
    }
  }
}
