import { useEffect, useState } from 'react';

let offsetMs = 0;

/** Aligns client clock with the API (`serverTime` from GET /auth/me) for SLA countdowns. */
export function syncServerTime(serverTimeIso: string): void {
  const server = Date.parse(serverTimeIso);
  if (Number.isFinite(server)) offsetMs = server - Date.now();
}

export function serverNow(): number {
  return Date.now() + offsetMs;
}

/** Re-renders every `intervalMs` and returns the server-aligned current time. */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    const id = window.setInterval(() => setNow(serverNow()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
