import type { LeadDto } from '@vippi/shared';
import { useCan, useSession } from '@/entities/session';

/** UI mirror of server rules (SEC-006): O/H act on any lead, M only on own leads. */
export function useLeadAccess(lead: LeadDto | undefined) {
  const me = useSession();
  const can = useCan();
  const own = lead?.assignee?.id === me.user.id;
  const canAct = can('lead.editAny') || own;
  return {
    role: me.role,
    canAct,
    canAssign: can('lead.assign'),
    canTake: can('lead.take') && !!lead && !lead.assignee,
    canDelete: can('lead.delete'),
    canUseAi: can('ai.use'),
  };
}
