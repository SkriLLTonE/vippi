import { ApiError } from '@google/genai';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AiProviderError,
  type AiGenerateRequest,
} from '../../src/modules/ai/providers/ai-provider.interface.js';
import { GeminiProvider } from '../../src/modules/ai/providers/gemini.provider.js';

const { generateContent } = vi.hoisted(() => ({ generateContent: vi.fn() }));

vi.mock('@google/genai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@google/genai')>();
  class FakeGoogleGenAI {
    readonly models = { generateContent };
    constructor(readonly options: { apiKey: string }) {}
  }
  return { ...actual, GoogleGenAI: FakeGoogleGenAI };
});
const request = (signal = new AbortController().signal): AiGenerateRequest => ({
  system: 'system prompt',
  user: '<lead_data>{}</lead_data>',
  jsonSchema: { type: 'object' },
  maxOutputTokens: 512,
  temperature: 0.2,
  signal,
});

async function providerError(promise: Promise<unknown>): Promise<AiProviderError> {
  try {
    await promise;
  } catch (e) {
    if (e instanceof AiProviderError) return e;
    throw new Error(
      `expected AiProviderError, got ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`,
      { cause: e },
    );
  }
  throw new Error('expected the call to fail');
}

describe('GeminiProvider (ADR-010, mocked SDK)', () => {
  beforeEach(() => {
    generateContent.mockClear();
  });

  it('sends structured-output config and returns raw JSON with token usage', async () => {
    generateContent.mockResolvedValue({
      text: '{"ok":true}',
      usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 30 },
    });
    const req = request();
    const res = await new GeminiProvider('test-key', 'gemini-2.5-flash').generateJson(req);
    expect(res).toEqual({ raw: '{"ok":true}', usage: { inputTokens: 120, outputTokens: 30 } });
    expect(generateContent).toHaveBeenCalledWith({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: req.user }] }],
      config: {
        systemInstruction: 'system prompt',
        responseMimeType: 'application/json',
        responseJsonSchema: { type: 'object' },
        maxOutputTokens: 512,
        temperature: 0.2,
        abortSignal: req.signal,
      },
    });
  });

  it('missing usage metadata counts as zero tokens', async () => {
    generateContent.mockResolvedValue({ text: '{}' });
    const res = await new GeminiProvider('k', 'm').generateJson(request());
    expect(res.usage).toEqual({ inputTokens: 0, outputTokens: 0 });
  });

  it('empty response is a non-retryable error', async () => {
    generateContent.mockResolvedValue({ text: '' });
    const e = await providerError(new GeminiProvider('k', 'm').generateJson(request()));
    expect(e).toMatchObject({ message: 'Empty response', status: null, retryable: false });
  });

  it.each([
    [429, true],
    [500, true],
    [503, true],
    [400, false],
    [401, false],
    [403, false],
    [404, false],
  ])('API error %i → retryable=%s', async (status, retryable) => {
    generateContent.mockImplementation(async () => {
      throw new ApiError({ message: 'x', status });
    });
    const e = await providerError(new GeminiProvider('k', 'm').generateJson(request()));
    expect(e).toMatchObject({ status, retryable });
  });

  it('abort (timeout) is reported as non-retryable', async () => {
    const controller = new AbortController();
    generateContent.mockImplementation(() => {
      controller.abort();
      return Promise.reject(new Error('The operation was aborted'));
    });
    const e = await providerError(new GeminiProvider('k', 'm').generateJson(request(controller.signal)));
    expect(e).toMatchObject({ message: 'Aborted', retryable: false });
  });

  it('network failure is retryable', async () => {
    generateContent.mockImplementation(async () => {
      throw new TypeError('fetch failed');
    });
    const e = await providerError(new GeminiProvider('k', 'm').generateJson(request()));
    expect(e).toMatchObject({ message: 'Network error', status: null, retryable: true });
  });
});
