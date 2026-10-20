import { AlertCircle, Inbox, type LucideIcon } from 'lucide-react';
import { useEffect, useState, type HTMLAttributes, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib';
import { Button } from './button';

/** Skeleton shown after a 200 ms delay to avoid flicker (UX §4). */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-md bg-border/70', className)} aria-hidden {...props} />;
}

export function DelayedSkeleton({ children, label }: { children: ReactNode; label?: string }) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setVisible(true), 200);
    return () => window.clearTimeout(id);
  }, []);
  return (
    <div role="status" aria-live="polite" aria-label={label ?? t('common.loading')}>
      {visible ? children : null}
    </div>
  );
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  secondary,
  tone = 'neutral',
}: {
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  secondary?: ReactNode;
  tone?: 'neutral' | 'success';
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
      <Icon className={cn('size-10', tone === 'success' ? 'text-success' : 'text-subtle-foreground')} aria-hidden />
      <h3 className="text-lg font-semibold">{title}</h3>
      {description ? <p className="max-w-md text-sm text-muted-foreground">{description}</p> : null}
      {action || secondary ? (
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          {action}
          {secondary}
        </div>
      ) : null}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: ReactNode; onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-3 rounded-lg border border-danger-border bg-danger-bg p-4 text-sm text-danger md:flex-row md:items-center"
    >
      <AlertCircle className="size-5 shrink-0" aria-hidden />
      <p className="flex-1">{message}</p>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          {t('common.retry')}
        </Button>
      ) : null}
    </div>
  );
}
