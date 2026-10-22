import { Link } from 'react-router';
import { cn } from '@/shared/lib';

/** Logo link; `compact` keeps only the mark visible on phones. */
export function Brand({ compact }: { compact?: boolean }) {
  return (
    <Link to="/" className="flex shrink-0 items-center gap-2 rounded-md">
      <img src="/favicon.svg" alt="" className="size-7" />
      <span className={cn('text-base font-bold tracking-tight', compact && 'max-sm:sr-only')}>Vippi Leads</span>
    </Link>
  );
}
