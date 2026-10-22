import { describe, expect, it } from 'vitest';
import { formatNotificationFrom } from '../../src/modules/notifications/delivery/email-from.js';

describe('formatNotificationFrom', () => {
  it('uses org name as display name and SMTP_FROM address', () => {
    expect(formatNotificationFrom('Acme Realty', null, 'Vippi Leads <no-reply@vippi.test>')).toBe(
      '"Acme Realty" <no-reply@vippi.test>',
    );
  });

  it('prefers org.emailFrom for the address', () => {
    expect(formatNotificationFrom('Acme', 'leads@acme.test', 'Vippi <no-reply@vippi.test>')).toBe(
      '"Acme" <leads@acme.test>',
    );
  });

  it('falls back to SMTP_FROM when address cannot be resolved', () => {
    expect(formatNotificationFrom('Acme', null, 'not-an-address')).toBe('not-an-address');
  });

  it('strips quotes and newlines from the display name', () => {
    expect(formatNotificationFrom('Acme "HQ"\nLtd', null, 'x@y.test')).toBe('"Acme HQ Ltd" <x@y.test>');
  });
});
