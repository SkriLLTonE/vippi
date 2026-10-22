import { useEffect, useRef, type RefObject } from 'react';

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
const scrollTimelines = () => typeof CSS !== 'undefined' && (CSS.supports?.('animation-timeline: view()') ?? false);

/**
 * Enables entrance motion under `root`: adds `.lp-js` (CSS hides elements only then, so no-JS stays readable)
 * and sets `[data-shown]` once elements enter the viewport. `.lp-words`/`.lp-io` always use the observer;
 * `.lp-reveal`/`.lp-grow` only when CSS scroll-driven animations are unsupported.
 */
export function useLandingMotion(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current;
    if (!el || prefersReducedMotion() || typeof IntersectionObserver === 'undefined') return;
    el.classList.add('lp-js');
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.setAttribute('data-shown', '');
          io.unobserve(e.target);
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.2 },
    );
    const selector = scrollTimelines() ? '.lp-words, .lp-io' : '.lp-words, .lp-io, .lp-reveal, .lp-grow';
    for (const t of el.querySelectorAll(selector)) io.observe(t);
    return () => {
      io.disconnect();
      el.classList.remove('lp-js');
    };
  }, [root]);
}

/**
 * Reports how far a tall section has been scrolled through (0…1) while its sticky child is pinned.
 * Calls `onProgress` at most once per frame and never re-renders React. Not run under reduced motion.
 */
export function useStickyProgress(section: RefObject<HTMLElement | null>, onProgress: (p: number) => void) {
  const callback = useRef(onProgress);
  useEffect(() => {
    callback.current = onProgress;
  });
  useEffect(() => {
    const el = section.current;
    if (!el || prefersReducedMotion()) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = el.getBoundingClientRect();
      const travel = rect.height - window.innerHeight;
      callback.current(travel > 0 ? Math.min(1, Math.max(0, -rect.top / travel)) : 0);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [section]);
}

/** Scrolls so that step `index` of `count` in a sticky section is active. */
export function scrollToStep(section: HTMLElement | null, index: number, count: number) {
  if (!section) return;
  const travel = section.offsetHeight - window.innerHeight;
  const top = section.getBoundingClientRect().top + window.scrollY + (travel * (index + 0.5)) / count;
  window.scrollTo({ top, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
}
