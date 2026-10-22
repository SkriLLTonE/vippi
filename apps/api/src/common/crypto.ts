import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** 32 random bytes, base64url (43 chars). */
export function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

const SEALED_VERSION = 'v1';

/**
 * AES-256-GCM with a random 96-bit IV. Output: `v1.<iv>.<tag>.<ciphertext>` (base64url).
 * `aad` binds the ciphertext to its context (e.g. the organization), so it cannot be moved to another row.
 */
export function sealSecret(plaintext: string, key: Buffer, aad: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [SEALED_VERSION, iv, tag, data].map((p) => (typeof p === 'string' ? p : p.toString('base64url'))).join('.');
}

/** Inverse of sealSecret; null when the value is malformed, tampered with, or sealed with another key/aad. */
export function openSecret(sealed: string, key: Buffer, aad: string): string | null {
  const [version, iv, tag, data, ...rest] = sealed.split('.');
  if (version !== SEALED_VERSION || !iv || !tag || data === undefined || rest.length > 0) return null;
  const ivBytes = Buffer.from(iv, 'base64url');
  const tagBytes = Buffer.from(tag, 'base64url');
  // A truncated GCM tag would weaken authentication, so only the full 16-byte tag is accepted.
  if (ivBytes.length !== 12 || tagBytes.length !== 16) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, ivBytes, { authTagLength: 16 });
    decipher.setAAD(Buffer.from(aad, 'utf8'));
    decipher.setAuthTag(tagBytes);
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
