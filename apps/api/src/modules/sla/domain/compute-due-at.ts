export { computeDueAt } from '@vippi/shared';

/** SLA state for imported/historical leads (FR-061, AC-056). */
export function historicalSlaState(
  dueAt: Date,
  firstResponseAt: Date | null,
  now: Date,
): { slaState: 'PENDING' | 'MET' | 'BREACHED'; slaBreachedAt: Date | null } {
  if (firstResponseAt) {
    return firstResponseAt <= dueAt
      ? { slaState: 'MET', slaBreachedAt: null }
      : { slaState: 'BREACHED', slaBreachedAt: dueAt };
  }
  if (dueAt <= now) return { slaState: 'BREACHED', slaBreachedAt: dueAt };
  return { slaState: 'PENDING', slaBreachedAt: null };
}
