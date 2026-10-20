import { describe, expect, it } from 'vitest';
import { LEAD_STATUSES, ROLES } from './enums.js';
import type { LeadStatus, Role } from './enums.js';
import { allowedLostReasons, allowedTargets, canTransition } from './status-machine.js';

const allowed: Array<[LeadStatus, LeadStatus]> = [
  ['CONTACTED', 'QUALIFIED'],
  ['CONTACTED', 'WON'],
  ['CONTACTED', 'LOST'],
  ['QUALIFIED', 'WON'],
  ['QUALIFIED', 'LOST'],
];

describe('canTransition (FR-013)', () => {
  for (const role of ROLES) {
    for (const from of LEAD_STATUSES) {
      for (const to of LEAD_STATUSES) {
        it(`${role}: ${from} → ${to}`, () => {
          const r = canTransition(from, to, role, to === 'LOST' ? 'NO_ANSWER' : null);
          const isAllowed = allowed.some(([a, b]) => a === from && b === to);
          const isReopen = (from === 'WON' || from === 'LOST') && to === 'CONTACTED';
          if (isAllowed) expect(r.ok).toBe(true);
          else if (isReopen) expect(r.ok).toBe(role !== 'MANAGER');
          else expect(r.ok).toBe(false);
        });
      }
    }
  }

  it('NEW → LOST only with DUPLICATE or SPAM', () => {
    expect(canTransition('NEW', 'LOST', 'MANAGER', 'SPAM').ok).toBe(true);
    expect(canTransition('NEW', 'LOST', 'MANAGER', 'DUPLICATE').ok).toBe(true);
    expect(canTransition('NEW', 'LOST', 'OWNER', 'NO_ANSWER').ok).toBe(false);
  });

  it('LOST requires reason', () => {
    expect(canTransition('CONTACTED', 'LOST', 'OWNER')).toEqual({ ok: false, reason: 'LOST_REASON_REQUIRED' });
  });

  it('manager reopen is forbidden', () => {
    expect(canTransition('WON', 'CONTACTED', 'MANAGER')).toEqual({ ok: false, reason: 'FORBIDDEN' });
  });

  it('NEW → WON is invalid (AC-026)', () => {
    expect(canTransition('NEW', 'WON', 'OWNER')).toEqual({ ok: false, reason: 'INVALID_STATUS_TRANSITION' });
  });

  it('allowedTargets for UI', () => {
    const r = (s: LeadStatus, role: Role) => allowedTargets(s, role);
    expect(r('NEW', 'MANAGER')).toEqual(['LOST']);
    expect(r('CONTACTED', 'MANAGER')).toEqual(['QUALIFIED', 'WON', 'LOST']);
    expect(r('WON', 'MANAGER')).toEqual([]);
    expect(r('WON', 'HEAD_OF_SALES')).toEqual(['CONTACTED']);
    expect(allowedLostReasons('NEW')).toEqual(['DUPLICATE', 'SPAM']);
  });
});
