import { Injectable } from '@nestjs/common';
import { hasPermission, OPEN_LEAD_STATUSES, type ChangeRoleRequest, type MemberDto } from '@vippi/shared';
import type { Actor } from '../../common/actor.js';
import { AppException, notFound } from '../../common/app-exception.js';
import { Clock } from '../../common/clock.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import type { ReqMeta } from '../../common/req-meta.js';
import { AuditService } from '../audit/audit.service.js';
import { SessionsService } from '../identity-access/sessions.service.js';
import { LeadsService } from '../leads/leads.service.js';

@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sessions: SessionsService,
    private readonly leads: LeadsService,
    private readonly clock: Clock,
  ) {}

  /** FR-008. Managers only get name and role (needed for the assignee filter). */
  async list(actor: Actor): Promise<MemberDto[]> {
    const full = hasPermission(actor.role, 'member.manage') || hasPermission(actor.role, 'invitation.manage');
    const rows = await this.prisma.db.membership.findMany({
      where: { organizationId: actor.orgId, ...(full ? {} : { status: 'ACTIVE' }) },
      include: { user: { select: { id: true, fullName: true, email: true } } },
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
    });
    const openCounts = full
      ? await this.prisma.db.lead.groupBy({
          by: ['assigneeId'],
          where: { organizationId: actor.orgId, deletedAt: null, status: { in: [...OPEN_LEAD_STATUSES] } },
          _count: { _all: true },
        })
      : [];
    const countMap = new Map(openCounts.map((c) => [c.assigneeId, c._count._all]));
    return rows.map((m) =>
      full
        ? {
            id: m.id,
            userId: m.userId,
            fullName: m.user.fullName,
            email: m.user.email,
            role: m.role,
            status: m.status,
            createdAt: m.createdAt.toISOString(),
            openLeads: countMap.get(m.userId) ?? 0,
          }
        : { id: m.id, userId: m.userId, fullName: m.user.fullName, role: m.role, status: m.status },
    );
  }

  private async findMember(orgId: string, id: string) {
    const m = await this.prisma.db.membership.findFirst({ where: { id, organizationId: orgId } });
    if (!m) throw notFound();
    return m;
  }

  /** FR-008, AC-015, AC-017 */
  async changeRole(actor: Actor, id: string, input: ChangeRoleRequest, meta: ReqMeta): Promise<void> {
    const m = await this.findMember(actor.orgId, id);
    if (m.userId === actor.userId || m.role === 'OWNER') {
      throw new AppException(422, 'CANNOT_MODIFY_SELF', 'Owner role cannot be changed');
    }
    if (m.status !== 'ACTIVE') throw notFound();
    if (m.role === input.role) return;
    await this.prisma.db.$transaction(async (tx) => {
      await tx.membership.update({ where: { id: m.id, organizationId: actor.orgId }, data: { role: input.role } });
      await this.audit.append(
        {
          organizationId: actor.orgId,
          action: 'MEMBER_ROLE_CHANGED',
          actorUserId: actor.userId,
          entityType: 'Membership',
          entityId: m.id,
          metadata: { from: m.role, to: input.role },
          meta,
        },
        tx,
      );
    });
  }

  /** FR-008, AC-016: sessions revoked, open leads unassigned, SLA deadlines untouched. */
  async deactivate(actor: Actor, id: string, meta: ReqMeta): Promise<{ unassignedLeads: number }> {
    const m = await this.findMember(actor.orgId, id);
    if (m.userId === actor.userId || m.role === 'OWNER') {
      throw new AppException(422, 'CANNOT_MODIFY_SELF', 'Owner cannot be deactivated');
    }
    if (m.status === 'DEACTIVATED') return { unassignedLeads: 0 };
    return this.prisma.db.$transaction(async (tx) => {
      await tx.membership.update({
        where: { id: m.id, organizationId: actor.orgId },
        data: { status: 'DEACTIVATED', deactivatedAt: this.clock.now() },
      });
      await this.sessions.revokeAllForUser(m.userId, tx);
      const unassignedLeads = await this.leads.unassignAllForUser(tx, actor.orgId, m.userId, actor.userId);
      await this.audit.append(
        {
          organizationId: actor.orgId,
          action: 'MEMBER_DEACTIVATED',
          actorUserId: actor.userId,
          entityType: 'Membership',
          entityId: m.id,
          metadata: { role: m.role, unassignedLeads },
          meta,
        },
        tx,
      );
      return { unassignedLeads };
    });
  }
}
