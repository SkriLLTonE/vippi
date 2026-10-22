import { Check, Clock3, TriangleAlert } from 'lucide-react';
import { cn } from '@/shared/lib';

export type SlaTone = 'breached' | 'dueSoon' | 'pending' | 'met';

const SLA_STYLE: Record<SlaTone, string> = {
  breached: 'bg-[#ffe5e3] text-[#c4160a]',
  dueSoon: 'bg-[#fff3d6] text-[#a05a00]',
  pending: 'bg-[#f0f0f5] text-[#515154]',
  met: 'bg-[#e3f7e8] text-[#1a7f37]',
};

/** SLA countdown chip as it looks in the real leads list; `dueSoon` pulses. */
export function SlaBadge({ tone, label }: { tone: SlaTone; label: string }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold whitespace-nowrap tabular',
        SLA_STYLE[tone],
      )}
    >
      {tone === 'dueSoon' ? (
        <span className="relative flex size-1.5">
          <span className="lp-ping absolute inline-flex size-full rounded-full bg-[#ff9f0a]" />
          <span className="relative inline-flex size-1.5 rounded-full bg-[#ff9f0a]" />
        </span>
      ) : tone === 'breached' ? (
        <TriangleAlert className="size-3" />
      ) : tone === 'met' ? (
        <Check className="size-3" />
      ) : (
        <Clock3 className="size-3" />
      )}
      {label}
    </span>
  );
}
