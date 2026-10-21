import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from 'lucide-react';
import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';
import { PAGE_SIZES } from '@vippi/shared';
import { cn } from '../lib';
import { Button } from './button';
import { NativeSelect } from './input';

export function Table({ className, caption, children }: { className?: string; caption?: string; children: ReactNode }) {
  return (
    <div className={cn('w-full overflow-x-auto rounded-lg border border-border bg-surface', className)}>
      <table className="w-full border-collapse text-sm">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        {children}
      </table>
    </div>
  );
}

export function Th({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      className={cn(
        'h-10 whitespace-nowrap border-b border-border bg-background-subtle px-3 text-left text-xs font-medium text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}

export function SortableTh({
  label,
  direction,
  onToggle,
  className,
}: {
  label: ReactNode;
  direction: 'asc' | 'desc' | null;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <Th
      className={className}
      aria-sort={direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none'}
    >
      <button type="button" onClick={onToggle} className="inline-flex min-h-7 items-center gap-1 hover:text-foreground">
        {label}
        {direction === 'asc' ? <ArrowUp className="size-3.5" aria-hidden /> : null}
        {direction === 'desc' ? <ArrowDown className="size-3.5" aria-hidden /> : null}
      </button>
    </Th>
  );
}

export function Td({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('h-11 border-b border-border px-3 align-middle', className)} {...props} />;
}

export function Tr({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn('last:[&>td]:border-b-0', className)} {...props} />;
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
}) {
  const { t } = useTranslation();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <nav aria-label={t('common.pagination')} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
      <span className="text-muted-foreground tabular">{t('common.totalCount', { count: total })}</span>
      <div className="flex items-center gap-2">
        {onPageSizeChange ? (
          <label className="flex items-center gap-2 text-muted-foreground">
            {t('common.pageSize')}
            <NativeSelect
              className="h-8 w-20"
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
            >
              {PAGE_SIZES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </NativeSelect>
          </label>
        ) : null}
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label={t('common.prevPage')}
        >
          <ChevronLeft aria-hidden />
        </Button>
        <span className="tabular">{t('common.pageOf', { page, pages })}</span>
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          disabled={page >= pages}
          onClick={() => onPageChange(page + 1)}
          aria-label={t('common.nextPage')}
        >
          <ChevronRight aria-hidden />
        </Button>
      </div>
    </nav>
  );
}
