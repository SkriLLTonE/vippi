import type { SlaState } from '@vippi/shared';
import { DUE_SOON_SECONDS } from '@/shared/config';

export type SlaViewKind = 'pending' | 'dueSoon' | 'breached' | 'met' | 'exempt';

export interface SlaView {
  kind: SlaViewKind;
  /** Remaining (pending/dueSoon), overdue (breached) or response time (met), in seconds. */
  seconds: number;
}

interface SlaInput {
  slaState: SlaState;
  receivedAt: string;
  firstResponseDueAt: string;
  firstResponseAt: string | null;
}

/** Display state of the SLA timer; the server stays the source of truth for `slaState`. */
export function slaView(lead: SlaInput, now: number): SlaView {
  const due = Date.parse(lead.firstResponseDueAt);
  const received = Date.parse(lead.receivedAt);
  const responded = lead.firstResponseAt ? Date.parse(lead.firstResponseAt) : null;
  switch (lead.slaState) {
    case 'EXEMPT':
      return { kind: 'exempt', seconds: 0 };
    case 'MET':
      return { kind: 'met', seconds: ((responded ?? due) - received) / 1000 };
    case 'BREACHED':
      return { kind: 'breached', seconds: ((responded ?? now) - due) / 1000 };
    case 'PENDING': {
      const remaining = (due - now) / 1000;
      if (remaining <= 0) return { kind: 'breached', seconds: -remaining };
      return { kind: remaining <= DUE_SOON_SECONDS ? 'dueSoon' : 'pending', seconds: remaining };
    }
  }
}
