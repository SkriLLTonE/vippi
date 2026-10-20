import { Copy } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { cn, copyText } from '../lib';
import { Button, type ButtonProps } from './button';

export function PageHeader({
  title,
  description,
  actions,
  count,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  count?: number;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div>
        <h1 className="text-xl font-semibold md:text-2xl">
          {title}
          {count !== undefined ? <span className="ml-2 text-muted-foreground tabular">{count}</span> : null}
        </h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function CopyButton({
  text,
  label,
  ...props
}: { text: string; label?: ReactNode } & Omit<ButtonProps, 'onClick' | 'children'>) {
  const { t } = useTranslation();
  return (
    <Button
      variant="outline"
      {...props}
      onClick={async () => {
        const ok = await copyText(text);
        if (ok) toast.success(t('common.copied'));
        else toast.error(t('common.copyFailed'));
      }}
    >
      <Copy aria-hidden />
      {label ?? t('common.copy')}
    </Button>
  );
}

export function Alert({
  tone = 'warning',
  icon,
  children,
  className,
}: {
  tone?: 'warning' | 'info' | 'danger' | 'success';
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const tones = {
    warning: 'border-warning-border bg-warning-bg text-warning',
    info: 'border-info-border bg-info-bg text-info',
    danger: 'border-danger-border bg-danger-bg text-danger',
    success: 'border-success-border bg-success-bg text-success',
  } as const;
  return (
    <div className={cn('flex items-start gap-2 rounded-md border px-3 py-2 text-sm [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0', tones[tone], className)}>
      {icon}
      <div className="flex-1">{children}</div>
    </div>
  );
}

export function Code({ children }: { children: ReactNode }) {
  return (
    <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-md border border-border bg-background-subtle p-3 font-mono text-xs">
      {children}
    </pre>
  );
}
