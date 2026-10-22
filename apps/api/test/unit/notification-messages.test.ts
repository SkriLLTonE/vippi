import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config/env.js';
import {
  renderEmail,
  renderPush,
  renderTest,
  type DeliverableNotification,
} from '../../src/modules/notifications/delivery/messages.js';

const origin = 'https://leads.example';
const sla: DeliverableNotification = {
  id: 'n1',
  type: 'SLA_BREACHED',
  leadId: 'lead-1',
  payload: { leadNumber: 42, overdueMinutes: 17 },
};
const assigned: DeliverableNotification = {
  id: 'n2',
  type: 'LEAD_ASSIGNED',
  leadId: 'lead-2',
  payload: { leadNumber: 7, assignedByName: 'Head <b>Person</b>' },
};

describe('notification messages (ADR-023)', () => {
  it('push: localized text, lead link and a collapse tag', () => {
    expect(renderPush(sla, 'ru', origin)).toEqual({
      title: 'Просрочен первый ответ',
      body: 'Лид #42: просрочен первый ответ (на 17 мин)',
      url: 'https://leads.example/leads/lead-1',
      tag: 'SLA_BREACHED:lead-1',
    });
    expect(renderPush(assigned, 'uz', origin).body).toBe(
      'Sizga #7 lid biriktirildi. Biriktirdi: Head <b>Person</b>',
    );
    expect(renderPush(sla, 'en', origin).title).toBe('Просрочен первый ответ');
  });

  it('email: escapes HTML and links to the lead and the opt-out page', () => {
    const m = renderEmail(assigned, 'ru', origin);
    expect(m.subject).toBe('Vippi Leads: Вам назначен лид #7. Назначил(а): Head <b>Person</b>');
    expect(m.text).toContain('Открыть лид: https://leads.example/leads/lead-2');
    expect(m.text).toContain('https://leads.example/profile');
    expect(m.html).toContain('Head &lt;b&gt;Person&lt;/b&gt;');
    expect(m.html).not.toContain('<b>Person');
  });

  it('test message exists in both languages', () => {
    expect(renderTest('ru', origin).push.body).toBe('Уведомления Vippi Leads работают');
    expect(renderTest('uz', origin).email.subject).toContain('ishlayapti');
  });
});

describe('notification channel config', () => {
  const base = {
    DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
    PUBLIC_APP_URL: 'http://localhost:8080',
  };

  it('channels are off unless configured', () => {
    expect(loadConfig(base).notifyChannels).toEqual({ push: false, email: false });
    const c = loadConfig({
      ...base,
      VAPID_PUBLIC_KEY: 'pub',
      VAPID_PRIVATE_KEY: 'priv',
      SMTP_HOST: 'smtp.x',
      SMTP_FROM: 'a@x',
    });
    expect(c.notifyChannels).toEqual({ push: true, email: true });
    expect(c.SMTP_SECURE).toBe(false);
    expect(loadConfig({ ...base, SMTP_PORT: '465' }).SMTP_SECURE).toBe(true);
  });

  it('rejects half a VAPID key pair and a bad subject', () => {
    expect(() => loadConfig({ ...base, VAPID_PUBLIC_KEY: 'pub' })).toThrow(/VAPID/);
    expect(() => loadConfig({ ...base, VAPID_SUBJECT: 'admin@example.com' })).toThrow(/VAPID_SUBJECT/);
  });
});
