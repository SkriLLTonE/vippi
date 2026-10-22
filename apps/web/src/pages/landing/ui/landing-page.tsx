import type { CSSProperties } from 'react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useMeQuery } from '@/entities/session';
import { LocaleSwitch } from '@/features/locale-switch';
import { useLandingMotion } from '../lib/use-landing-motion';
import { AuthActions, LogoutButton } from './auth-actions';
import { Brand } from './brand';
import { FaqChapter, FinalCta, LaptopChapter, NumbersChapter, RolesChapter, SpecsChapter, TilesChapter } from './chapters';
import { ContextGraph } from './context-graph';
import { DeviceStory } from './device-story';
import { PhoneFrame, PhoneLeadsScreen } from './devices';
import { LandingFooter } from './landing-footer';
import { DARK_SWITCH, NAV } from './nav';
import './landing.css';

const delay = (ms: number) => ({ '--lp-delay': `${ms}ms` }) as CSSProperties;

export function LandingPage() {
  const { t } = useTranslation();
  const me = useMeQuery();
  const session = me.data;
  const pending = me.isPending;
  const root = useRef<HTMLDivElement>(null);
  useLandingMotion(root);

  return (
    <div ref={root} className="lp-root min-h-dvh overflow-x-clip bg-black text-[#f5f5f7]">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-black/70 backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto flex h-12 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex items-center gap-8">
            <Brand compact />
            <nav aria-label={t('landing.navLabel')} className="max-lg:hidden">
              <ul className="flex items-center gap-1">
                {NAV.map(({ href, key }) => (
                  <li key={href}>
                    <a href={href} className="inline-flex min-h-7 items-center rounded-md px-2.5 text-xs whitespace-nowrap text-[#d2d2d7] transition-colors hover:text-white">
                      {t(key)}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <LocaleSwitch className={`${DARK_SWITCH} max-sm:hidden`} />
            <AuthActions me={session} pending={pending} place="header" />
            {session ? <LogoutButton /> : null}
          </div>
        </div>
      </header>

      <main>
        <section className="relative flex min-h-svh flex-col items-center overflow-hidden px-6 pt-28 text-center sm:pt-36">
          <div aria-hidden className="lp-glow pointer-events-none absolute inset-x-0 bottom-0 h-[70%]" />
          <p className="lp-intro relative text-lg font-semibold text-[#f5f5f7] sm:text-2xl">Vippi Leads</p>
          <h1 className="relative mt-2 text-[2.75rem] leading-[1.02] font-bold tracking-[-0.045em] sm:text-7xl lg:text-[7.25rem]">
            <span className="lp-intro block" style={delay(120)}>
              {t('landing.titleLead')}
            </span>{' '}
            <span className="lp-intro lp-gradient-text block pb-[0.08em]" style={delay(280)}>
              {t('landing.titleAccent')}
            </span>
          </h1>
          <p className="lp-intro relative mt-6 max-w-2xl text-lg leading-relaxed text-pretty text-[#a1a1a6] sm:text-2xl" style={delay(440)}>
            {t('landing.subtitle')}
          </p>
          <div className="lp-intro relative mt-10 flex flex-col items-center gap-4" style={delay(600)}>
            <AuthActions me={session} pending={pending} place="hero" />
            {session ? (
              <p className="text-sm text-[#a1a1a6]">
                {t('landing.signedInAs', { name: session.user.fullName, organization: session.organization.name })}
              </p>
            ) : null}
          </div>
          <div className="lp-device-in relative mt-16 sm:mt-20">
            <div className="lp-tilt">
              <PhoneFrame>
                <PhoneLeadsScreen />
              </PhoneFrame>
            </div>
          </div>
        </section>

        <DeviceStory />
        <NumbersChapter />
        <ContextGraph />
        <LaptopChapter />
        <TilesChapter />
        <SpecsChapter />
        <RolesChapter />
        <FaqChapter />
        <FinalCta me={session} pending={pending} />
      </main>

      <LandingFooter me={session} />
    </div>
  );
}
