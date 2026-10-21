import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../../src/config/env.js';
import { SlaSchedulerService } from '../../src/modules/sla/sla-scheduler.service.js';

const base = { DATABASE_URL: 'postgresql://u:p@localhost:5432/db', PUBLIC_APP_URL: 'http://localhost:8080' };

describe('loadConfig (ADR-022 deployment settings)', () => {
  it('local defaults: port 3000, no proxy trust, non-secure cookie over http', () => {
    const c = loadConfig(base);
    expect(c.API_PORT).toBe(3000);
    expect(c.TRUST_PROXY).toBe(0);
    expect(c.COOKIE_SECURE).toBe(false);
    expect(c.WEB_DIST_DIR).toBeUndefined();
  });

  it('Render: PORT and RENDER_EXTERNAL_URL are used when API_PORT / PUBLIC_APP_URL are absent', () => {
    const c = loadConfig({ DATABASE_URL: base.DATABASE_URL, PORT: '10000', RENDER_EXTERNAL_URL: 'https://vippi.onrender.com' });
    expect(c.API_PORT).toBe(10000);
    expect(c.publicOrigin).toBe('https://vippi.onrender.com');
    expect(c.COOKIE_SECURE).toBe(true);
  });

  it('explicit API_PORT and PUBLIC_APP_URL win over Render variables', () => {
    const c = loadConfig({ ...base, API_PORT: '3100', PORT: '10000', RENDER_EXTERNAL_URL: 'https://other.onrender.com' });
    expect(c.API_PORT).toBe(3100);
    expect(c.publicOrigin).toBe('http://localhost:8080');
  });

  it('https origin implies secure cookies unless explicitly overridden', () => {
    expect(loadConfig({ ...base, PUBLIC_APP_URL: 'https://demo.example' }).COOKIE_SECURE).toBe(true);
    expect(loadConfig({ ...base, PUBLIC_APP_URL: 'https://demo.example', COOKIE_SECURE: 'false' }).COOKIE_SECURE).toBe(false);
    expect(loadConfig({ ...base, COOKIE_SECURE: 'true' }).COOKIE_SECURE).toBe(true);
  });

  it.each([
    ['true', 1],
    ['false', 0],
    ['0', 0],
    ['3', 3],
  ])('TRUST_PROXY=%s → %i hops', (value, hops) => {
    expect(loadConfig({ ...base, TRUST_PROXY: value }).TRUST_PROXY).toBe(hops);
  });

  it.each(['yes', '-1', '11', '1.5'])('rejects TRUST_PROXY=%s', (value) => {
    expect(() => loadConfig({ ...base, TRUST_PROXY: value })).toThrow(/TRUST_PROXY/);
  });

  it('fails clearly without a public URL', () => {
    expect(() => loadConfig({ DATABASE_URL: base.DATABASE_URL })).toThrow(/PUBLIC_APP_URL/);
  });
});

describe('SlaSchedulerService start-up catch-up', () => {
  function make(enabled: boolean) {
    const svc = new SlaSchedulerService(
      {} as never,
      { now: () => new Date('2026-10-21T00:00:00Z') } as never,
      {} as never,
      {} as never,
      {} as never,
      { SLA_CRON_ENABLED: enabled, SLA_SCAN_BATCH_SIZE: 500 } as never,
    );
    const runOnce = vi.spyOn(svc, 'runOnce').mockResolvedValue({ locked: true, breached: 3, notifications: 6 });
    return { svc, runOnce };
  }

  it('runs one scan immediately on bootstrap so a woken instance catches up', async () => {
    const { svc, runOnce } = make(true);
    svc.onApplicationBootstrap();
    await vi.waitFor(() => expect(svc.lastRunAt).not.toBeNull());
    expect(runOnce).toHaveBeenCalledTimes(1);
  });

  it('does nothing on bootstrap when the scheduler is disabled', () => {
    const { svc, runOnce } = make(false);
    svc.onApplicationBootstrap();
    expect(runOnce).not.toHaveBeenCalled();
  });

  it('a failing catch-up scan is logged, not thrown', async () => {
    const { svc, runOnce } = make(true);
    runOnce.mockRejectedValueOnce(new Error('db down'));
    const error = vi.spyOn(svc['logger'], 'error').mockImplementation(() => undefined);
    svc.onApplicationBootstrap();
    await vi.waitFor(() => expect(error).toHaveBeenCalledTimes(1));
    expect(svc.lastRunAt).toBeNull();
  });
});
