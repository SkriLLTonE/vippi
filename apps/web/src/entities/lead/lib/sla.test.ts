import { describe, expect, it } from 'vitest';
import { slaView } from './sla';

const base = {
  receivedAt: '2026-10-21T05:00:00.000Z',
  firstResponseDueAt: '2026-10-21T05:15:00.000Z',
  firstResponseAt: null,
};
const at = (iso: string) => Date.parse(iso);

describe('slaView', () => {
  it('counts down while pending and flags due soon in the last 5 minutes', () => {
    expect(slaView({ ...base, slaState: 'PENDING' }, at('2026-10-21T05:05:00Z'))).toEqual({ kind: 'pending', seconds: 600 });
    expect(slaView({ ...base, slaState: 'PENDING' }, at('2026-10-21T05:12:00Z')).kind).toBe('dueSoon');
  });

  it('shows overdue before the scheduler marks the lead', () => {
    expect(slaView({ ...base, slaState: 'PENDING' }, at('2026-10-21T05:20:00Z'))).toEqual({ kind: 'breached', seconds: 300 });
  });

  it('uses response time for MET and lateness for answered BREACHED leads', () => {
    expect(slaView({ ...base, slaState: 'MET', firstResponseAt: '2026-10-21T05:04:00Z' }, 0)).toEqual({ kind: 'met', seconds: 240 });
    expect(
      slaView({ ...base, slaState: 'BREACHED', firstResponseAt: '2026-10-21T06:15:00Z' }, at('2026-10-21T09:00:00Z')),
    ).toEqual({ kind: 'breached', seconds: 3600 });
  });

  it('marks EXEMPT leads', () => {
    expect(slaView({ ...base, slaState: 'EXEMPT' }, 0).kind).toBe('exempt');
  });
});
