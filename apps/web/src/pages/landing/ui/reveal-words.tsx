import type { CSSProperties } from 'react';
import { cn } from '@/shared/lib';

const delay = (i: number) => ({ '--i': i }) as CSSProperties;

/** Splits a heading into words that slide in one after another when it enters the viewport. */
export function RevealWords({
  text,
  className,
  accent,
  light,
}: {
  text: string;
  className?: string;
  accent?: string;
  /** Use the darker accent gradient on light chapters. */
  light?: boolean;
}) {
  const words = text.split(/\s+/).filter(Boolean);
  return (
    <span className={cn('lp-words', className)}>
      {words.map((w, i) => (
        <span key={i}>
          <span className="lp-w inline-block" style={delay(i)}>
            {w}
          </span>{' '}
        </span>
      ))}
      {accent ? (
        <span className={cn('lp-w inline-block', light ? 'lp-gradient-deep' : 'lp-gradient-text')} style={delay(words.length)}>
          {accent}
        </span>
      ) : null}
    </span>
  );
}
