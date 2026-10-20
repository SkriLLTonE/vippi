import { RadioGroup as R, Switch as S, Tabs as Tb } from 'radix-ui';
import type { ReactNode } from 'react';
import { cn } from '../lib';

interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
}

/** Radio semantics with button look: language, tone, contact channel (≤7 options). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
  wrap,
}: {
  value: T | undefined;
  onChange: (value: T) => void;
  options: readonly SegmentedOption<T>[];
  label: string;
  className?: string;
  wrap?: boolean;
}) {
  return (
    <R.Root
      aria-label={label}
      value={value ?? ''}
      onValueChange={(v) => onChange(v as T)}
      className={cn('flex gap-1', wrap ? 'flex-wrap' : 'inline-flex rounded-md bg-background-subtle p-1', className)}
    >
      {options.map((o) => (
        <R.Item
          key={o.value}
          value={o.value}
          className={cn(
            'inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors max-md:h-11 [&_svg]:size-4',
            'hover:text-foreground data-[state=checked]:bg-surface data-[state=checked]:text-foreground data-[state=checked]:shadow-xs',
            wrap && 'border border-border-strong data-[state=checked]:border-primary data-[state=checked]:bg-primary-subtle',
          )}
        >
          {o.icon}
          {o.label}
        </R.Item>
      ))}
    </R.Root>
  );
}

export function Switch({
  checked,
  onCheckedChange,
  disabled,
  id,
  label,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
  id?: string;
  label?: string;
}) {
  return (
    <S.Root
      id={id}
      aria-label={label}
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full bg-border-strong transition-colors data-[state=checked]:bg-primary disabled:opacity-60"
    >
      <S.Thumb className="block size-5 translate-x-0.5 rounded-full bg-white shadow-sm transition-transform data-[state=checked]:translate-x-[22px]" />
    </S.Root>
  );
}

export const Tabs = Tb.Root;
export const TabsContent = Tb.Content;

export function TabsList({ children, label }: { children: ReactNode; label: string }) {
  return (
    <Tb.List aria-label={label} className="mb-4 flex gap-1 border-b border-border">
      {children}
    </Tb.List>
  );
}

export function TabsTrigger({ value, children }: { value: string; children: ReactNode }) {
  return (
    <Tb.Trigger
      value={value}
      className="-mb-px h-10 border-b-2 border-transparent px-3 text-sm font-medium text-muted-foreground data-[state=active]:border-primary data-[state=active]:text-foreground"
    >
      {children}
    </Tb.Trigger>
  );
}
