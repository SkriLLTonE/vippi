import type { NotificationDto } from '@vippi/shared';
import { Bell, BellOff, TriangleAlert, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { cn, errorMessage, formatRelative, useNow } from '@/shared/lib';
import { Button, DelayedSkeleton, Dialog, EmptyState, Popover, PopoverContent, PopoverTrigger, Skeleton } from '@/shared/ui';
import { useMarkRead, useNotificationList, useUnreadCount } from '../api/shell-api';

function notificationText(n: NotificationDto, t: (k: string, o?: Record<string, unknown>) => string): string {
  const number = n.payload.leadNumber ?? '?';
  return n.type === 'SLA_BREACHED' ? t('notif.slaBreached', { number }) : t('notif.assigned', { number });
}

function NotificationList({ onNavigate }: { onNavigate: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const now = useNow(60_000);
  const list = useNotificationList(true);
  const { one, all } = useMarkRead();
  const items = list.data?.items ?? [];
  const hasUnread = items.some((n) => !n.readAt);

  return (
    <div className="flex max-h-[70dvh] flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">{t('notif.title')}</h2>
        <Button
          variant="link"
          size="sm"
          disabled={!hasUnread || all.isPending}
          onClick={() => all.mutate(undefined, { onError: (e) => toast.error(errorMessage(e, t)) })}
        >
          {t('notif.readAll')}
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {list.isPending ? (
          <DelayedSkeleton>
            <div className="flex flex-col gap-2 p-4">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          </DelayedSkeleton>
        ) : list.isError && items.length === 0 ? (
          <p className="p-4 text-sm text-danger" role="alert">
            {errorMessage(list.error, t)}
          </p>
        ) : items.length === 0 ? (
          <EmptyState icon={BellOff} title={t('notif.empty')} />
        ) : (
          <ul>
            {items.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  data-testid="notification-item"
                  className={cn(
                    'flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-background-subtle',
                    !n.readAt && 'bg-primary-subtle/60',
                  )}
                  onClick={() => {
                    if (!n.readAt) one.mutate(n.id);
                    onNavigate();
                    if (n.leadId) void navigate(`/leads/${n.leadId}`);
                  }}
                >
                  {n.type === 'SLA_BREACHED' ? (
                    <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
                  ) : (
                    <UserPlus className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                  )}
                  <span className="flex-1">
                    <span className="block text-sm">{notificationText(n, t)}</span>
                    <span className="text-xs text-subtle-foreground">{formatRelative(n.createdAt, now, t)}</span>
                  </span>
                  {!n.readAt ? (
                    <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-label={t('notif.unread')} />
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function BellIcon({ count, error }: { count: number; error: boolean }) {
  const { t } = useTranslation();
  return (
    <span className="relative inline-flex">
      <Bell className="size-5" aria-hidden />
      {count > 0 ? (
        <span className="absolute -right-2 -top-2 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white tabular">
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
      {error ? (
        <TriangleAlert className="absolute -bottom-1 -right-1 size-3 text-warning" aria-label={t('notif.loadError')} />
      ) : null}
    </span>
  );
}

/** Desktop popover (FR-041). */
export function NotificationsPopover() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const unread = useUnreadCount();
  const count = unread.data?.count ?? 0;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          data-testid="notifications-bell"
          aria-label={count > 0 ? t('notif.bellUnread', { count }) : t('notif.title')}
        >
          <BellIcon count={count} error={unread.isError} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 max-w-[calc(100vw-2rem)]">
        <NotificationList onNavigate={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}

/** Mobile full-screen sheet. */
export function NotificationsSheetButton({ className }: { className?: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const unread = useUnreadCount();
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        <BellIcon count={unread.data?.count ?? 0} error={unread.isError} />
        <span>{t('notif.short')}</span>
      </button>
      <Dialog open={open} onOpenChange={setOpen} title={t('notif.title')}>
        <div className="-mx-4 -my-4 md:-mx-6">{open ? <NotificationList onNavigate={() => setOpen(false)} /> : null}</div>
      </Dialog>
    </>
  );
}
