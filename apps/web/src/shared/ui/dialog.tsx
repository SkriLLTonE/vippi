import { X } from 'lucide-react';
import { Dialog as D } from 'radix-ui';
import { useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg';
  /** Blocks closing by Esc/overlay/close button (e.g. while CSV import is running). */
  locked?: boolean;
}

/** Centered dialog on ≥md, bottom sheet on small screens (design-system §5). */
export function Dialog({ open, onOpenChange, title, description, children, footer, size = 'md', locked }: DialogProps) {
  const { t } = useTranslation();
  const guard = (e: Event) => {
    if (locked) e.preventDefault();
  };
  // Dialogs are opened from state, not D.Trigger, so Radix has no trigger to return focus to.
  const opener = useRef<HTMLElement | null>(null);
  return (
    <D.Root open={open} onOpenChange={(v) => (locked && !v ? undefined : onOpenChange(v))}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-[60] bg-foreground/40" />
        <D.Content
          onOpenAutoFocus={() => {
            opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          }}
          onCloseAutoFocus={(e) => {
            if (opener.current?.isConnected) {
              e.preventDefault();
              opener.current.focus();
            }
            opener.current = null;
          }}
          onEscapeKeyDown={guard}
          onPointerDownOutside={guard}
          onInteractOutside={guard}
          className={cn(
            'fixed z-[60] flex max-h-[92dvh] flex-col bg-surface shadow-lg focus:outline-none',
            'inset-x-0 bottom-0 rounded-t-xl md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-xl',
            size === 'lg' ? 'md:w-[720px]' : 'md:w-[480px]',
          )}
          {...(description ? {} : { 'aria-describedby': undefined })}
        >
          <div className="flex items-start justify-between gap-4 border-b border-border px-4 py-3 md:px-6 md:py-4">
            <div className="flex flex-col gap-1">
              <D.Title className="text-lg font-semibold">{title}</D.Title>
              {description ? <D.Description className="text-sm text-muted-foreground">{description}</D.Description> : null}
            </div>
            {!locked ? (
              <D.Close
                className="-mr-2 inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-background-subtle"
                aria-label={t('common.close')}
              >
                <X className="size-4" aria-hidden />
              </D.Close>
            ) : null}
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-4 md:px-6">{children}</div>
          {footer ? (
            <div className="flex flex-col-reverse gap-2 border-t border-border px-4 py-3 md:flex-row md:justify-end md:px-6">
              {footer}
            </div>
          ) : null}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
