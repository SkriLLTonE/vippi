import { ChevronDown } from 'lucide-react';
import { Popover as P } from 'radix-ui';
import { useId, type ReactNode } from 'react';
import { cn } from '../lib';

interface Option {
  value: string;
  label: ReactNode;
}

/** Filter multiselect: popover with a checkbox list (design-system §5 «Фильтры»). */
export function MultiSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly Option[];
  value: readonly string[];
  onChange: (value: string[]) => void;
}) {
  const id = useId();
  const active = value.length > 0;
  return (
    <P.Root>
      <P.Trigger
        className={cn(
          'inline-flex h-9 items-center gap-1.5 rounded-md border border-border-strong bg-surface px-3 text-sm shadow-xs hover:bg-background-subtle max-md:h-11',
          active && 'border-primary bg-primary-subtle text-primary',
        )}
      >
        {label}
        {active ? <span className="rounded-sm bg-primary px-1 text-xs text-primary-foreground tabular">{value.length}</span> : null}
        <ChevronDown className="size-4" aria-hidden />
      </P.Trigger>
      <P.Portal>
        <P.Content
          align="start"
          sideOffset={4}
          className="z-50 max-h-80 min-w-52 overflow-y-auto rounded-md border border-border bg-surface p-1 shadow-md"
        >
          <fieldset>
            <legend className="sr-only">{label}</legend>
            {options.map((o) => {
              const checked = value.includes(o.value);
              const optionId = `${id}-${o.value}`;
              return (
                <label
                  key={o.value}
                  htmlFor={optionId}
                  className="flex h-9 cursor-pointer items-center gap-2 rounded-sm px-2 text-sm hover:bg-background-subtle"
                >
                  <input
                    id={optionId}
                    type="checkbox"
                    className="size-4 accent-[var(--primary)]"
                    checked={checked}
                    onChange={() => onChange(checked ? value.filter((v) => v !== o.value) : [...value, o.value])}
                  />
                  {o.label}
                </label>
              );
            })}
          </fieldset>
        </P.Content>
      </P.Portal>
    </P.Root>
  );
}
