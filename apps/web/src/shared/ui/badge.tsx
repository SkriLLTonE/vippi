import type { HTMLAttributes } from 'react';
import { cn } from '../lib';

/** 22px badge, icon 14px + text (design-system §5). Colors are passed by entity badges. */
export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        'inline-flex h-[22px] max-w-full items-center gap-1 whitespace-nowrap rounded-sm border border-transparent px-1.5 text-xs font-medium [&_svg]:size-3.5 [&_svg]:shrink-0',
        className,
      )}
      {...props}
    />
  );
}
