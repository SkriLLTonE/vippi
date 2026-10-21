import type { AppConfig } from '../../../config/env.js';
import type { AiProvider } from './ai-provider.interface.js';
import { GeminiProvider } from './gemini.provider.js';

/** `AI_PROVIDER=none` or an empty key → no provider (rule-based mode, NO_PROVIDER_CONFIGURED). */
export function createAiProvider(config: AppConfig): AiProvider | null {
  if (config.AI_PROVIDER === 'gemini' && config.GEMINI_API_KEY) {
    return new GeminiProvider(config.GEMINI_API_KEY, config.AI_MODEL, config.AI_THINKING_LEVEL);
  }
  return null;
}
