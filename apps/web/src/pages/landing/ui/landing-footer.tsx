import type { MeResponse } from '@vippi/shared';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { homePath } from '@/entities/session';
import { LocaleSwitch } from '@/features/locale-switch';
import { DARK_SWITCH, NAV } from './nav';

const LINK = 'inline-flex min-h-7 items-center rounded-sm text-[#a1a1a6] transition-colors hover:text-[#f5f5f7] hover:underline';
const HAIRLINE = 'border-white/[0.08]';

/** Apple-style minimal dark footer that continues the final CTA: fine print, section links, account links, copyright and language. */
export function LandingFooter({ me }: { me: MeResponse | null | undefined }) {
  const { t } = useTranslation();
  const toDashboard = me?.permissions.includes('dashboard.read');
  return (
    <footer className={`border-t ${HAIRLINE} bg-black px-6 pt-10 pb-8 text-[0.8125rem] text-[#86868b]`}>
      <div className="mx-auto max-w-5xl">
        <div className={`flex flex-col gap-2 border-b ${HAIRLINE} pb-6 leading-relaxed`}>
          <p>{t('landing.fine1')}</p>
          <p>{t('landing.fine2')}</p>
        </div>
        <div className="flex flex-col gap-4 py-5 sm:flex-row sm:justify-between">
          <nav aria-label={t('landing.footerNavLabel')}>
            <ul className="flex flex-wrap gap-x-5">
              {NAV.map(({ href, key }) => (
                <li key={href}>
                  <a href={href} className={LINK}>
                    {t(key)}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <ul className="flex flex-wrap gap-x-5">
            {me ? (
              <li>
                <Link to={homePath(me)} className={LINK}>
                  {t(toDashboard ? 'landing.openDashboard' : 'landing.openLeads')}
                </Link>
              </li>
            ) : (
              <>
                <li>
                  <Link to="/login" className={LINK}>
                    {t('auth.login')}
                  </Link>
                </li>
                <li>
                  <Link to="/register" className={LINK}>
                    {t('landing.register')}
                  </Link>
                </li>
              </>
            )}
          </ul>
        </div>
        <div className={`flex flex-col gap-4 border-t ${HAIRLINE} pt-6 sm:flex-row sm:items-center sm:justify-between`}>
          <span>{t('landing.copyright', { year: new Date().getFullYear() })}</span>
          <LocaleSwitch className={`${DARK_SWITCH} self-start sm:self-auto`} />
        </div>
      </div>
    </footer>
  );
}
