/**
 * Builds a notification From header branded with the organization name.
 * Address: org.emailFrom if set, otherwise the address part of SMTP_FROM; full SMTP_FROM as last resort.
 */
export function formatNotificationFrom(
  orgName: string,
  orgEmailFrom: string | null | undefined,
  smtpFrom: string,
): string {
  const address = (orgEmailFrom?.trim() || extractAddress(smtpFrom) || '').trim();
  if (!address) return smtpFrom;
  const display =
    orgName.replace(/[\r\n"]/g, ' ').replace(/\s+/g, ' ').trim() ||
    extractDisplayName(smtpFrom) ||
    address;
  return `"${display}" <${address}>`;
}

function extractAddress(from: string): string | null {
  const angle = from.match(/<([^<>]+@[^<>]+)>/);
  if (angle?.[1]) return angle[1].trim();
  const bare = from.trim();
  return bare.includes('@') && !bare.includes('<') ? bare : null;
}

function extractDisplayName(from: string): string | null {
  const m = from.match(/^"?([^"<]+)"?\s*</);
  const name = m?.[1]?.trim();
  return name || null;
}
