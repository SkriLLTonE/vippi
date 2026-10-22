import {
  ArrowDown,
  BellRing,
  ChartColumn,
  ChevronRight,
  FileSpreadsheet,
  Globe,
  Inbox,
  PenLine,
  Sparkles,
  Timer,
  UserRound,
  Webhook,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/shared/lib';
import { scrollToStep, useStickyProgress } from '../lib/use-landing-motion';
import { RevealWords } from './reveal-words';

type NodeId = 'api' | 'webhook' | 'csv' | 'manual' | 'lead' | 'manager' | 'sla' | 'notify' | 'ai' | 'dash';

const NODES: Record<NodeId, { x: number; y: number; step: number; icon: LucideIcon }> = {
  api: { x: 10, y: 14, step: 0, icon: Globe },
  webhook: { x: 10, y: 38, step: 0, icon: Webhook },
  csv: { x: 10, y: 62, step: 0, icon: FileSpreadsheet },
  manual: { x: 10, y: 86, step: 0, icon: PenLine },
  lead: { x: 36, y: 50, step: 0, icon: Inbox },
  manager: { x: 60, y: 18, step: 1, icon: UserRound },
  sla: { x: 60, y: 50, step: 1, icon: Timer },
  notify: { x: 60, y: 82, step: 2, icon: BellRing },
  ai: { x: 36, y: 86, step: 2, icon: Sparkles },
  dash: { x: 87, y: 50, step: 3, icon: ChartColumn },
};

const LINES: ReadonlyArray<[NodeId, NodeId, number]> = [
  ['api', 'lead', 0],
  ['webhook', 'lead', 0],
  ['csv', 'lead', 0],
  ['manual', 'lead', 0],
  ['lead', 'manager', 1],
  ['lead', 'sla', 1],
  ['sla', 'notify', 2],
  ['lead', 'ai', 2],
  ['manager', 'dash', 3],
  ['sla', 'dash', 3],
  ['notify', 'dash', 3],
];

/** Cards that fly from their node into the dashboard on the last step (offsets in container units). */
const FLY: ReadonlyArray<{ from: NodeId; key: string; dy: number }> = [
  { from: 'manager', key: 'landing.mock.dashMedianValue', dy: -10 },
  { from: 'sla', key: 'landing.mock.dashBreachValue', dy: 0 },
  { from: 'notify', key: 'landing.graph.flyOverdue', dy: 10 },
];

const STEPS = 4;
const curve = (a: NodeId, b: NodeId) => {
  const p = NODES[a];
  const q = NODES[b];
  const mx = (p.x + q.x) / 2;
  return p.x === q.x ? `M${p.x} ${p.y} L${q.x} ${q.y}` : `M${p.x} ${p.y} C${mx} ${p.y} ${mx} ${q.y} ${q.x} ${q.y}`;
};

function GraphStage({ step }: { step: number }) {
  const { t } = useTranslation();
  return (
    <div aria-hidden className="lp-graph-stage relative h-[min(36rem,70svh)] w-full">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
        {LINES.map(([a, b, s]) => (
          <g key={`${a}-${b}`}>
            <path d={curve(a, b)} fill="none" stroke="#2c2c2e" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
            <path
              className="lp-line"
              data-on={step >= s || undefined}
              d={curve(a, b)}
              fill="none"
              stroke="#2997ff"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
            <path
              className="lp-flow"
              data-on={step >= s || undefined}
              d={curve(a, b)}
              fill="none"
              stroke="#f5f5f7"
              strokeWidth={2}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </g>
        ))}
      </svg>
      {(Object.keys(NODES) as NodeId[]).map((id) => {
        const n = NODES[id];
        const Icon = n.icon;
        const dash = id === 'dash';
        return (
          <div
            key={id}
            className={cn(
              'lp-node absolute rounded-2xl border border-white/10 bg-[#161617] text-[#f5f5f7]',
              dash ? 'flex h-[44%] w-[22%] flex-col p-3' : 'flex items-center gap-2 px-3 py-2',
            )}
            style={{ left: `${n.x}%`, top: `${n.y}%` }}
            data-on={step >= n.step || undefined}
            data-now={step === n.step || undefined}
          >
            <span className={cn('flex items-center gap-2', dash && 'mb-2')}>
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#2997ff]/15 text-[#2997ff]">
                <Icon className="size-3.5" />
              </span>
              <span className="text-[0.8125rem] font-semibold whitespace-nowrap">{t(`landing.graph.n_${id}`)}</span>
            </span>
            {id === 'sla' ? <span className="ml-1 text-[0.8125rem] font-bold text-[#ff9f0a] tabular">15:00</span> : null}
            {dash
              ? [0, 1, 2].map((i) => <span key={i} className="mt-1.5 h-[22%] rounded-lg border border-dashed border-white/15" />)
              : null}
          </div>
        );
      })}
      {FLY.map(({ from, key, dy }, i) => {
        const n = NODES[from];
        const style = {
          left: `${n.x}%`,
          top: `${n.y}%`,
          '--i': i,
          '--dx': `${NODES.dash.x - n.x}cqw`,
          '--dy': `calc(${NODES.dash.y - n.y + dy}cqh + 0.9rem)`,
        } as CSSProperties;
        return (
          <span key={from} className="lp-chip-fly absolute -mt-3 -ml-14 w-28 rounded-lg bg-[#0071e3] px-2 py-1 text-center text-xs font-semibold whitespace-nowrap text-white" style={style}>
            {t(key)}
          </span>
        );
      })}
      <span className="lp-shimmer absolute top-0 left-1/2 rounded-full border border-white/10 px-4 py-1.5 text-xs text-[#d2d2d7]">
        {t('landing.graph.loading')}
      </span>
    </div>
  );
}

const MOBILE: ReadonlyArray<{ from: NodeId[]; to: NodeId[] }> = [
  { from: ['api', 'webhook', 'csv', 'manual'], to: ['lead'] },
  { from: ['lead'], to: ['manager', 'sla'] },
  { from: ['sla'], to: ['notify', 'ai'] },
  { from: ['manager', 'sla', 'notify'], to: ['dash'] },
];

function Chip({ id, i }: { id: NodeId; i: number }) {
  const { t } = useTranslation();
  const Icon = NODES[id].icon;
  return (
    <span className="lp-chip inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-[#f5f5f7]" style={{ '--i': i } as CSSProperties}>
      <Icon className="size-3.5 text-[#2997ff]" aria-hidden />
      {t(`landing.graph.n_${id}`)}
    </span>
  );
}

/**
 * Atlassian-style pinned sequence: connected nodes light up and rearrange step by step while the
 * step list on the left tracks progress. Phones get a stacked version revealed on scroll.
 */
export function ContextGraph() {
  const { t } = useTranslation();
  const track = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const last = useRef(0);
  const timer = useRef(0);

  const onProgress = useCallback((p: number) => {
    const f = p * STEPS;
    const s = Math.min(STEPS - 1, Math.floor(f));
    stage.current?.style.setProperty('--sp', Math.min(1, f - s).toFixed(3));
    if (s === last.current) return;
    last.current = s;
    setStep(s);
    setLoading(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setLoading(false), 900);
  }, []);
  useStickyProgress(track, onProgress);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <section id="flow" aria-labelledby="lp-graph-title" className="scroll-mt-12 bg-black">
      <div className="mx-auto max-w-4xl px-6 pt-28 text-center sm:pt-40">
        <p className="text-sm font-semibold tracking-wide text-[#a1a1a6] uppercase">{t('landing.graph.eyebrow')}</p>
        <h2 id="lp-graph-title" className="mt-4 text-[2.25rem] leading-[1.05] font-bold tracking-[-0.035em] text-[#f5f5f7] sm:text-6xl lg:text-7xl">
          <RevealWords text={t('landing.graph.title')} accent={t('landing.graph.titleAccent')} />
        </h2>
        <p className="lp-reveal mx-auto mt-6 max-w-2xl text-base leading-relaxed text-[#a1a1a6] sm:text-xl">{t('landing.graph.text')}</p>
      </div>

      <div ref={track} className="lp-track relative hidden h-[440vh] lg:block">
        <div
          ref={stage}
          className="lp-graph lp-sticky sticky top-0 flex h-svh items-center pt-11"
          data-step={step}
          data-loading={loading || undefined}
        >
          <div className="mx-auto grid w-full max-w-6xl grid-cols-[21rem_minmax(0,1fr)] items-center gap-14 px-6">
            <div>
              <a href="#lp-after-graph" className="inline-flex min-h-7 items-center gap-0.5 rounded-md text-sm font-medium text-[#2997ff] hover:underline">
                {t('landing.graph.skip')}
                <ChevronRight className="size-4" aria-hidden />
              </a>
              <ol className="mt-6 flex flex-col gap-1">
                {Array.from({ length: STEPS }, (_, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      className="lp-gstep group relative w-full rounded-xl py-3 pr-2 pl-6 text-left"
                      aria-current={step === i ? 'step' : undefined}
                      data-done={i < step || undefined}
                      onClick={() => scrollToStep(track.current, i, STEPS)}
                    >
                      <span aria-hidden className="absolute top-3 bottom-3 left-0 w-0.5 overflow-hidden rounded-full bg-white/15">
                        <span className="lp-gstep-fill block size-full bg-[#2997ff]" />
                      </span>
                      <span
                        className={cn(
                          'block text-xl font-semibold tracking-tight transition-colors',
                          step === i ? 'text-[#f5f5f7]' : 'text-[#86868b] group-hover:text-[#d2d2d7]',
                        )}
                      >
                        {t(`landing.graph.step${i + 1}Title`)}
                      </span>
                      <span className="lp-gstep-body">
                        <span className="block overflow-hidden">
                          <span className="block pt-2 text-[0.9375rem] leading-relaxed text-[#a1a1a6]">{t(`landing.graph.step${i + 1}Text`)}</span>
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </div>
            <GraphStage step={step} />
          </div>
        </div>
      </div>

      <ol className="mx-auto flex max-w-xl flex-col gap-4 px-6 pt-14 lg:hidden">
        {MOBILE.map(({ from, to }, i) => (
          <li key={i} className="lp-io rounded-3xl bg-[#161617] p-6">
            <span className="text-xs font-semibold text-[#2997ff] tabular">{`0${i + 1}`}</span>
            <h3 className="mt-1 text-2xl font-bold tracking-tight text-[#f5f5f7]">{t(`landing.graph.step${i + 1}Title`)}</h3>
            <p className="mt-2 text-[0.9375rem] leading-relaxed text-[#a1a1a6]">{t(`landing.graph.step${i + 1}Text`)}</p>
            <div aria-hidden className="mt-5 flex flex-col items-center gap-2">
              <div className="flex flex-wrap justify-center gap-2">
                {from.map((id, j) => (
                  <Chip key={id} id={id} i={j} />
                ))}
              </div>
              <ArrowDown className="lp-chip size-4 text-[#86868b]" style={{ '--i': from.length } as CSSProperties} />
              <div className="flex flex-wrap justify-center gap-2">
                {to.map((id, j) => (
                  <Chip key={id} id={id} i={from.length + 1 + j} />
                ))}
              </div>
            </div>
          </li>
        ))}
      </ol>
      <div id="lp-after-graph" className="h-px scroll-mt-12" />
    </section>
  );
}
