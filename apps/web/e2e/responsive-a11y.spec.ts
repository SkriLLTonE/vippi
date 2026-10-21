import { mkdir } from 'node:fs/promises';
import { expect, test, type Browser, type Page } from '@playwright/test';

/**
 * NFR-UX responsive + accessibility check (no third-party a11y engine: axe-core is MPL-2.0).
 * For every key page at 1440/768/390 px:
 * - no horizontal page overflow;
 * - Playwright accessibility snapshot: every interactive role has an accessible name;
 * - DOM checks: <html lang>, one <h1>, no <img> without alt, no duplicate ids;
 * - WCAG 1.4.3 text contrast (≥ 4.5:1, ≥ 3:1 for large text) on solid backgrounds;
 * - WCAG 2.5.8 target size (≥ 24×24 px) for controls on the 390 px viewport.
 * Keyboard: skip link → main, visible focus on every tab stop, mobile "More" dialog opens/closes with focus return.
 * Screenshots go to SCREENSHOTS_DIR (docs/delivery/screenshots when refreshing the docs).
 */

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 390, height: 844 },
] as const;

const SCREENSHOTS_DIR = process.env.SCREENSHOTS_DIR ?? 'test-results/responsive';
const SCREENSHOT_PAGES = new Set(['login', 'leads', 'lead-details', 'dashboard']);

const run = Date.now();
const owner = {
  org: `A11y Realty ${run}`,
  name: 'Owner A11y',
  email: `a11y-${run}@e2e.example`,
  password: 'A11y-Owner-Pass-2026',
};

let storageState: Awaited<ReturnType<Awaited<ReturnType<Browser['newContext']>>['storageState']>>;
let leadId = '';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ baseURL });
  const headers = { Origin: new URL(baseURL ?? '').origin };
  const reg = await ctx.request.post('/api/v1/auth/register-organization', {
    headers,
    data: {
      organizationName: owner.org,
      fullName: owner.name,
      email: owner.email,
      password: owner.password,
      locale: 'ru',
    },
  });
  expect(reg.status(), await reg.text()).toBe(201);
  const leads = [
    {
      fullName: 'Азиза Каримова',
      phone: '+998 90 111 22 33',
      source: 'TELEGRAM',
      message: 'Ищу 2-комнатную квартиру в Юнусабаде, бюджет до 65 000 $.',
      district: 'YUNUSOBOD',
      rooms: 2,
      propertyType: 'APARTMENT',
      budget: { amount: '65000', currency: 'USD' },
    },
    {
      fullName: 'Bobur Toshmatov',
      phone: '+998 91 222 33 44',
      source: 'INSTAGRAM',
      message: 'Chilonzorda hovli kerak, narxi qancha?',
    },
    {
      fullName: 'Очень длинное имя клиента для проверки переносов строк в таблице и карточках',
      source: 'WEBSITE',
      phone: '+998 93 333 44 55',
      message: 'Офис 120 м² в центре, срочно.',
    },
  ];
  for (const lead of leads) {
    const res = await ctx.request.post('/api/v1/leads', { headers, data: lead });
    expect(res.status(), await res.text()).toBe(201);
    if (!leadId) leadId = ((await res.json()) as { id: string }).id;
  }
  storageState = await ctx.storageState();
  await ctx.close();
});

const PAGES = [
  { name: 'login', path: () => '/login', auth: false },
  { name: 'register', path: () => '/register', auth: false },
  { name: 'leads', path: () => '/leads', auth: true },
  { name: 'lead-details', path: () => `/leads/${leadId}`, auth: true },
  { name: 'overdue', path: () => '/overdue', auth: true },
  { name: 'dashboard', path: () => '/dashboard', auth: true },
  { name: 'team', path: () => '/team', auth: true },
  { name: 'settings-sla', path: () => '/settings/sla', auth: true },
  { name: 'profile', path: () => '/profile', auth: true },
] as const;

const INTERACTIVE =
  'button|link|textbox|searchbox|combobox|checkbox|radio|switch|tab|spinbutton|menuitem|slider';
const UNNAMED = new RegExp(String.raw`^\s*- (${INTERACTIVE})(?: \[[^\]]*\])?:?\s*$`);

async function settle(page: Page) {
  await page.waitForLoadState('networkidle');
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  await expect(page.locator('h1').first()).toBeVisible();
}

async function domFindings(page: Page, checkTargets: boolean): Promise<string[]> {
  return page.evaluate((targets) => {
    const out: string[] = [];
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return (
        r.width > 0 &&
        r.height > 0 &&
        s.visibility !== 'hidden' &&
        s.display !== 'none' &&
        Number(s.opacity) > 0
      );
    };
    const describe = (el: Element) =>
      `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${el.getAttribute('data-testid') ? `[data-testid=${el.getAttribute('data-testid')}]` : ''} "${(el.textContent ?? '').trim().slice(0, 40)}"`;

    if (!document.documentElement.lang) out.push('html has no lang');
    const h1 = [...document.querySelectorAll('h1')].filter(visible).length;
    if (h1 !== 1) out.push(`expected exactly one visible h1, got ${h1}`);
    for (const img of document.querySelectorAll('img:not([alt])'))
      out.push(`img without alt: ${img.getAttribute('src')}`);
    const ids = [...document.querySelectorAll('[id]')].map((e) => e.id);
    for (const id of new Set(ids.filter((id, i) => ids.indexOf(id) !== i))) out.push(`duplicate id: ${id}`);

    const overflow = document.documentElement.scrollWidth - window.innerWidth;
    if (overflow > 1) out.push(`horizontal overflow ${overflow}px`);

    const parse = (c: string) => {
      const m = /rgba?\(([^)]+)\)/.exec(c);
      if (!m?.[1]) return null;
      const [r = 0, g = 0, b = 0, a = 1] = m[1]
        .split(/[ ,/]+/)
        .filter(Boolean)
        .map(Number);
      return { r, g, b, a };
    };
    const lum = ({ r, g, b }: { r: number; g: number; b: number }) => {
      const ch = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
    };
    const background = (el: Element | null): { r: number; g: number; b: number } | null => {
      for (let cur = el; cur; cur = cur.parentElement) {
        const s = getComputedStyle(cur);
        if (s.backgroundImage !== 'none') return null;
        const bg = parse(s.backgroundColor);
        if (bg && bg.a >= 0.99) return bg;
        if (bg && bg.a > 0) return null;
      }
      return { r: 255, g: 255, b: 255 };
    };
    const seen = new Set<string>();
    for (const el of document.querySelectorAll('body *')) {
      if (!visible(el) || el.closest('[aria-hidden="true"], .sr-only, [disabled], [aria-disabled="true"]'))
        continue;
      const ownText = [...el.childNodes].some(
        (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim(),
      );
      if (!ownText) continue;
      const s = getComputedStyle(el);
      const fg = parse(s.color);
      const bg = background(el);
      if (!fg || !bg || fg.a < 0.99) continue;
      const [hi, lo] = [lum(fg), lum(bg)].sort((a, b) => b - a) as [number, number];
      const ratio = (hi + 0.05) / (lo + 0.05);
      const size = parseFloat(s.fontSize);
      const large = size >= 24 || (size >= 18.66 && Number(s.fontWeight) >= 700);
      const min = large ? 3 : 4.5;
      const key = `${s.color}|${bg.r},${bg.g},${bg.b}`;
      if (ratio < min && !seen.has(key)) {
        seen.add(key);
        out.push(
          `contrast ${ratio.toFixed(2)} < ${min}: ${describe(el)} (${s.color} on rgb(${bg.r},${bg.g},${bg.b}))`,
        );
      }
    }

    if (targets) {
      const controls = document.querySelectorAll(
        'button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=checkbox], [role=radio], [role=switch], [role=tab]',
      );
      for (const el of controls) {
        if (!visible(el) || el.closest('.sr-only')) continue;
        if (el.tagName === 'A' && getComputedStyle(el).display === 'inline') continue; // inline text links are exempt
        const r = el.getBoundingClientRect();
        if (r.width < 24 || r.height < 24)
          out.push(`target ${Math.round(r.width)}×${Math.round(r.height)} < 24: ${describe(el)}`);
      }
    }
    return out;
  }, checkTargets);
}

async function audit(page: Page): Promise<string[]> {
  const snapshot = await page.locator('body').ariaSnapshot();
  const unnamed = snapshot
    .split('\n')
    .filter((line) => UNNAMED.test(line))
    .map((line) => `unnamed ${line.trim()}`);
  return [...unnamed, ...(await domFindings(page, page.viewportSize()?.width === 390))];
}

for (const vp of VIEWPORTS) {
  test(`responsive + a11y audit at ${vp.width}px`, async ({ browser, baseURL }) => {
    await mkdir(SCREENSHOTS_DIR, { recursive: true });
    const findings: string[] = [];
    for (const p of PAGES) {
      const ctx = await browser.newContext({
        baseURL,
        locale: 'ru-RU',
        timezoneId: 'Asia/Tashkent',
        viewport: { width: vp.width, height: vp.height },
        ...(p.auth ? { storageState } : {}),
      });
      const page = await ctx.newPage();
      await page.goto(p.path());
      await settle(page);
      findings.push(...(await audit(page)).map((f) => `${p.name}@${vp.width}: ${f}`));
      if (SCREENSHOT_PAGES.has(p.name))
        await page.screenshot({ path: `${SCREENSHOTS_DIR}/${p.name}-${vp.width}.png` });
      await ctx.close();
    }
    expect(findings).toEqual([]);
  });
}

async function focusInfo(page: Page) {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return null;
    const s = getComputedStyle(el);
    const outline = s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0;
    const ring = s.boxShadow !== 'none';
    return {
      label: `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30)}"`,
      visibleFocus: outline || ring,
      inViewport: (() => {
        const r = el.getBoundingClientRect();
        return r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && r.left < window.innerWidth;
      })(),
    };
  });
}

test('keyboard: skip link, visible focus on every tab stop, Enter/Escape on dialogs (1440px)', async ({
  browser,
  baseURL,
}) => {
  const ctx = await browser.newContext({
    baseURL,
    locale: 'ru-RU',
    viewport: { width: 1440, height: 900 },
    storageState,
  });
  const page = await ctx.newPage();
  await page.goto('/leads');
  await settle(page);

  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Перейти к содержимому' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press('Enter');
  await expect(page.locator('main#main')).toBeFocused();

  const problems: string[] = [];
  const stops: string[] = [];
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    const f = await focusInfo(page);
    if (!f) break;
    stops.push(f.label);
    if (!f.visibleFocus) problems.push(`no visible focus: ${f.label}`);
    if (!f.inViewport) problems.push(`focused element off-screen: ${f.label}`);
  }
  expect(stops.length).toBeGreaterThan(10);
  expect(problems).toEqual([]);

  await page.getByRole('button', { name: 'Новый лид' }).first().focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(':focus')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'Новый лид' }).first()).toBeFocused();
  await ctx.close();
});

test('keyboard: mobile "More" menu opens with Enter and returns focus on Escape (390px)', async ({
  browser,
  baseURL,
}) => {
  const ctx = await browser.newContext({
    baseURL,
    locale: 'ru-RU',
    viewport: { width: 390, height: 844 },
    storageState,
  });
  const page = await ctx.newPage();
  await page.goto('/leads');
  await settle(page);
  const more = page
    .getByRole('navigation', { name: 'Основная навигация' })
    .getByRole('button', { name: 'Ещё' });
  await more.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('link', { name: 'Дашборд' })).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(dialog.locator(':focus')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(more).toBeFocused();
  await ctx.close();
});
