import { Body, Controller, Delete, Get, Header, HttpCode, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  AcceptInvitationSchema,
  ApplyIndustryTemplateSchema,
  ChangeRoleSchema,
  CreateApiKeySchema,
  CreateInvitationSchema,
  LeadFieldDefSchema,
  UpdateLeadFieldSchema,
  UpdateOrganizationSchema,
  type AcceptInvitationRequest,
  type LeadFieldDef,
  type UpdateLeadFieldRequest,
  type ChangeRoleRequest,
  type CreateApiKeyRequest,
  type CreateInvitationRequest,
  type UpdateOrganizationRequest,
} from '@vippi/shared';
import { z } from 'zod';
import type { Actor } from '../../common/actor.js';
import { CurrentActor, Public, RequirePermission } from '../../common/decorators.js';
import { UuidParam } from '../../common/params.js';
import { RequestMeta, type ReqMeta } from '../../common/req-meta.js';
import { ApiZodBody, ZodPipe } from '../../common/zod.js';
import { SessionsService } from '../identity-access/sessions.service.js';
import { ApiKeysService } from './api-keys.service.js';
import { InvitationsService } from './invitations.service.js';
import { LeadFieldsService } from './lead-fields.service.js';
import { MembersService } from './members.service.js';
import { OrganizationsService } from './organizations.service.js';

const PreviewQuerySchema = z.object({ token: z.string().min(20).max(100) }).strict();
const LeadFieldKeyParam = new ZodPipe(LeadFieldDefSchema.shape.key);

@ApiTags('organization')
@Controller()
export class OrganizationsController {
  constructor(
    private readonly orgs: OrganizationsService,
    private readonly members: MembersService,
    private readonly invitations: InvitationsService,
    private readonly apiKeys: ApiKeysService,
    private readonly sessions: SessionsService,
    private readonly leadFields: LeadFieldsService,
  ) {}

  @Get('organization')
  @RequirePermission('org.read')
  getOrg(@CurrentActor() actor: Actor) {
    return this.orgs.get(actor.orgId);
  }

  @Patch('organization')
  @RequirePermission('org.manage')
  @ApiZodBody(UpdateOrganizationSchema)
  updateOrg(
    @CurrentActor() actor: Actor,
    @Body(new ZodPipe(UpdateOrganizationSchema)) body: UpdateOrganizationRequest,
    @RequestMeta() meta: ReqMeta,
  ) {
    return this.orgs.update(actor, body, meta);
  }

  /** ADR-025: switch industry and merge its template fields/labels. */
  @Post('organization/industry-template')
  @RequirePermission('org.manage')
  @HttpCode(200)
  @ApiZodBody(ApplyIndustryTemplateSchema)
  applyIndustryTemplate(
    @CurrentActor() actor: Actor,
    @Body(new ZodPipe(ApplyIndustryTemplateSchema)) body: z.output<typeof ApplyIndustryTemplateSchema>,
    @RequestMeta() meta: ReqMeta,
  ) {
    return this.orgs.applyIndustryTemplate(actor, body, meta);
  }

  @Get('lead-fields')
  @RequirePermission('org.read')
  listLeadFields(@CurrentActor() actor: Actor) {
    return this.leadFields.list(actor.orgId);
  }

  @Post('lead-fields')
  @RequirePermission('leadFields.manage')
  @ApiZodBody(LeadFieldDefSchema)
  createLeadField(
    @CurrentActor() actor: Actor,
    @Body(new ZodPipe(LeadFieldDefSchema)) body: LeadFieldDef,
    @RequestMeta() meta: ReqMeta,
  ) {
    return this.leadFields.create(actor, body, meta);
  }

  @Patch('lead-fields/:key')
  @RequirePermission('leadFields.manage')
  @ApiZodBody(UpdateLeadFieldSchema)
  updateLeadField(
    @CurrentActor() actor: Actor,
    @Param('key', LeadFieldKeyParam) key: string,
    @Body(new ZodPipe(UpdateLeadFieldSchema)) body: UpdateLeadFieldRequest,
    @RequestMeta() meta: ReqMeta,
  ) {
    return this.leadFields.update(actor, key, body, meta);
  }

  @Delete('lead-fields/:key')
  @RequirePermission('leadFields.manage')
  @HttpCode(204)
  async deleteLeadField(
    @CurrentActor() actor: Actor,
    @Param('key', LeadFieldKeyParam) key: string,
    @RequestMeta() meta: ReqMeta,
  ): Promise<void> {
    await this.leadFields.remove(actor, key, meta);
  }

  @Get('members')
  @RequirePermission('member.read')
  listMembers(@CurrentActor() actor: Actor) {
    return this.members.list(actor);
  }

  @Patch('members/:id')
  @RequirePermission('member.manage')
  @HttpCode(204)
  @ApiZodBody(ChangeRoleSchema)
  async changeRole(
    @CurrentActor() actor: Actor,
    @Param('id', UuidParam) id: string,
    @Body(new ZodPipe(ChangeRoleSchema)) body: ChangeRoleRequest,
    @RequestMeta() meta: ReqMeta,
  ): Promise<void> {
    await this.members.changeRole(actor, id, body, meta);
  }

  @Post('members/:id/deactivate')
  @RequirePermission('member.manage')
  @HttpCode(200)
  deactivate(@CurrentActor() actor: Actor, @Param('id', UuidParam) id: string, @RequestMeta() meta: ReqMeta) {
    return this.members.deactivate(actor, id, meta);
  }

  @Get('invitations')
  @RequirePermission('invitation.manage')
  listInvitations(@CurrentActor() actor: Actor) {
    return this.invitations.listPending(actor);
  }

  @Post('invitations')
  @RequirePermission('invitation.manage')
  @ApiZodBody(CreateInvitationSchema)
  createInvitation(
    @CurrentActor() actor: Actor,
    @Body(new ZodPipe(CreateInvitationSchema)) body: CreateInvitationRequest,
    @RequestMeta() meta: ReqMeta,
  ) {
    return this.invitations.create(actor, body, meta);
  }

  @Post('invitations/:id/revoke')
  @RequirePermission('invitation.manage')
  @HttpCode(204)
  async revokeInvitation(
    @CurrentActor() actor: Actor,
    @Param('id', UuidParam) id: string,
    @RequestMeta() meta: ReqMeta,
  ): Promise<void> {
    await this.invitations.revoke(actor, id, meta);
  }

  @Get('invitations/preview')
  @Public()
  preview(@Query(new ZodPipe(PreviewQuerySchema)) q: { token: string }) {
    return this.invitations.preview(q.token);
  }

  @Post('invitations/accept')
  @Public()
  @ApiZodBody(AcceptInvitationSchema)
  async accept(
    @Body(new ZodPipe(AcceptInvitationSchema)) body: AcceptInvitationRequest,
    @RequestMeta() meta: ReqMeta,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { token, me } = await this.invitations.accept(body, meta);
    this.sessions.setCookie(res, token);
    return me;
  }

  @Get('api-keys')
  @RequirePermission('apiKey.manage')
  listKeys(@CurrentActor() actor: Actor) {
    return this.apiKeys.list(actor);
  }

  @Post('api-keys')
  @RequirePermission('apiKey.manage')
  @ApiZodBody(CreateApiKeySchema)
  createKey(
    @CurrentActor() actor: Actor,
    @Body(new ZodPipe(CreateApiKeySchema)) body: CreateApiKeyRequest,
    @RequestMeta() meta: ReqMeta,
  ) {
    return this.apiKeys.create(actor, body, meta);
  }

  @Post('api-keys/:id/revoke')
  @RequirePermission('apiKey.manage')
  @HttpCode(204)
  async revokeKey(
    @CurrentActor() actor: Actor,
    @Param('id', UuidParam) id: string,
    @RequestMeta() meta: ReqMeta,
  ): Promise<void> {
    await this.apiKeys.revoke(actor, id, meta);
  }

  /** POST (not GET) so the full key never lands in caches or access logs keyed by URL. */
  @Post('api-keys/:id/reveal')
  @RequirePermission('apiKey.manage')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  revealKey(@CurrentActor() actor: Actor, @Param('id', UuidParam) id: string, @RequestMeta() meta: ReqMeta) {
    return this.apiKeys.reveal(actor, id, meta);
  }

  @Post('api-keys/:id/rotate')
  @RequirePermission('apiKey.manage')
  @Header('Cache-Control', 'no-store')
  rotateKey(@CurrentActor() actor: Actor, @Param('id', UuidParam) id: string, @RequestMeta() meta: ReqMeta) {
    return this.apiKeys.rotate(actor, id, meta);
  }
}
