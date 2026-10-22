import { screen, waitFor, within } from '@testing-library/react';
import type { AiResultEnvelope, ReplyDraft } from '@vippi/shared';
import { describe, expect, it } from 'vitest';
import {
  apiError,
  makeAnalysisEnvelope,
  makeLead,
  makeMe,
  mockApi,
  renderWithProviders,
} from '../../../../test/utils';
import { AiPanel } from './ai-panel';

const lead = makeLead();
const draftEnvelope = (text: string): AiResultEnvelope<ReplyDraft> => ({
  ...makeAnalysisEnvelope('RULE_BASED'),
  insightId: 'draft-1',
  kind: 'REPLY_DRAFT',
  result: { text, language: 'uz' },
});

describe('AiPanel (FR-070…FR-073, UX-4)', () => {
  it('labels rule-based output honestly and explains disabled consent with a settings link for owners', async () => {
    mockApi({
      'GET /leads/lead-1/ai': () => ({ body: { analysis: makeAnalysisEnvelope('RULE_BASED'), draft: null } }),
    });
    renderWithProviders(<AiPanel lead={lead} canAct />, { me: makeMe('OWNER') });
    const badge = (await screen.findAllByTestId('ai-source'))[0];
    expect(badge).toHaveAttribute('data-source', 'RULE_BASED');
    expect(badge).toHaveTextContent('Без AI · по правилам');
    expect(badge?.textContent).not.toMatch(/Gemini/);
    expect(screen.getByTestId('ai-summary')).toHaveTextContent('Ищет 2-комнатную квартиру в Юнусабаде');
    expect(screen.getByText(/Обработка заявок внешним AI выключена/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Включить в настройках' })).toHaveAttribute(
      'href',
      '/settings/organization',
    );
  });

  it('managers see the consent hint without the settings link', async () => {
    mockApi({
      'GET /leads/lead-1/ai': () => ({ body: { analysis: makeAnalysisEnvelope('RULE_BASED'), draft: null } }),
    });
    renderWithProviders(<AiPanel lead={lead} canAct />, { me: makeMe('MANAGER') });
    expect(await screen.findByText(/Обработка заявок внешним AI выключена/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Включить в настройках' })).not.toBeInTheDocument();
  });

  it('labels provider output with provider and model', async () => {
    mockApi({
      'GET /leads/lead-1/ai': () => ({ body: { analysis: makeAnalysisEnvelope('AI'), draft: null } }),
    });
    const me = makeMe('OWNER');
    me.organization.aiExternalProcessingEnabled = true;
    renderWithProviders(<AiPanel lead={lead} canAct />, { me });
    const badge = (await screen.findAllByTestId('ai-source'))[0];
    expect(badge).toHaveAttribute('data-source', 'AI');
    expect(badge).toHaveTextContent('AI · Gemini/gemini-2.5-flash');
    expect(screen.queryByText(/Обработка заявок внешним AI выключена/)).not.toBeInTheDocument();
  });

  it('runs an analysis on demand and offers to apply extracted fields', async () => {
    const { calls } = mockApi({
      'GET /leads/lead-1/ai': () => ({ body: { analysis: null, draft: null } }),
      'POST /leads/lead-1/ai/analysis': () => ({ body: makeAnalysisEnvelope('RULE_BASED') }),
      'POST /leads/lead-1/ai/apply-fields': () => ({ body: { ...lead, rooms: 2 } }),
    });
    const { user } = renderWithProviders(<AiPanel lead={lead} canAct />, { me: makeMe('OWNER') });
    await user.click(await screen.findByTestId('ai-analyze'));
    expect(await screen.findByTestId('ai-summary')).toBeInTheDocument();
    expect(calls.find((c) => c.path.endsWith('/analysis'))?.body).toEqual({ force: false });
    await user.click(screen.getByRole('button', { name: 'Применить все' }));
    await waitFor(() => expect(calls.some((c) => c.path.endsWith('/apply-fields'))).toBe(true));
    expect(calls.find((c) => c.path.endsWith('/apply-fields'))?.body).toEqual({
      insightId: 'ins-1',
      fields: ['district', 'propertyType', 'rooms'],
    });
  });

  it('GENERIC orgs get no district/property/rooms apply buttons, only budget (ADR-024)', async () => {
    const { calls } = mockApi({
      'GET /leads/lead-1/ai': () => ({
        body: {
          analysis: makeAnalysisEnvelope('RULE_BASED', { budget: { amount: 5000000, currency: 'UZS' } }),
          draft: null,
        },
      }),
      'POST /leads/lead-1/ai/apply-fields': () => ({ body: lead }),
    });
    const me = makeMe('OWNER');
    me.organization.industryPreset = 'GENERIC';
    const { user } = renderWithProviders(<AiPanel lead={lead} canAct />, { me });
    await screen.findByTestId('ai-summary');
    expect(screen.queryByText('Район')).not.toBeInTheDocument();
    expect(screen.queryByText('Комнат')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Применить' })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Применить' }));
    await waitFor(() => expect(calls.some((c) => c.path.endsWith('/apply-fields'))).toBe(true));
    expect(calls.find((c) => c.path.endsWith('/apply-fields'))?.body).toEqual({ insightId: 'ins-1', fields: ['budget'] });
  });

  it('hides the deal score when the DEAL_SCORE flag is off (ADR-020)', async () => {
    mockApi({
      'GET /leads/lead-1/ai': () => ({ body: { analysis: makeAnalysisEnvelope('RULE_BASED'), draft: null } }),
    });
    const me = makeMe('OWNER');
    me.features.DEAL_SCORE = false;
    renderWithProviders(<AiPanel lead={lead} canAct />, { me });
    await screen.findByTestId('ai-summary');
    expect(screen.queryByRole('progressbar', { name: 'Оценка сделки' })).not.toBeInTheDocument();
  });

  it('draft is editable, marked as edited, and "mark as sent" requires a channel', async () => {
    const original = 'Assalomu alaykum, Aziz! Men Demo Realty kompaniyasidan Dilnoza.';
    const { calls } = mockApi({
      'GET /leads/lead-1/ai': () => ({ body: { analysis: makeAnalysisEnvelope('RULE_BASED'), draft: null } }),
      'POST /leads/lead-1/ai/reply-draft': () => ({ body: draftEnvelope(original) }),
      'POST /leads/lead-1/ai/draft-sent': () => ({ body: { ...lead, status: 'CONTACTED' } }),
    });
    const { user } = renderWithProviders(<AiPanel lead={lead} canAct />, { me: makeMe('MANAGER') });
    await user.click(await screen.findByTestId('ai-generate-draft'));
    const textarea = await screen.findByTestId('ai-draft-text');
    expect(textarea).toHaveValue(original);
    expect(calls.find((c) => c.path.endsWith('/reply-draft'))?.body).toEqual({
      language: 'uz',
      tone: 'FRIENDLY',
    });
    expect(screen.queryByText('Изменено вами')).not.toBeInTheDocument();
    await user.type(textarea, ' Qoʻshimcha.');
    expect(screen.getByText('Изменено вами')).toBeInTheDocument();
    expect(screen.getByText(/Система ничего не отправляет клиенту/)).toBeInTheDocument();

    await user.click(screen.getByTestId('ai-mark-sent'));
    const dialog = await screen.findByRole('dialog');
    const save = within(dialog).getByRole('button', { name: 'Сохранить' });
    expect(save).toBeDisabled();
    await user.click(within(dialog).getByRole('radio', { name: 'Telegram' }));
    expect(save).toBeEnabled();
    await user.click(save);
    await waitFor(() => expect(calls.some((c) => c.path.endsWith('/draft-sent'))).toBe(true));
    expect(calls.find((c) => c.path.endsWith('/draft-sent'))?.body).toEqual({
      insightId: 'draft-1',
      channel: 'TELEGRAM',
      edited: true,
    });
  });

  it('without act permission there is no "mark as sent"', async () => {
    mockApi({
      'GET /leads/lead-1/ai': () => ({
        body: { analysis: null, draft: draftEnvelope('Здравствуйте! Это тестовый черновик ответа.') },
      }),
    });
    renderWithProviders(<AiPanel lead={lead} canAct={false} />, { me: makeMe('HEAD_OF_SALES') });
    expect(await screen.findByTestId('ai-draft-text')).toBeInTheDocument();
    expect(screen.queryByTestId('ai-mark-sent')).not.toBeInTheDocument();
  });

  it('shows an error state with a working retry', async () => {
    let fail = true;
    const { calls } = mockApi({
      'GET /leads/lead-1/ai': () =>
        fail ? apiError(500, 'INTERNAL') : { body: { analysis: null, draft: null } },
    });
    const { user } = renderWithProviders(<AiPanel lead={lead} canAct />, { me: makeMe('OWNER') });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(await screen.findByTestId('ai-analyze')).toBeInTheDocument();
    expect(calls.filter((c) => c.path === '/leads/lead-1/ai')).toHaveLength(2);
  });
});
