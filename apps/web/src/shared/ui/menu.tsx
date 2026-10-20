import { DropdownMenu as M, Popover as P, Tooltip as T } from 'radix-ui';
import type { ReactNode } from 'react';
import { cn } from '../lib';

export const DropdownMenu = M.Root;
export const DropdownMenuTrigger = M.Trigger;

export function DropdownMenuContent({ children, align = 'end' }: { children: ReactNode; align?: 'start' | 'end' }) {
  return (
    <M.Portal>
      <M.Content
        align={align}
        sideOffset={4}
        className="z-50 min-w-44 rounded-md border border-border bg-surface p-1 shadow-md"
      >
        {children}
      </M.Content>
    </M.Portal>
  );
}

export function DropdownMenuItem({
  children,
  onSelect,
  destructive,
  disabled,
}: {
  children: ReactNode;
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
}) {
  return (
    <M.Item
      disabled={disabled}
      onSelect={onSelect}
      className={cn(
        'flex h-9 cursor-pointer select-none items-center gap-2 rounded-sm px-2 text-sm outline-none data-[disabled]:opacity-50 data-[highlighted]:bg-background-subtle [&_svg]:size-4',
        destructive && 'text-danger',
      )}
    >
      {children}
    </M.Item>
  );
}

export function DropdownMenuSeparator() {
  return <M.Separator className="my-1 h-px bg-border" />;
}

export const Popover = P.Root;
export const PopoverTrigger = P.Trigger;

export function PopoverContent({
  children,
  className,
  align = 'end',
}: {
  children: ReactNode;
  className?: string;
  align?: 'start' | 'center' | 'end';
}) {
  return (
    <P.Portal>
      <P.Content
        align={align}
        sideOffset={6}
        className={cn('z-50 rounded-lg border border-border bg-surface shadow-md focus:outline-none', className)}
      >
        {children}
      </P.Content>
    </P.Portal>
  );
}

export const TooltipProvider = T.Provider;

/** Supplementary information only; opens on hover and focus. */
export function Tooltip({ content, children }: { content: ReactNode; children: ReactNode }) {
  return (
    <T.Root delayDuration={200}>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          sideOffset={4}
          className="z-50 max-w-72 rounded-md bg-foreground px-2.5 py-1.5 text-xs text-background shadow-md"
        >
          {content}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
