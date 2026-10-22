import i18n from 'i18next';
import { LOCALES, OVERRIDABLE_STATUSES, localizedLabel, type Locale, type OverridableStatus, type StatusLabels } from '@vippi/shared';
import ru from './locales/ru.json';
import uz from './locales/uz.json';

/** Keys that name a final status; hints reference `lead.status.*` via `$t()` nesting. */
const STATUS_KEYS: Record<OverridableStatus, string[]> = {
  WON: ['lead.status.WON', 'dashboard.won', 'dashboard.kpi.won', 'myStats.kpi.won'],
  LOST: ['lead.status.LOST', 'dashboard.kpi.lost'],
};

function bundleValue(bundle: unknown, key: string): string {
  let node: unknown = bundle;
  for (const part of key.split('.')) node = (node as Record<string, unknown> | undefined)?.[part];
  return typeof node === 'string' ? node : key;
}

/** Snapshot taken at import: i18next stores the bundle objects by reference and `addResource` mutates them. */
const DEFAULTS: Record<Locale, Record<string, string>> = { ru: {}, uz: {} };
for (const [locale, bundle] of [
  ['ru', ru],
  ['uz', uz],
] as const) {
  for (const key of Object.values(STATUS_KEYS).flat()) DEFAULTS[locale][key] = bundleValue(bundle, key);
}

export function defaultStatusLabel(status: OverridableStatus, locale: Locale): string {
  return DEFAULTS[locale][`lead.status.${status}`] ?? status;
}

/**
 * ADR-024: applies the organization's WON/LOST names to the i18next resources (empty labels restore defaults).
 * Changed keys emit `added`, which re-renders `useTranslation` consumers (`bindI18nStore: 'added'`).
 */
export function applyStatusLabels(labels: StatusLabels | null | undefined): void {
  for (const locale of LOCALES) {
    for (const status of OVERRIDABLE_STATUSES) {
      const custom = localizedLabel(labels?.[status], locale);
      for (const key of STATUS_KEYS[status]) {
        const value = custom ?? DEFAULTS[locale][key] ?? key;
        if (i18n.getResource(locale, 'translation', key) !== value) i18n.addResource(locale, 'translation', key, value);
      }
    }
  }
}
