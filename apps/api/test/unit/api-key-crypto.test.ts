import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { openSecret, sealSecret } from '../../src/common/crypto.js';
import { loadConfig } from '../../src/config/env.js';

const key = randomBytes(32);
const plain = 'vpk_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_abc';

function tamper(sealed: string, part: number): string {
  const parts = sealed.split('.');
  const bytes = Buffer.from(parts[part] ?? '', 'base64url');
  bytes[0] = (bytes[0] ?? 0) ^ 0x01;
  parts[part] = bytes.toString('base64url');
  return parts.join('.');
}

describe('sealSecret / openSecret (AES-256-GCM)', () => {
  it('round-trips and uses a fresh IV every time', () => {
    const a = sealSecret(plain, key, 'org-1');
    const b = sealSecret(plain, key, 'org-1');
    expect(a).not.toBe(b);
    expect(a).not.toContain(plain);
    expect(a.startsWith('v1.')).toBe(true);
    expect(openSecret(a, key, 'org-1')).toBe(plain);
    expect(openSecret(b, key, 'org-1')).toBe(plain);
  });

  it.each([
    ['IV', 1],
    ['auth tag', 2],
    ['ciphertext', 3],
  ])('detects a tampered %s', (_name, part) => {
    expect(openSecret(tamper(sealSecret(plain, key, 'org-1'), part), key, 'org-1')).toBeNull();
  });

  it('rejects another key, another AAD (organization), truncated tags and malformed input', () => {
    const sealed = sealSecret(plain, key, 'org-1');
    expect(openSecret(sealed, randomBytes(32), 'org-1')).toBeNull();
    expect(openSecret(sealed, key, 'org-2')).toBeNull();
    const [v, iv, tag, data] = sealed.split('.');
    const shortTag = Buffer.from(tag ?? '', 'base64url').subarray(0, 4).toString('base64url');
    expect(openSecret([v, iv, shortTag, data].join('.'), key, 'org-1')).toBeNull();
    for (const bad of ['', 'v1', 'v2.a.b.c', `${sealed}.extra`, 'v1.!!.!!.!!']) expect(openSecret(bad, key, 'org-1')).toBeNull();
  });
});

describe('API_KEY_ENCRYPTION_KEY config', () => {
  const base = { DATABASE_URL: 'postgresql://u:p@localhost:5432/db', PUBLIC_APP_URL: 'http://localhost:8080' };

  it('accepts 32 bytes as base64 or hex', () => {
    const raw = randomBytes(32);
    expect(loadConfig({ ...base, API_KEY_ENCRYPTION_KEY: raw.toString('base64') }).apiKeyEncryptionKey.equals(raw)).toBe(true);
    expect(loadConfig({ ...base, API_KEY_ENCRYPTION_KEY: raw.toString('hex') }).apiKeyEncryptionKey.equals(raw)).toBe(true);
  });

  it.each(['short', randomBytes(16).toString('base64'), randomBytes(31).toString('hex')])('rejects %s', (value) => {
    expect(() => loadConfig({ ...base, API_KEY_ENCRYPTION_KEY: value })).toThrow(/API_KEY_ENCRYPTION_KEY/);
  });

  it('development falls back to a dev-only key; production requires the variable', () => {
    expect(loadConfig(base).apiKeyEncryptionKey).toHaveLength(32);
    expect(() => loadConfig({ ...base, NODE_ENV: 'production' })).toThrow(/API_KEY_ENCRYPTION_KEY is required in production/);
    const prod = loadConfig({ ...base, NODE_ENV: 'production', API_KEY_ENCRYPTION_KEY: randomBytes(32).toString('base64') });
    expect(prod.apiKeyEncryptionKey.equals(loadConfig(base).apiKeyEncryptionKey)).toBe(false);
  });
});
