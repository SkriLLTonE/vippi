import type { LeadAnalysis, Locale, ReplyDraft, WeeklySummary } from '@vippi/shared';
import { budgetAppearsInText } from '../fallback/rules.js';

const URL_RE = /(https?:\/\/|www\.|t\.me\/)/i;

/** SPEC §17.4 post-checks; failure → fallback with INVALID_OUTPUT. */
export function checkLeadAnalysis(out: LeadAnalysis, sourceText: string): boolean {
  if (out.budget && !budgetAppearsInText(out.budget.amount, sourceText)) return false;
  return !URL_RE.test(out.summary);
}

export function checkReplyDraft(out: ReplyDraft, language: Locale): boolean {
  if (out.language !== language) return false;
  if (URL_RE.test(out.text)) return false;
  if (language === 'uz' && /[\u0400-\u04FF]/.test(out.text)) return false;
  return true;
}

/** Every number in the summary must be present in the input aggregates (±1 tolerance for rounding). */
export function checkWeeklySummary(out: WeeklySummary, aggregates: unknown): boolean {
  const allowed = collectNumbers(JSON.stringify(aggregates));
  for (const bullet of out.bullets) {
    if (URL_RE.test(bullet)) return false;
    for (const n of collectNumbers(bullet)) {
      if (!allowed.some((a) => Math.abs(a - n) <= 1)) return false;
    }
  }
  return true;
}

function collectNumbers(text: string): number[] {
  return [...text.replace(/(\d)[ \u00a0](?=\d{3}\b)/g, '$1').matchAll(/\d+(?:[.,]\d+)?/g)].map((m) =>
    Number(m[0].replace(',', '.')),
  );
}
