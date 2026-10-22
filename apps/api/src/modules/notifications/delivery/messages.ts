import type { Locale, NotificationType } from '@vippi/shared';

export interface DeliverableNotification {
  id: string;
  type: NotificationType;
  leadId: string | null;
  payload: { leadNumber?: number; overdueMinutes?: number; assignedByName?: string };
}

export interface PushMessage {
  title: string;
  body: string;
  url: string;
  tag: string;
}

export interface EmailMessage {
  subject: string;
  text: string;
  html: string;
}

interface Texts {
  slaTitle: string;
  sla: (n: number, minutes: number | undefined) => string;
  assignedTitle: string;
  assigned: (n: number, by: string | undefined) => string;
  open: string;
  footer: (profileUrl: string) => string;
  testTitle: string;
  testBody: string;
  openApp: string;
}

const TEXTS: Record<Locale, Texts> = {
  ru: {
    slaTitle: 'Просрочен первый ответ',
    sla: (n, m) => `Лид #${n}: просрочен первый ответ${m ? ` (на ${m} мин)` : ''}`,
    assignedTitle: 'Новый лид',
    assigned: (n, by) => `Вам назначен лид #${n}${by ? `. Назначил(а): ${by}` : ''}`,
    open: 'Открыть лид',
    footer: (url) => `Письмо отправлено, потому что в профиле включены email-уведомления. Отключить: ${url}`,
    testTitle: 'Проверка уведомлений',
    testBody: 'Уведомления Vippi Leads работают',
    openApp: 'Открыть Vippi Leads',
  },
  uz: {
    slaTitle: 'Birinchi javob muddati oʻtdi',
    sla: (n, m) => `Lid #${n}: birinchi javob muddati oʻtdi${m ? ` (${m} daq.)` : ''}`,
    assignedTitle: 'Yangi lid',
    assigned: (n, by) => `Sizga #${n} lid biriktirildi${by ? `. Biriktirdi: ${by}` : ''}`,
    open: 'Lidni ochish',
    footer: (url) => `Xat profilingizda email-bildirishnomalar yoqilgani uchun yuborildi. Oʻchirish: ${url}`,
    testTitle: 'Bildirishnomalarni tekshirish',
    testBody: 'Vippi Leads bildirishnomalari ishlayapti',
    openApp: 'Vippi Leads’ni ochish',
  },
};

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );

function toLocale(locale: string): Locale {
  return locale === 'uz' ? 'uz' : 'ru';
}

/** Lead number and staff names only — never client PII or the lead message (FR-040, NFR-016). */
function headline(n: DeliverableNotification, t: Texts): { title: string; body: string } {
  const number = n.payload.leadNumber ?? 0;
  if (n.type === 'SLA_BREACHED') return { title: t.slaTitle, body: t.sla(number, n.payload.overdueMinutes) };
  return { title: t.assignedTitle, body: t.assigned(number, n.payload.assignedByName) };
}

function leadUrl(n: DeliverableNotification, origin: string): string {
  return n.leadId ? `${origin}/leads/${n.leadId}` : `${origin}/leads`;
}

export function renderPush(n: DeliverableNotification, locale: string, origin: string): PushMessage {
  const { title, body } = headline(n, TEXTS[toLocale(locale)]);
  return { title, body, url: leadUrl(n, origin), tag: `${n.type}:${n.leadId ?? n.id}` };
}

function email(body: string, url: string, action: string, footer: string): EmailMessage {
  return {
    subject: `Vippi Leads: ${body}`,
    text: `${body}\n\n${action}: ${url}\n\n—\n${footer}\n`,
    html: [
      '<!doctype html><html><body style="font-family:Arial,sans-serif;font-size:15px;color:#111">',
      `<p>${escapeHtml(body)}</p>`,
      `<p><a href="${escapeHtml(url)}" style="display:inline-block;padding:10px 16px;background:#2563eb;color:#fff;border-radius:6px;text-decoration:none">${escapeHtml(action)}</a></p>`,
      `<p style="font-size:12px;color:#666">${escapeHtml(footer)}</p>`,
      '</body></html>',
    ].join(''),
  };
}

export function renderEmail(n: DeliverableNotification, locale: string, origin: string): EmailMessage {
  const t = TEXTS[toLocale(locale)];
  return email(headline(n, t).body, leadUrl(n, origin), t.open, t.footer(`${origin}/profile`));
}

/** "Send test" button in the profile. */
export function renderTest(locale: string, origin: string): { push: PushMessage; email: EmailMessage } {
  const t = TEXTS[toLocale(locale)];
  return {
    push: { title: t.testTitle, body: t.testBody, url: `${origin}/profile`, tag: 'test' },
    email: email(t.testBody, `${origin}/dashboard`, t.openApp, t.footer(`${origin}/profile`)),
  };
}
