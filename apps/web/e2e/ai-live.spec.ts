import { expect, test, type Page } from '@playwright/test';

/**
 * Opt-in check of the real Gemini path in the UI (docs/ai/ai-evaluation.md):
 *   E2E_AI_LIVE=1 E2E_BASE_URL=<API with AI_PROVIDER=gemini + key, demo seed> DEMO_SEED_PASSWORD=… \
 *   SCREENSHOTS_DIR=../../docs/delivery/screenshots pnpm --filter @vippi/web exec playwright test e2e/ai-live.spec.ts
 * Demo (synthetic) data only. Never runs in CI: there is no key there.
 */
test.skip(!process.env.E2E_AI_LIVE, 'live Gemini UI check is opt-in (E2E_AI_LIVE=1)');

const OWNER = 'owner@demo-realty.example';
const screenshots = process.env.SCREENSHOTS_DIR;

async function leadIdMatching(page: Page, q: string, skip = 0): Promise<string> {
  const res = await page.request.get(`/api/v1/leads?q=${encodeURIComponent(q)}&pageSize=10`);
  expect(res.ok()).toBe(true);
  const body = (await res.json()) as { items: Array<{ id: string }> };
  const id = body.items[skip]?.id;
  if (!id) throw new Error(`no demo lead matching "${q}"`);
  return id;
}

/** First run: «Проанализировать»; re-runs on the same demo lead: «Обновить» (force). */
async function analyze(page: Page) {
  const panel = page.getByTestId('ai-panel');
  const first = panel.getByTestId('ai-analyze');
  const refresh = panel.getByRole('button', { name: 'Обновить' });
  await expect(first.or(refresh)).toBeVisible();
  await ((await first.isVisible()) ? first : refresh).click();
}

async function setConsent(page: Page, baseURL: string, enabled: boolean) {
  const res = await page.request.patch('/api/v1/organization', {
    headers: { Origin: baseURL },
    data: { aiExternalProcessingEnabled: enabled },
  });
  expect(res.ok()).toBe(true);
}

test('owner enables external AI; lead panel switches from rules to Gemini output', async ({ page, baseURL }) => {
  const password = process.env.DEMO_SEED_PASSWORD;
  if (!password || !baseURL) throw new Error('DEMO_SEED_PASSWORD and E2E_BASE_URL are required');

  await page.goto('/login');
  await page.getByLabel('Электронная почта').fill(OWNER);
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page).toHaveURL(/\/(leads|dashboard)/);
  await setConsent(page, baseURL, false);

  await test.step('consent off: analysis is rule-based and labelled so', async () => {
    await page.goto(`/leads/${await leadIdMatching(page, 'xonali', 1)}`);
    await analyze(page);
    const badge = page.getByTestId('ai-panel').getByTestId('ai-source').first();
    await expect(badge).toHaveAttribute('data-source', 'RULE_BASED', { timeout: 30_000 });
    await expect(badge).toHaveText('Без AI · по правилам');
  });

  await test.step('owner turns consent on in organization settings (with confirmation)', async () => {
    await page.goto('/settings/organization');
    const card = page.getByTestId('ai-settings');
    await expect(card).toContainText('внешний AI выключен в организации');
    await page.locator('#ai-consent').click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('Включить обработку внешним AI?');
    await dialog.getByRole('button', { name: 'Включить' }).click();
    await expect(card).toContainText(/AI · Gemini\/gemini-/);
  });

  await test.step('consent on: Gemini analysis and Uzbek reply draft, labelled with provider/model', async () => {
    await page.goto(`/leads/${await leadIdMatching(page, 'xonali', 0)}`);
    const panel = page.getByTestId('ai-panel');
    await analyze(page);
    await expect(panel.getByTestId('ai-summary')).toBeVisible({ timeout: 45_000 });
    const badge = panel.getByTestId('ai-analysis').getByTestId('ai-source');
    await expect(badge).toHaveAttribute('data-source', 'AI');
    await expect(badge).toContainText(/^AI · Gemini\/gemini-/);

    await panel.getByTestId('ai-draft').getByRole('radio', { name: 'UZ' }).click();
    await page.getByTestId('ai-generate-draft').click();
    const draft = page.getByTestId('ai-draft-text');
    await expect(draft).not.toBeEmpty({ timeout: 45_000 });
    await expect(panel.getByTestId('ai-draft').getByTestId('ai-source')).toHaveAttribute('data-source', 'AI');
    expect(await draft.inputValue()).not.toMatch(/[\u0400-\u04FF]/);
    if (screenshots) {
      // Tall viewport: the whole panel fits without scrolling, so the sticky top bar never overlaps it.
      await page.setViewportSize({ width: 1440, height: 1500 });
      await page.evaluate(() => window.scrollTo(0, 0));
      await panel.screenshot({ path: `${screenshots}/ai-panel-gemini.png` });
      await page.screenshot({ path: `${screenshots}/lead-details-gemini-1440.png` });
    }
  });

  await test.step('owner turns consent off again: status returns to rules', async () => {
    await page.goto('/settings/organization');
    await page.locator('#ai-consent').click();
    await expect(page.getByTestId('ai-settings')).toContainText('внешний AI выключен в организации');
  });
});
