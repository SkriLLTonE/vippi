import { Global, Module } from '@nestjs/common';
import { LeadsModule } from '../leads/leads.module.js';
import { ApiKeysService } from './api-keys.service.js';
import { InvitationsService } from './invitations.service.js';
import { MembersService } from './members.service.js';
import { OrganizationsController } from './organizations.controller.js';
import { OrganizationsService } from './organizations.service.js';

@Global()
@Module({
  imports: [LeadsModule],
  controllers: [OrganizationsController],
  providers: [OrganizationsService, MembersService, InvitationsService, ApiKeysService],
  exports: [OrganizationsService, ApiKeysService],
})
export class OrganizationsModule {}
