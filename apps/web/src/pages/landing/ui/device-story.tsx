import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useStickyProgress } from '../lib/use-landing-motion';
import { PhoneFrame, PhoneLeadsScreen } from './devices';
import { AiScreen, BreachScreen, DashScreen, SlaScreen } from './phone-screens';

const STEPS = 5;
const SLA_SECONDS = 15 * 60;
const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Apple-style pinned sequence: the phone stays in place while scrolling switches its screen
 * (leads → countdown hits zero → breach notifications → AI draft types out → dashboard grows)
 * and the caption next to it. All captions are real text in reading order.
 */
export function DeviceStory() {
  const { t } = useTranslation();
  const track = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const clock = useRef<HTMLSpanElement>(null);
  const draft = useRef<HTMLSpanElement>(null);
  const draftText = t('landing.mock.aiDraft');

  const onProgress = useCallback(
    (p: number) => {
      const el = stage.current;
      if (!el) return;
      const f = p * STEPS;
      const step = Math.min(STEPS - 1, Math.floor(f));
      const sp = Math.min(1, f - step);
      const intro = Math.min(1, f);
      el.style.setProperty('--zoom', (0.8 + 0.2 * intro).toFixed(3));
      el.style.setProperty('--tilt', (-18 * (1 - intro)).toFixed(2));
      const ring = step < 1 ? 0 : step > 1 ? 1 : Math.min(1, sp * 1.2);
      el.style.setProperty('--ring', ring.toFixed(3));
      if (el.dataset.step !== String(step)) el.dataset.step = String(step);
      const secs = Math.round(SLA_SECONDS * (1 - ring));
      if (clock.current) clock.current.textContent = `${pad(Math.floor(secs / 60))}:${pad(secs % 60)}`;
      el.toggleAttribute('data-breached', ring >= 1);
      if (draft.current) {
        const n = step < 3 ? 0 : step > 3 ? draftText.length : Math.ceil(draftText.length * Math.min(1, sp * 1.3));
        draft.current.textContent = draftText.slice(0, n);
      }
    },
    [draftText],
  );
  useStickyProgress(track, onProgress);

  return (
    <section ref={track} id="story" aria-labelledby="lp-story-title" className="lp-track relative h-[560vh] scroll-mt-12 bg-black">
      <div ref={stage} data-step="0" className="lp-story lp-sticky sticky top-0 flex h-svh items-center overflow-hidden pt-11">
        <div aria-hidden className="lp-glow pointer-events-none absolute inset-0 opacity-60" />
        <div className="relative mx-auto grid w-full max-w-6xl items-center gap-4 px-6 lg:grid-cols-2 lg:gap-16">
          <div className="order-2 text-center lg:order-1 lg:text-left">
            <h2 id="lp-story-title" className="text-sm font-semibold tracking-wide text-[#a1a1a6] uppercase">
              {t('landing.storyEyebrow')}
            </h2>
            <div className="lp-caps mt-3 grid">
              {Array.from({ length: STEPS }, (_, i) => (
                <div key={i} className={`lp-cap lp-s${i} [grid-area:1/1]`}>
                  <h3 className="text-[1.9rem] leading-[1.08] font-bold tracking-[-0.03em] text-balance text-[#f5f5f7] sm:text-5xl lg:text-6xl">
                    {t(`landing.story${i + 1}Title`)}
                  </h3>
                  <p className="mx-auto mt-3 max-w-md text-[0.9375rem] leading-relaxed text-[#a1a1a6] sm:mt-5 sm:text-lg lg:mx-0">
                    {t(`landing.story${i + 1}Text`)}
                  </p>
                </div>
              ))}
            </div>
            <div aria-hidden className="lp-story-dots mt-6 flex justify-center gap-2.5 lg:justify-start">
              {Array.from({ length: STEPS }, (_, i) => (
                <span key={i} className={`lp-dot lp-d${i} size-2 rounded-full bg-[#f5f5f7]`} />
              ))}
            </div>
          </div>
          <div className="order-1 flex justify-center lg:order-2">
            <div className="max-sm:-my-16 max-sm:scale-[0.74]">
              <div className="lp-story-phone">
                <PhoneFrame>
                  <div className="relative h-[33rem]">
                    <div className="lp-screen lp-s0 absolute inset-0">
                      <PhoneLeadsScreen />
                    </div>
                    <SlaScreen clockRef={clock} />
                    <BreachScreen />
                    <AiScreen draftRef={draft} />
                    <DashScreen />
                  </div>
                </PhoneFrame>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
