import { AlertDialog as A } from 'radix-ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from './button';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description: ReactNode;
  confirmLabel: ReactNode;
  onConfirm: () => void;
  loading?: boolean;
  destructive?: boolean;
}

/** Question title, consequences, «Cancel» focused by default (design-system §5). */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  loading,
  destructive = true,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  return (
    <A.Root open={open} onOpenChange={(v) => (loading ? undefined : onOpenChange(v))}>
      <A.Portal>
        <A.Overlay className="fixed inset-0 z-[60] bg-foreground/40" />
        <A.Content className="fixed inset-x-4 top-1/2 z-[60] -translate-y-1/2 rounded-xl bg-surface p-6 shadow-lg md:left-1/2 md:right-auto md:w-[440px] md:-translate-x-1/2">
          <A.Title className="text-lg font-semibold">{title}</A.Title>
          <A.Description className="mt-2 text-sm text-muted-foreground">{description}</A.Description>
          <div className="mt-6 flex flex-col-reverse gap-2 md:flex-row md:justify-end">
            <A.Cancel asChild>
              <Button variant="outline" disabled={loading}>
                {t('common.cancel')}
              </Button>
            </A.Cancel>
            <Button
              variant={destructive ? 'destructive' : 'default'}
              loading={loading}
              loadingText={t('common.saving')}
              onClick={onConfirm}
            >
              {confirmLabel}
            </Button>
          </div>
        </A.Content>
      </A.Portal>
    </A.Root>
  );
}
