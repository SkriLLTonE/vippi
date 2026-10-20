import { ApiError, GoogleGenAI } from '@google/genai';
import { AiProviderError, type AiGenerateRequest, type AiGenerateResult, type AiProvider } from './ai-provider.interface.js';

/** Google Gemini adapter (ADR-010): native structured output, no tools/functions. */
export class GeminiProvider implements AiProvider {
  readonly name = 'GEMINI' as const;
  private readonly client: GoogleGenAI;

  constructor(
    apiKey: string,
    readonly model: string,
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
          maxOutputTokens: req.maxOutputTokens,
          temperature: req.temperature,
          abortSignal: req.signal,
        },
      });
      const raw = response.text;
      if (!raw) throw new AiProviderError('Empty response', null, false);
      return {
        raw,
        usage: {
          inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
          outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
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
