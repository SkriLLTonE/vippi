import { ApiError, GoogleGenAI, ThinkingLevel } from '@google/genai';
import { AiProviderError, type AiGenerateRequest, type AiGenerateResult, type AiProvider } from './ai-provider.interface.js';

export type GeminiThinkingLevel = 'minimal' | 'low' | 'medium' | 'high';

const THINKING_LEVELS: Record<GeminiThinkingLevel, ThinkingLevel> = {
  minimal: ThinkingLevel.MINIMAL,
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
};

/** Google Gemini adapter (ADR-010): native structured output, no tools/functions. */
export class GeminiProvider implements AiProvider {
  readonly name = 'GEMINI' as const;
  private readonly client: GoogleGenAI;

  constructor(
    apiKey: string,
    readonly model: string,
    /** Unset = model default. Supported levels differ per model (Gemini docs "Thinking"). */
    private readonly thinkingLevel?: GeminiThinkingLevel,
  ) {
    this.client = new GoogleGenAI({ apiKey });
  }

  async generateJson(req: AiGenerateRequest): Promise<AiGenerateResult> {
    try {
      const response = await this.client.models.generateContent({
        model: this.model,
        contents: [{ role: 'user', parts: [{ text: req.user }] }],
        config: {
          systemInstruction: req.system,
          responseMimeType: 'application/json',
          responseJsonSchema: req.jsonSchema,
          // Thinking tokens count against this cap, so it includes headroom beyond the visible JSON.
          maxOutputTokens: req.maxOutputTokens,
          temperature: req.temperature,
          abortSignal: req.signal,
          ...(this.thinkingLevel ? { thinkingConfig: { thinkingLevel: THINKING_LEVELS[this.thinkingLevel] } } : {}),
        },
      });
      const finishReason = response.candidates?.[0]?.finishReason;
      const raw = response.text;
      if (!raw) throw new AiProviderError(`Empty response (finishReason ${finishReason ?? 'none'})`, null, false);
      if (finishReason === 'MAX_TOKENS') throw new AiProviderError('Output truncated (MAX_TOKENS)', null, false);
      const usage = response.usageMetadata;
      return {
        raw,
        usage: {
          inputTokens: usage?.promptTokenCount ?? 0,
          // Thinking tokens are billed as output (Gemini pricing), so they count towards the daily token cap.
          outputTokens: (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0),
        },
      };
    } catch (e) {
      if (e instanceof AiProviderError) throw e;
      if (e instanceof ApiError) {
        throw new AiProviderError(`Gemini API error ${e.status}`, e.status, e.status === 429 || e.status >= 500);
      }
      if (req.signal.aborted) throw new AiProviderError('Aborted', null, false);
      throw new AiProviderError('Network error', null, true);
    }
  }
}
