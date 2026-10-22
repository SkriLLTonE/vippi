import { BellRing, Check, Mail, MonitorSmartphone, Send, Sparkles } from 'lucide-react';
import type { CSSProperties, Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/shared/lib';

const SCREEN = 'lp-screen absolute inset-0 px-4';
const idx = (i: number) => ({ '--i': i }) as CSSProperties;

/** Step 2: one lead with the first-response countdown ring; text is driven from the story hook. */
export function SlaScreen({ clockRef }: { clockRef: Ref<HTMLSpanElement> }) {
  const { t } = useTranslation();
  return (
    <div className={cn(SCREEN, 'lp-s1 flex flex-col items-center')}>
      <div className="mt-3 w-full rounded-2xl bg-white p-3 shadow-[0_1px_2px_rgb(0_0_0/0.06)]">
        <div className="text-[0.8125rem] font-semibold">#214 · {t('landing.mock.lead1')}</div>
        <div className="truncate text-[0.6875rem] text-[#6e6e73]">{t('landing.mock.need1')}</div>
      </div>
      <div className="relative mt-8 size-52">
        <svg viewBox="0 0 120 120" className="size-full -rotate-90">
          <circle cx="60" cy="60" r="52" fill="none" stroke="#e8e8ed" strokeWidth="8" />
          <circle className="lp-ring" cx="60" cy="60" r="52" fill="none" stroke="#0071e3" strokeWidth="8" strokeLinecap="round" pathLength={100} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span ref={clockRef} className="lp-clock text-[2.75rem] font-bold tracking-tight tabular">
            15:00
          </span>
          <span className="text-[0.6875rem] text-[#6e6e73]">{t('landing.mock.untilAnswer')}</span>
        </div>
      </div>
      <div className="mt-6 text-center text-[0.75rem] text-[#6e6e73]">{t('landing.mock.businessHours')}</div>
    </div>
  );
}

/** Step 3: breach — notifications drop in on every channel. */
export function BreachScreen() {
  const { t } = useTranslation();
  const items = [
    { icon: BellRing, title: t('landing.bentoNotifyApp') },
    { icon: MonitorSmartphone, title: t('landing.bentoNotifyPush') },
    { icon: Mail, title: t('landing.bentoNotifyEmail') },
  ];
  return (
    <div className={cn(SCREEN, 'lp-s2 -top-9 -bottom-5 bg-linear-to-b from-[#1c1c3a] to-[#0b0b14] pt-9 text-white')}>
      <div className="mt-6 text-center text-[3.25rem] leading-none font-light tabular">9:41</div>
      <div className="mt-1 text-center text-xs text-white/80">{t('landing.mock.lockDate')}</div>
      <ul className="mt-6 flex flex-col gap-2">
        {items.map(({ icon: Icon, title }, i) => (
          <li key={title} className="lp-notif rounded-2xl bg-white/15 p-3 backdrop-blur-xl" style={idx(i)}>
            <div className="flex items-center gap-2 text-[0.6875rem] text-white/80">
              <span className="flex size-5 items-center justify-center rounded-md bg-[#ff453a]">
                <Icon className="size-3 text-white" />
              </span>
              <span className="flex-1 truncate">{title}</span>
              <span>{t('landing.mock.now')}</span>
            </div>
            <div className="mt-1.5 text-[0.8125rem] font-semibold">{t('landing.mock.notifyText')}</div>
            <div className="text-[0.6875rem] text-white/80">{t('landing.mock.notifyMoved')}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Step 4: AI summary and a reply draft that types itself out; the manager sends it. */
export function AiScreen({ draftRef }: { draftRef: Ref<HTMLSpanElement> }) {
  const { t } = useTranslation();
  return (
    <div className={cn(SCREEN, 'lp-s3')}>
      <div className="mt-3 flex items-center gap-2 text-sm font-semibold">
        <span className="flex size-7 items-center justify-center rounded-full bg-linear-to-br from-[#2997ff] to-[#7a7aff] text-white">
          <Sparkles className="size-3.5" />
        </span>
        {t('landing.mock.aiTitle')}
      </div>
      <p className="mt-3 rounded-2xl bg-white p-3 text-[0.75rem] leading-relaxed text-[#424245] shadow-[0_1px_2px_rgb(0_0_0/0.06)]">
        {t('landing.mock.aiSummary')}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {(['aiBudget', 'aiDistrict', 'aiRooms'] as const).map((k) => (
          <span key={k} className="rounded-full bg-[#e8f1fd] px-2.5 py-0.5 text-[0.6875rem] font-medium text-[#0058b0]">
            {t(`landing.mock.${k}`)}
          </span>
        ))}
      </div>
      <div className="mt-3 rounded-2xl bg-white p-3 shadow-[0_1px_2px_rgb(0_0_0/0.06)]">
        <div className="text-[0.6875rem] font-medium text-[#6e6e73]">{t('landing.mock.aiDraftLabel')}</div>
        <p className="mt-1 min-h-[5.5rem] text-[0.8125rem] leading-relaxed">
          <span ref={draftRef}>{t('landing.mock.aiDraft')}</span>
          <span className="lp-caret" />
        </p>
      </div>
      <div className="mt-3 flex items-center justify-between text-[0.6875rem] text-[#6e6e73]">
        <span className="inline-flex items-center gap-1">
          <Check className="size-3 text-[#1a7f37]" />
          {t('landing.mock.aiNote')}
        </span>
        <span className="inline-flex h-7 items-center gap-1 rounded-full bg-[#0071e3] px-3 font-medium text-white">
          <Send className="size-3" />
          {t('landing.mock.aiSend')}
        </span>
      </div>
    </div>
  );
}

const BARS = [38, 62, 30, 88, 52, 44, 70] as const;

/** Step 5: head-of-sales numbers with bars that grow in. */
export function DashScreen() {
  const { t } = useTranslation();
  return (
    <div className={cn(SCREEN, 'lp-s4')}>
      <div className="mt-2 text-[1.5rem] font-bold tracking-tight">{t('landing.mock.navDashboard')}</div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-white p-3 shadow-[0_1px_2px_rgb(0_0_0/0.06)]">
          <div className="text-[0.625rem] text-[#6e6e73]">{t('landing.mock.dashMedian')}</div>
          <div className="text-xl font-bold tabular">{t('landing.mock.dashMedianValue')}</div>
        </div>
        <div className="rounded-2xl bg-white p-3 shadow-[0_1px_2px_rgb(0_0_0/0.06)]">
          <div className="text-[0.625rem] text-[#6e6e73]">{t('landing.mock.dashBreach')}</div>
          <div className="text-xl font-bold text-[#e30000] tabular">{t('landing.mock.dashBreachValue')}</div>
        </div>
      </div>
      <div className="mt-2 rounded-2xl bg-white p-3 shadow-[0_1px_2px_rgb(0_0_0/0.06)]">
        <div className="text-[0.625rem] text-[#6e6e73]">{t('landing.mock.weekChart')}</div>
        <div className="mt-2 flex h-28 items-end gap-1.5">
          {BARS.map((h, i) => (
            <span
              key={i}
              className={cn('lp-bar flex-1 rounded-t-md', i === 3 ? 'bg-[#ff453a]' : 'bg-[#0071e3]')}
              style={{ ...idx(i), height: `${h}%` }}
            />
          ))}
        </div>
      </div>
      <div className="mt-2 flex items-start gap-2 rounded-2xl bg-white p-3 text-[0.6875rem] leading-snug shadow-[0_1px_2px_rgb(0_0_0/0.06)]">
        <Sparkles className="mt-0.5 size-3 shrink-0 text-[#0071e3]" />
        {t('landing.mock.weekly1')}
      </div>
    </div>
  );
}
