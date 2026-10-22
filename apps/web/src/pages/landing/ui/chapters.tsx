import type { MeResponse } from '@vippi/shared';
import { BellRing, Download, Hand, Inbox, Languages, Plus, ScrollText, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/shared/lib';
import { AuthActions } from './auth-actions';
import { LaptopDashboardScreen, LaptopFrame } from './devices';
import { RevealWords } from './reveal-words';

const EYEBROW_DARK = 'text-sm font-semibold tracking-wide text-[#a1a1a6] uppercase';
const EYEBROW_LIGHT = 'text-sm font-semibold tracking-wide text-[#6e6e73] uppercase';
const H2 = 'mt-4 text-[2.25rem] leading-[1.05] font-bold tracking-[-0.035em] text-balance sm:text-6xl lg:text-7xl';

export function NumbersChapter() {
  const { t } = useTranslation();
  return (
    <section id="numbers" aria-labelledby="lp-numbers-title" className="scroll-mt-12 bg-[#f5f5f7] px-6 py-28 text-[#1d1d1f] sm:py-40">
      <div className="mx-auto max-w-6xl">
        <h2 id="lp-numbers-title" className={cn(EYEBROW_LIGHT, 'text-center')}>
          {t('landing.numbersTitle')}
        </h2>
        <dl className="mt-10 flex flex-col">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className={cn(
                'lp-grow flex flex-col items-center border-b border-[#d2d2d7] py-14 text-center last:border-0 sm:py-20',
                i % 2 === 0 && 'lg:items-end lg:text-right',
                i % 2 === 1 && 'lg:items-start lg:text-left',
              )}
            >
              <dt className="order-2 mt-3 max-w-md text-lg leading-snug text-[#6e6e73] sm:text-2xl">{t(`landing.number${i}Label`)}</dt>
              <dd className="lp-gradient-deep order-1 text-[4.5rem] leading-none font-bold tracking-[-0.05em] whitespace-nowrap sm:text-[8rem] lg:text-[11rem]">
                {t(`landing.number${i}Value`)}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

export function LaptopChapter() {
  const { t } = useTranslation();
  return (
    <section id="dashboard" aria-labelledby="lp-dash-title" className="scroll-mt-12 overflow-hidden bg-white px-6 py-28 text-[#1d1d1f] sm:py-40">
      <div className="mx-auto max-w-4xl text-center">
        <p className={EYEBROW_LIGHT}>{t('landing.dashEyebrow')}</p>
        <h2 id="lp-dash-title" className={H2}>
          <RevealWords text={t('landing.dashTitle')} accent={t('landing.dashTitleAccent')} light />
        </h2>
        <p className="lp-reveal mx-auto mt-6 max-w-2xl text-base leading-relaxed text-[#6e6e73] sm:text-xl">{t('landing.dashText')}</p>
      </div>
      <div className="lp-grow mt-16 sm:mt-24">
        <LaptopFrame>
          <LaptopDashboardScreen />
        </LaptopFrame>
      </div>
    </section>
  );
}

const TILES: ReadonlyArray<{ icon: LucideIcon; key: string; wide?: boolean }> = [
  { icon: Inbox, key: 'tileIntake', wide: true },
  { icon: Hand, key: 'tileAssign' },
  { icon: BellRing, key: 'tileNotify' },
  { icon: Languages, key: 'tileLang' },
  { icon: ScrollText, key: 'tileAudit' },
  { icon: Download, key: 'tileExport', wide: true },
];

export function TilesChapter() {
  const { t } = useTranslation();
  return (
    <section id="features" aria-labelledby="lp-tiles-title" className="scroll-mt-12 bg-black px-6 py-28 sm:py-40">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-3xl text-center">
          <p className={EYEBROW_DARK}>{t('landing.tilesEyebrow')}</p>
          <h2 id="lp-tiles-title" className={cn(H2, 'text-[#f5f5f7]')}>
            <RevealWords text={t('landing.tilesTitle')} />
          </h2>
        </div>
        <ul className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {TILES.map(({ icon: Icon, key, wide }) => (
            <li key={key} className={cn('lp-reveal flex flex-col rounded-[1.75rem] bg-[#161617] p-7 sm:p-8', wide && 'lg:col-span-2')}>
              <span className="flex size-14 items-center justify-center rounded-2xl bg-linear-to-br from-[#2997ff] to-[#7a7aff] text-white">
                <Icon className="size-7" aria-hidden />
              </span>
              <h3 className="mt-8 text-2xl font-bold tracking-tight text-[#f5f5f7]">{t(`landing.${key}Title`)}</h3>
              <p className="mt-2 text-[0.9375rem] leading-relaxed text-[#a1a1a6]">{t(`landing.${key}Text`)}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function SpecsChapter() {
  const { t } = useTranslation();
  return (
    <section id="specs" aria-labelledby="lp-specs-title" className="scroll-mt-12 bg-[#f5f5f7] px-6 py-28 text-[#1d1d1f] sm:py-40">
      <div className="mx-auto max-w-5xl">
        <p className={EYEBROW_LIGHT}>{t('landing.specsEyebrow')}</p>
        <h2 id="lp-specs-title" className={H2}>
          <RevealWords text={t('landing.specsTitle')} />
        </h2>
        <dl className="mt-14 border-t border-[#d2d2d7]">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="lp-reveal grid gap-3 border-b border-[#d2d2d7] py-7 sm:grid-cols-[16rem_1fr] sm:gap-8">
              <dt className="text-lg font-semibold">{t(`landing.spec${i}Label`)}</dt>
              <dd>
                <ul className="flex flex-col gap-1.5 text-[0.9375rem] leading-relaxed text-[#424245]">
                  {(['a', 'b', 'c'] as const).map((s) => (
                    <li key={s}>{t(`landing.spec${i}${s}`)}</li>
                  ))}
                </ul>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

const ROLES = [
  { role: 'MANAGER', key: 'roleManagerText' },
  { role: 'HEAD_OF_SALES', key: 'roleHeadText' },
  { role: 'OWNER', key: 'roleOwnerText' },
] as const;

export function RolesChapter() {
  const { t } = useTranslation();
  return (
    <section id="roles" aria-labelledby="lp-roles-title" className="scroll-mt-12 bg-black px-6 py-28 sm:py-40">
      <div className="mx-auto max-w-6xl text-center">
        <p className={EYEBROW_DARK}>{t('landing.rolesEyebrow')}</p>
        <h2 id="lp-roles-title" className={cn(H2, 'text-[#f5f5f7]')}>
          <RevealWords text={t('landing.rolesTitle')} />
        </h2>
        <ul className="mt-16 grid gap-10 md:grid-cols-3 md:gap-8">
          {ROLES.map(({ role, key }) => (
            <li key={role} className="lp-reveal">
              <h3 className="lp-gradient-text inline-block text-3xl font-bold tracking-tight">{t(`role.${role}`)}</h3>
              <p className="mx-auto mt-3 max-w-xs text-[0.9375rem] leading-relaxed text-[#a1a1a6]">{t(`landing.${key}`)}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function FaqChapter() {
  const { t } = useTranslation();
  return (
    <section id="faq" aria-labelledby="lp-faq-title" className="scroll-mt-12 border-t border-white/[0.08] bg-black px-6 pt-28 pb-12 text-[#f5f5f7] sm:pt-40 sm:pb-16">
      <div className="mx-auto max-w-3xl">
        <h2 id="lp-faq-title" className={cn(H2, 'mt-0 text-center')}>
          <RevealWords text={t('landing.faqTitle')} />
        </h2>
        <div className="mt-14 border-t border-white/[0.12]">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <details key={i} className="group border-b border-white/[0.12]">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 rounded-md py-6 text-lg font-semibold transition-colors hover:text-white sm:text-xl [&::-webkit-details-marker]:hidden">
                {t(`landing.faq${i}Q`)}
                <Plus className="size-5 shrink-0 text-[#a1a1a6] transition-transform duration-300 group-open:rotate-45" aria-hidden />
              </summary>
              <p className="pb-6 text-base leading-relaxed text-[#a1a1a6]">{t(`landing.faq${i}A`)}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FinalCta({ me, pending }: { me: MeResponse | null | undefined; pending: boolean }) {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="lp-cta-title" className="relative overflow-hidden bg-black px-6 pt-20 pb-32 text-center sm:pt-28 sm:pb-48">
      <div aria-hidden className="lp-glow pointer-events-none absolute inset-x-0 bottom-0 h-2/3 opacity-70" />
      <div className="relative mx-auto max-w-4xl">
        <h2 id="lp-cta-title" className="text-[2.75rem] leading-[1.02] font-bold tracking-[-0.045em] text-[#f5f5f7] sm:text-7xl lg:text-8xl">
          {me ? (
            <RevealWords text={t('landing.ctaSignedInTitle')} />
          ) : (
            <RevealWords text={t('landing.ctaTitle')} accent={t('landing.ctaTitleAccent')} />
          )}
        </h2>
        <p className="lp-reveal mx-auto mt-6 max-w-xl text-lg leading-relaxed text-[#a1a1a6] sm:text-2xl">{t('landing.ctaText')}</p>
        <div className="mt-12 flex justify-center">
          <AuthActions me={me} pending={pending} place="cta" />
        </div>
      </div>
    </section>
  );
}
