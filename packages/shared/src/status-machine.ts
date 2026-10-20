import type { LeadStatus, LostReason, Role } from './enums.js';

export type TransitionCheck =
  | { ok: true }
  | { ok: false; reason: 'INVALID_STATUS_TRANSITION' | 'FORBIDDEN' | 'LOST_REASON_REQUIRED' };

/**
 * FR-013 transitions via POST /leads/{id}/status.
 * NEW→CONTACTED is only possible via first-contact (FR-014), therefore rejected here.
 */
export function canTransition(
  from: LeadStatus,
  to: LeadStatus,
  role: Role,
  lostReason?: LostReason | null,
): TransitionCheck {
  if (from === to) return { ok: false, reason: 'INVALID_STATUS_TRANSITION' };
  if (to === 'LOST' && !lostReason) return { ok: false, reason: 'LOST_REASON_REQUIRED' };

  switch (from) {
    case 'NEW':
      if (to === 'LOST' && (lostReason === 'DUPLICATE' || lostReason === 'SPAM')) return { ok: true };
      return { ok: false, reason: 'INVALID_STATUS_TRANSITION' };
    case 'CONTACTED':
      return to === 'QUALIFIED' || to === 'WON' || to === 'LOST'
        ? { ok: true }
        : { ok: false, reason: 'INVALID_STATUS_TRANSITION' };
    case 'QUALIFIED':
      return to === 'WON' || to === 'LOST' ? { ok: true } : { ok: false, reason: 'INVALID_STATUS_TRANSITION' };
    case 'WON':
    case 'LOST':
      if (to !== 'CONTACTED') return { ok: false, reason: 'INVALID_STATUS_TRANSITION' };
      return role === 'MANAGER' ? { ok: false, reason: 'FORBIDDEN' } : { ok: true };
  }
}

/** Target statuses offered in the UI for a given lead status and role. */
export function allowedTargets(from: LeadStatus, role: Role): LeadStatus[] {
  const all: LeadStatus[] = ['CONTACTED', 'QUALIFIED', 'WON', 'LOST'];
  return all.filter((to) => canTransition(from, to, role, to === 'LOST' ? allowedLostReasons(from)[0] : null).ok);
}

/** NEW→LOST only allows these reasons. */
export function allowedLostReasons(from: LeadStatus): LostReason[] {
  if (from === 'NEW') return ['DUPLICATE', 'SPAM'];
  return ['NO_ANSWER', 'TOO_EXPENSIVE', 'BOUGHT_ELSEWHERE', 'NOT_INTERESTED', 'DUPLICATE', 'SPAM', 'OTHER'];
}
