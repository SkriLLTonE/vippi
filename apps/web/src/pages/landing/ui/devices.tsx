import { BatteryFull, ChartColumn, Download, Inbox, Signal, Sparkles, TimerOff, Users, Wifi } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/shared/lib';
import { SlaBadge, type SlaTone } from './mockup-cards';

/** iPhone-style frame with a notch; purely decorative. */
export function PhoneFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div aria-hidden className={cn('lp-phone relative w-[19rem] max-w-full', className)}>
      <div className="lp-phone-screen relative overflow-hidden bg-[#f5f5f7] text-[#1d1d1f]">
        <div className="lp-notch absolute top-0 left-1/2 z-10 -translate-x-1/2" />
        <div className="flex h-9 items-center justify-between px-6 pt-1 text-[0.75rem] font-semibold">
          <span className="tabular">9:41</span>
          <span className="flex items-center gap-1">
            <Signal className="size-3" />
            <Wifi className="size-3" />
            <BatteryFull className="size-4" />
          </span>
        </div>
        {children}
        <div className="mx-auto mt-2 mb-2 h-1 w-28 rounded-full bg-[#1d1d1f]/80" />
      </div>
    </div>
  );
}

const ROWS: ReadonlyArray<{ n: number; lead: number; tone: SlaTone }> = [
  { n: 214, lead: 1, tone: 'dueSoon' },
  { n: 213, lead: 2, tone: 'pending' },
  { n: 212, lead: 3, tone: 'breached' },
  { n: 211, lead: 4, tone: 'met' },
];

export function PhoneLeadsScreen() {
  const { t } = useTranslation();
  return (
    <div className="px-4 pb-2">
      <div className="mt-2 text-[1.75rem] leading-tight font-bold tracking-tight">{t('landing.mock.navLeads')}</div>
      <div className="text-xs text-[#6e6e73]">{t('landing.mock.today')}</div>
      <div className="mt-3 flex gap-1.5">
        {(['filterAll', 'filterMine', 'filterOverdue'] as const).map((k, i) => (
          <span
            key={k}
            className={cn(
              'rounded-full px-2.5 py-1 text-[0.6875rem] font-medium whitespace-nowrap',
              i === 0 ? 'bg-[#1d1d1f] text-white' : 'bg-white text-[#6e6e73]',
            )}
          >
            {t(`landing.mock.${k}`)}
          </span>
        ))}
      </div>
      <ul className="mt-3 flex flex-col gap-2">
        {ROWS.map((r) => (
          <li key={r.n} className="rounded-2xl bg-white p-3 shadow-[0_1px_2px_rgb(0_0_0/0.06)]">
            <div className="flex items-center justify-between gap-2 text-[0.8125rem] font-semibold">
              <span className="truncate">{t(`landing.mock.lead${r.lead}`)}</span>
              <span className="shrink-0 text-[0.6875rem] font-normal text-[#6e6e73] tabular">#{r.n}</span>
            </div>
            <div className="mt-0.5 truncate text-[0.6875rem] text-[#6e6e73]">{t(`landing.mock.need${r.lead}`)}</div>
            <div className="mt-2">
              <SlaBadge tone={r.tone} label={t(`landing.mock.sla_${r.tone}`)} />
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex items-center gap-2 rounded-2xl bg-white p-3 text-[0.75rem] shadow-[0_1px_2px_rgb(0_0_0/0.06)]">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#0071e3] text-white">
          <Sparkles className="size-3.5" />
        </span>
        <span className="min-w-0 truncate text-[#1d1d1f]">{t('landing.mock.aiSummary')}</span>
      </div>
    </div>
  );
}

/** Laptop-style frame for the head-of-sales dashboard; purely decorative. */
export function LaptopFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div aria-hidden className={cn('mx-auto w-full max-w-5xl', className)}>
      <div className="lp-laptop-lid mx-auto w-[92%]">
        <div className="overflow-hidden rounded-md bg-white text-[#1d1d1f]">{children}</div>
      </div>
      <div className="lp-laptop-base mx-auto w-full" />
    </div>
  );
}

const MANAGERS = [
  { n: 1, value: 'landing.mock.barValue1', width: 'w-[30%]' },
  { n: 2, value: 'landing.mock.barValue2', width: 'w-[88%]' },
  { n: 3, value: 'landing.mock.barValue3', width: 'w-[45%]' },
] as const;

export function LaptopDashboardScreen() {
  const { t } = useTranslation();
  const nav = [
    { icon: Inbox, label: t('landing.mock.navLeads') },
    { icon: TimerOff, label: t('landing.mock.navOverdue') },
    { icon: ChartColumn, label: t('landing.mock.navDashboard'), active: true },
    { icon: Users, label: t('landing.mock.navTeam') },
  ];
  return (
    <div className="grid text-left sm:grid-cols-[10rem_minmax(0,1fr)]">
      <div className="hidden flex-col gap-1 border-r border-[#e8e8ed] bg-[#f5f5f7] p-3 sm:flex">
        {nav.map(({ icon: Icon, label, active }) => (
          <span
            key={label}
            className={cn(
              'flex items-center gap-2 rounded-md px-2 py-1.5 text-xs',
              active ? 'bg-white font-semibold shadow-[0_1px_2px_rgb(0_0_0/0.08)]' : 'text-[#6e6e73]',
            )}
          >
            <Icon className="size-3.5" />
            <span className="truncate">{label}</span>
          </span>
        ))}
      </div>
      <div className="min-w-0 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-base font-bold tracking-tight">{t('landing.mock.navDashboard')}</span>
          <span className="inline-flex items-center gap-1 rounded-full border border-[#d2d2d7] px-2.5 py-1 text-[0.6875rem]">
            <Download className="size-3" />
            CSV
          </span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {[
            { label: t('landing.mock.dashMedian'), value: t('landing.mock.dashMedianValue') },
            { label: t('landing.mock.dashBreach'), value: t('landing.mock.dashBreachValue'), danger: true },
            { label: t('landing.mock.navOverdue'), value: '3', danger: true },
          ].map((k) => (
            <div key={k.label} className="rounded-xl bg-[#f5f5f7] p-2.5 sm:p-3">
              <div className="truncate text-[0.625rem] text-[#6e6e73] sm:text-[0.6875rem]">{k.label}</div>
              <div className={cn('text-lg font-bold tracking-tight tabular sm:text-2xl', k.danger && 'text-[#e30000]')}>{k.value}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <div className="rounded-xl bg-[#f5f5f7] p-3">
            <div className="text-[0.6875rem] font-medium text-[#6e6e73]">{t('landing.mock.dashByManager')}</div>
            <div className="mt-2 flex flex-col gap-2">
              {MANAGERS.map((m) => (
                <div key={m.n} className="grid grid-cols-[4.5rem_1fr_2.75rem] items-center gap-2 text-xs">
                  <span className="truncate">{t(`landing.mock.manager${m.n}`)}</span>
                  <span className="h-1.5 rounded-full bg-[#e8e8ed]">
                    <span className={cn('block h-1.5 rounded-full', m.n === 2 ? 'bg-[#ff453a]' : 'bg-[#0071e3]', m.width)} />
                  </span>
                  <span className="text-right text-[0.6875rem] text-[#6e6e73] tabular">{t(m.value)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="hidden rounded-xl bg-[#f5f5f7] p-3 md:block">
            <div className="flex items-center gap-1.5 text-[0.6875rem] font-medium text-[#6e6e73]">
              <Sparkles className="size-3 text-[#0071e3]" />
              {t('landing.mock.weeklyTitle')}
            </div>
            <ul className="mt-2 flex list-disc flex-col gap-1 pl-4 text-[0.6875rem] leading-snug">
              <li>{t('landing.mock.weekly1')}</li>
              <li>{t('landing.mock.weekly2')}</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
