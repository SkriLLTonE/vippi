export interface AiGenerateRequest {
  system: string;
  user: string;
  jsonSchema: Record<string, unknown>;
  maxOutputTokens: number;
  temperature: number;
  signal: AbortSignal;
}

export interface AiGenerateResult {
  raw: string;
  usage: { inputTokens: number; outputTokens: number };
}

/** Provider adapter (SPEC §17.2). New providers are added as new adapters; AiService does not change. */
export interface AiProvider {
  readonly name: 'GEMINI';
  readonly model: string;
  generateJson(req: AiGenerateRequest): Promise<AiGenerateResult>;
}

/** Error with an HTTP status (if any) used to decide whether to retry. */
export class AiProviderError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'AiProviderError';
  }
}

export const AI_PROVIDER = Symbol('AI_PROVIDER');
