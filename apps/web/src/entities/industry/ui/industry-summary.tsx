import { INDUSTRIES, INDUSTRY_TEMPLATES, localizedLabel, type Industry, type Locale } from '@vippi/shared';
import { useTranslation } from 'react-i18next';

export function useUiLocale(): Locale {
  const { i18n } = useTranslation();
  return i18n.language === 'uz' ? 'uz' : 'ru';
}

/** `<option>`s of the ADR-025 industry catalog in the UI language. */
export function IndustryOptions() {
  const locale = useUiLocale();
  return (
    <>
      {INDUSTRIES.map((code) => (
        <option key={code} value={code}>
          {INDUSTRY_TEMPLATES[code].name[locale]}
        </option>
      ))}
    </>
  );
}

/** What choosing the industry configures: template fields and final status labels. */
export function IndustrySummary({ industry }: { industry: Industry }) {
  const { t } = useTranslation();
  const locale = useUiLocale();
  const tpl = INDUSTRY_TEMPLATES[industry];
  const fields = tpl.fields.map((f) => localizedLabel(f.label, locale) ?? f.key).join(', ');
  const { WON, LOST } = tpl.statusLabels;
  return (
    <div className="rounded-md bg-background-subtle p-3 text-sm" data-testid="industry-summary" aria-live="polite">
      <p className="font-medium">{t('industry.willConfigure')}</p>
      <ul className="mt-1 list-disc pl-5 text-muted-foreground">
        <li>{tpl.preset === 'REAL_ESTATE' ? t('industry.realEstateFields') : fields ? t('industry.fieldsList', { list: fields }) : t('industry.noFields')}</li>
        {WON && LOST ? (
          <li>{t('industry.labelsList', { won: localizedLabel(WON, locale), lost: localizedLabel(LOST, locale) })}</li>
        ) : null}
      </ul>
    </div>
  );
}
