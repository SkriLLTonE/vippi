import type { ApiKeyDto, CreatedApiKeyDto, RevealedApiKeyDto } from '@vippi/shared';
import { apiRequest } from '@/shared/api';

export const apiKeysQueryKey = ['api-keys'] as const;

export const KEY_MASK = '•'.repeat(12);

/** `vpk_••••••••••••abc`; keys created before encryption at rest only know their 12-char prefix. */
export function maskApiKey(k: Pick<ApiKeyDto, 'prefix' | 'last3'>): string {
  return k.last3 ? `vpk_${KEY_MASK}${k.last3}` : `${k.prefix}…`;
}

export async function revealApiKey(id: string): Promise<string> {
  const res = await apiRequest<RevealedApiKeyDto>(`/api-keys/${id}/reveal`, { method: 'POST' });
  return res.key;
}

export function rotateApiKey(id: string): Promise<CreatedApiKeyDto> {
  return apiRequest<CreatedApiKeyDto>(`/api-keys/${id}/rotate`, { method: 'POST' });
}
