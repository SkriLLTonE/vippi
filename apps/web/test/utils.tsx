import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  FEATURE_FLAGS,
  permissionsFor,
  type AiResultEnvelope,
  type FeatureFlags,
  type LeadAnalysis,
  type LeadDto,
  type MeResponse,
  type MyStatsResponse,
  type Role,
} from '@vippi/shared';
import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router';
import { Toaster } from 'sonner';
import { vi } from 'vitest';
import i18n from 'i18next';
import { sessionKeys } from '@/entities/session';
import { TooltipProvider } from '@/shared/ui';

export function makeMe(role: Role = 'OWNER', overrides: Partial<MeResponse> = {}): MeResponse {
  return {
    user: { id: 'u-1', email: 'owner@example.test', fullName: 'Owner Person', locale: 'ru' },
    organization: {
      id: 'o-1',
      name: 'Test Agency',
      isDemo: false,
      aiExternalProcessingEnabled: false,
      timezone: 'Asia/Tashkent',
      industry: 'REAL_ESTATE',
      industryPreset: 'REAL_ESTATE',
      leadFields: [],
      statusLabels: {},
    },
    role,
    permissions: permissionsFor(role),
    features: Object.fromEntries(FEATURE_FLAGS.map((f) => [f, true])) as FeatureFlags,
    serverTime: new Date().toISOString(),
    ...overrides,
  };
}

export function makeLead(overrides: Partial<LeadDto> = {}): LeadDto {
  return {
    id: 'lead-1',
    number: 7,
    fullName: 'Aziz Karimov',
    phone: '+998001234567',
    source: 'TELEGRAM',
    sourceDetail: null,
    message: '2 xonali kvartira kerak, Yunusobod',
    budget: null,
    district: null,
    propertyType: null,
    rooms: null,
    attributes: {},
    status: 'NEW',
    lostReason: null,
    lostComment: null,
    assignee: { id: 'u-1', fullName: 'Owner Person' },
    createdVia: 'MANUAL',
    externalId: null,
    receivedAt: '2026-10-19T05:00:00.000Z',
    firstResponseDueAt: '2026-10-19T05:15:00.000Z',
    firstResponseAt: null,
    firstResponseBy: null,
    firstResponseChannel: null,
    slaState: 'PENDING',
    slaBreachedAt: null,
    possibleDuplicateOf: null,
    isForgotten: false,
    closedAt: null,
    createdAt: '2026-10-19T05:00:00.000Z',
    updatedAt: '2026-10-19T05:00:00.000Z',
    ...overrides,
  };
}

export function makeMyStats(overrides: Partial<MyStatsResponse> = {}): MyStatsResponse {
  return {
    period: { from: '2026-10-13', to: '2026-10-19', timezone: 'Asia/Tashkent' },
    me: {
      received: 12,
      inWork: 5,
      closed: 7,
      medianFirstResponseSeconds: 480,
      slaMetRate: 0.9,
      breached: 1,
      won: 3,
      conversionRate: 0.25,
    },
    team: {
      size: 4,
      average: {
        received: 10.5,
        inWork: 4,
        closed: 6.5,
        medianFirstResponseSeconds: 900,
        slaMetRate: 0.75,
        breached: 2.25,
        won: 2,
        conversionRate: 0.3,
      },
    },
    daily: [
      { date: '2026-10-18', leads: 4, breached: 0, teamAverageLeads: 3.5 },
      { date: '2026-10-19', leads: 8, breached: 1, teamAverageLeads: 7 },
    ],
    ...overrides,
  };
}

export function makeAnalysisEnvelope(
  source: 'AI' | 'RULE_BASED',
  result: Partial<LeadAnalysis> = {},
): AiResultEnvelope<LeadAnalysis> {
  return {
    insightId: 'ins-1',
    kind: 'LEAD_ANALYSIS',
    source,
    provider: source === 'AI' ? 'GEMINI' : 'RULE_BASED',
    model: source === 'AI' ? 'gemini-2.5-flash' : null,
    fallbackReason: source === 'AI' ? null : 'NO_PROVIDER_CONFIGURED',
    cached: false,
    promptVersion: 'v1',
    createdAt: '2026-10-19T05:01:00.000Z',
    latencyMs: 5,
    result: {
      summary: 'Ищет 2-комнатную квартиру в Юнусабаде',
      language: 'uz',
      need: null,
      budget: null,
      district: 'YUNUSOBOD',
      propertyType: 'APARTMENT',
      rooms: 2,
      missingInfo: ['Бюджет'],
      score: 55,
      reasons: ['Указан район', 'Указан телефон'],
      nextQuestions: ['Какой бюджет вы рассматриваете?'],
      ...result,
    },
  };
}

export interface MockCall {
  method: string;
  path: string;
  query: URLSearchParams;
  body: unknown;
}

type Handler = (call: MockCall) => {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
  raw?: BodyInit;
};

/**
 * Stubs global fetch with route handlers keyed by "METHOD /path" (path without /api/v1 and query).
 * Unmatched requests fail the test loudly instead of hanging.
 */
export function mockApi(routes: Record<string, Handler>) {
  const calls: MockCall[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const method = init?.method ?? 'GET';
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : (init?.body ?? null);
    const call = { method, path, query: url.searchParams, body };
    calls.push(call);
    const handler = routes[`${method} ${path}`];
    if (!handler) throw new Error(`Unmocked request: ${method} ${path}`);
    const res = handler(call);
    const status = res.status ?? 200;
    const payload = res.raw ?? (res.body === undefined ? null : JSON.stringify(res.body));
    return new Response(status === 204 ? null : payload, {
      status,
      headers: { 'Content-Type': 'application/json', ...res.headers },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
}

export const apiError = (status: number, code: string, details: unknown[] = []) => ({
  status,
  body: { error: { code, message: code, details, requestId: 'req-1' } },
});

interface RenderOptions {
  path?: string;
  route?: string;
  me?: MeResponse | null;
  extraRoutes?: RouteObject[];
  seed?: (qc: QueryClient) => void;
}

export function renderWithProviders(ui: ReactNode, opts: RenderOptions = {}) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
  if (opts.me !== undefined) qc.setQueryData(sessionKeys.me, opts.me);
  opts.seed?.(qc);
  const path = opts.path ?? '/';
  const router = createMemoryRouter(
    [{ path, element: ui }, ...(opts.extraRoutes ?? []), { path: '*', element: <p>route: other</p> }],
    { initialEntries: [opts.route ?? path] },
  );
  const user = userEvent.setup();
  const utils = render(
    <QueryClientProvider client={qc}>
      <I18nextProvider i18n={i18n}>
        <TooltipProvider>
          <RouterProvider router={router} />
          <Toaster />
        </TooltipProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  );
  return { ...utils, qc, router, user };
}
