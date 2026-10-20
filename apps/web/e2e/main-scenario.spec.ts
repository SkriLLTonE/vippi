import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

/**
 * Main demo scenario (PRD S-1…S-6): register → SLA 1 min → invite manager → create + import leads →
 * real SLA breach by the scheduler → notification → manager opens the lead, AI summary + draft,
 * marks the reply sent, changes status → dashboard → CSV export.
 * Everything runs against the real API and database; nothing is mocked.
 */

const run = Date.now();
const owner = { org: `E2E Realty ${run}`, name: 'Owner E2E', email: `owner-${run}@e2e.example`, password: 'E2e-Owner-Pass-2026' };
const manager = { name: 'Manager E2E', email: `manager-${run}@e2e.example`, password: 'E2e-Manager-Pass-2026' };
const leadName = `Клиент E2E ${run}`;
const importedName = `Импорт E2E ${run}`;

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `test-results/screens/${name}.png`, fullPage: false });
}

test('main scenario: SLA breach → notification → AI-assisted reply → dashboard → CSV export', async ({ page, browser }) => {
  await test.step('register organization', async () => {
    await page.goto('/register');
    await page.getByLabel('Название компании').fill(owner.org);
    await page.getByLabel('Ваше имя').fill(owner.name);
    await page.getByLabel('Электронная почта').fill(owner.email);
    await page.getByLabel('Пароль', { exact: true }).fill(owner.password);
    await page.getByRole('button', { name: 'Создать компанию' }).click();
    await expect(page).toHaveURL(/\/leads/);
    await expect(page.getByTestId('onboarding')).toBeVisible();
    await shot(page, '01-onboarding');
  });

  await test.step('set SLA to 1 minute', async () => {
    await page.goto('/settings/sla');
    const minutes = page.getByLabel('Время первого ответа, минут');
    await minutes.fill('1');
    await expect(page.getByTestId('sla-preview')).toContainText('→');
    await page.getByRole('button', { name: 'Сохранить' }).click();
    await expect(page.getByText('Сохранено')).toBeVisible();
  });

  let inviteUrl = '';
  await test.step('invite a manager', async () => {
    await page.goto('/team');
    await page.getByTestId('invite-button').click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Электронная почта').fill(manager.email);
    await dialog.getByRole('button', { name: 'Пригласить' }).click();
    inviteUrl = (await dialog.getByTestId('invite-url').textContent()) ?? '';
    expect(inviteUrl).toContain('/invite/');
    await shot(page, '02-invite-link');
    await dialog.getByRole('button', { name: 'Готово' }).click();
  });

  const managerContext = await browser.newContext({ locale: 'ru-RU', timezoneId: 'Asia/Tashkent', viewport: { width: 1440, height: 900 } });
  const mPage = await managerContext.newPage();
  await test.step('manager accepts the invitation', async () => {
    await mPage.goto(new URL(inviteUrl).pathname);
    await mPage.getByLabel('Ваше имя').fill(manager.name);
    await mPage.getByLabel('Пароль', { exact: true }).fill(manager.password);
    await mPage.getByRole('button', { name: 'Присоединиться' }).click();
    await expect(mPage).toHaveURL(/\/leads/);
  });

  let leadId = '';
  await test.step('owner creates a lead assigned to the manager', async () => {
    await page.goto('/leads');
    await page.getByRole('button', { name: 'Новый лид' }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Имя клиента').fill(leadName);
    await dialog.getByLabel('Телефон').fill('+998 90 123 45 67');
    await dialog.getByLabel('Источник', { exact: true }).selectOption('TELEGRAM');
    await dialog.getByLabel('Текст заявки').fill('Здравствуйте! Ищу 2-комнатную квартиру в Юнусабаде, бюджет до 65 000 $. Когда можно посмотреть?');
    await dialog.getByLabel('Ответственный').selectOption({ label: manager.name });
    await dialog.getByRole('button', { name: 'Создать лид' }).click();
    await expect(page).toHaveURL(/\/leads\/[0-9a-f-]{36}$/);
    leadId = page.url().split('/').pop() ?? '';
    await expect(page.getByTestId('sla-badge').first()).toHaveAttribute('data-sla', /pending|dueSoon/);
  });

  await test.step('owner imports a lead from CSV (preview → import)', async () => {
    await page.goto('/leads');
    await page.getByRole('button', { name: 'Импорт CSV' }).first().click();
    const dialog = page.getByRole('dialog');
    const csv = `name,phone,source,message\r\n${importedName},+998 91 765 43 21,INSTAGRAM,Uy kerak Chilonzorda\r\n`;
    await dialog.getByTestId('import-file').setInputFiles({ name: 'leads.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf8') });
    await dialog.getByRole('button', { name: 'Далее' }).click();
    await expect(dialog.getByTestId('import-preview')).toBeVisible();
    await dialog.getByRole('button', { name: /^Импортировать 1/ }).click();
    await expect(dialog.getByTestId('import-result')).toContainText('Импортировано: 1');
    await page.keyboard.press('Escape');
  });

  await test.step('scheduler breaches the SLA and notifies the manager', async () => {
    await expect
      .poll(
        async () => {
          const res = await mPage.request.get('/api/v1/notifications');
          const body = (await res.json()) as { items: Array<{ type: string; leadId: string | null }> };
          return body.items.some((n) => n.type === 'SLA_BREACHED' && n.leadId === leadId);
        },
        { timeout: 200_000, intervals: [5_000] },
      )
      .toBe(true);
    await mPage.reload();
    await expect(mPage.getByTestId('notifications-bell')).toHaveAttribute('aria-label', /непрочитан/, { timeout: 40_000 });
    await mPage.getByTestId('notifications-bell').click();
    await shot(mPage, '03-notification');
    await mPage.getByTestId('notification-item').filter({ hasText: 'просрочен первый ответ' }).first().click();
    await expect(mPage).toHaveURL(new RegExp(`/leads/${leadId}$`));
    await expect(mPage.getByTestId('sla-badge').first()).toHaveAttribute('data-sla', 'breached');
  });

  await test.step('manager gets the AI summary and an editable reply draft', async () => {
    await mPage.getByTestId('ai-analyze').click();
    await expect(mPage.getByTestId('ai-summary')).toBeVisible({ timeout: 45_000 });
    await expect(mPage.getByTestId('ai-source').first()).toContainText(/AI/);
    await mPage.getByTestId('ai-generate-draft').click();
    const draft = mPage.getByTestId('ai-draft-text');
    await expect(draft).not.toBeEmpty({ timeout: 45_000 });
    await draft.fill(`${await draft.inputValue()}\nС уважением, ${manager.name}`);
    await expect(mPage.getByText('Изменено вами')).toBeVisible();
    await shot(mPage, '04-ai-panel');
  });

  await test.step('manager marks the reply as sent and qualifies the lead', async () => {
    await mPage.getByTestId('ai-mark-sent').click();
    const sent = mPage.getByRole('dialog');
    await sent.getByRole('radio', { name: 'Telegram' }).click();
    await sent.getByRole('button', { name: 'Сохранить' }).click();
    await expect(mPage.getByTestId('lead-status').first()).toContainText('Связались');
    await mPage.getByTestId('change-status-button').click();
    const status = mPage.getByRole('dialog');
    await status.getByRole('radio', { name: 'Квалифицирован' }).click();
    await status.getByRole('button', { name: 'Сохранить' }).click();
    await expect(mPage.getByTestId('lead-status').first()).toContainText('Квалифицирован');
    await expect(mPage.getByTestId('timeline')).toContainText('отметил(а) первый контакт');
    await shot(mPage, '05-lead-qualified');
  });

  await test.step('owner sees the dashboard', async () => {
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Дашборд' })).toBeVisible();
    await expect(page.getByText('Всего лидов')).toBeVisible();
    await expect(page.getByRole('link', { name: manager.name })).toBeVisible();
    await shot(page, '06-dashboard');
  });

  await test.step('owner exports leads to CSV', async () => {
    await page.goto('/leads');
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-csv').click()]);
    expect(download.suggestedFilename()).toMatch(/\.csv$/);
    const file = await download.path();
    const content = await readFile(file, 'utf8');
    expect(content).toContain(leadName);
    expect(content).toContain(importedName);
  });

  await managerContext.close();
});
