/** Optional (cut-line) features, ADR-020. Disabled via API env DISABLED_FEATURES. */
export const FEATURE_FLAGS = [
  'AUDIT_LOG_UI',
  'WEEKLY_SUMMARY',
  'BUSINESS_HOURS',
  'DAILY_CHART',
  'CSV_IMPORT_PREVIEW',
  'DEAL_SCORE',
] as const;
export type FeatureFlag = (typeof FEATURE_FLAGS)[number];
export type FeatureFlags = Record<FeatureFlag, boolean>;

export function parseDisabledFeatures(raw: string | undefined): FeatureFlags {
  const disabled = new Set(
    (raw ?? '')
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean),
  );
  const flags = {} as FeatureFlags;
  for (const flag of FEATURE_FLAGS) flags[flag] = !disabled.has(flag);
  return flags;
}
