import { addDaysToDateString, LEAD_SOURCES, LEAD_STATUSES, SLA_STATES } from '@vippi/shared';
import { Search, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useAssignees } from '@/entities/member';
import { useCan } from '@/entities/session';
import { cn, todayTashkent } from '@/shared/lib';
import { Button, Input, MultiSelect, NativeSelect } from '@/shared/ui';
import type { useLeadFilters } from '../model/use-lead-filters';

type Filters = ReturnType<typeof useLeadFilters>;

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 items-center gap-1 rounded-full border px-3 text-sm font-medium max-md:h-11',
        active ? 'border-primary bg-primary-subtle text-primary' : 'border-border-strong bg-surface text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
      {active ? <X className="size-3.5" aria-hidden /> : null}
    </button>
  );
}

export function FiltersBar({ filters }: { filters: Filters }) {
  const { t } = useTranslation();
  const can = useCan();
  const canSeeAll = can('lead.readAll');
  const assignees = useAssignees({ enabled: canSeeAll });
  const { state, update, reset, activeCount } = filters;

  const [search, setSearch] = useState(state.q);
  const [syncedQ, setSyncedQ] = useState(state.q);
  if (syncedQ !== state.q) {
    setSyncedQ(state.q);
    setSearch(state.q);
  }
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const onSearch = (value: string) => {
    setSearch(value);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const trimmed = value.trim();
      if (trimmed.length >= 2 || trimmed === '') update({ q: trimmed });
    }, 300);
  };

  const today = todayTashkent();
  const presets = [
    { key: 'today', from: today, to: today },
    { key: '7d', from: addDaysToDateString(today, -6), to: today },
    { key: '30d', from: addDaysToDateString(today, -29), to: today },
  ];
  const activePreset = presets.find((p) => p.from === state.from && p.to === state.to)?.key ?? (state.from || state.to ? 'custom' : '');

  return (
    <section aria-label={t('filters.title')} className="mb-4 flex flex-col gap-3 rounded-lg border border-border bg-background-subtle p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Chip active={state.assigneeId === 'me'} onClick={() => update({ assigneeId: state.assigneeId === 'me' ? '' : 'me' })}>
          {t('filters.mine')}
        </Chip>
        {canSeeAll ? (
          <Chip active={state.assigneeId === 'none'} onClick={() => update({ assigneeId: state.assigneeId === 'none' ? '' : 'none' })}>
            {t('filters.unassigned')}
          </Chip>
        ) : null}
        <Chip
          active={state.slaState.length === 1 && state.slaState[0] === 'BREACHED'}
          onClick={() => update({ slaState: state.slaState.length === 1 && state.slaState[0] === 'BREACHED' ? [] : ['BREACHED'] })}
        >
          {t('filters.overdue')}
        </Chip>
        <Chip active={state.forgotten} onClick={() => update({ forgotten: !state.forgotten })}>
          {t('filters.forgotten')}
        </Chip>
        <div className="relative ml-auto w-full md:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground" aria-hidden />
          <Input
            type="search"
            aria-label={t('filters.search')}
            placeholder={t('filters.searchPlaceholder')}
            className="pl-9"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <MultiSelect
          label={t('filters.status')}
          value={state.status}
          onChange={(status) => update({ status })}
          options={LEAD_STATUSES.map((s) => ({ value: s, label: t(`lead.status.${s}`) }))}
        />
        <MultiSelect
          label={t('filters.source')}
          value={state.source}
          onChange={(source) => update({ source })}
          options={LEAD_SOURCES.map((s) => ({ value: s, label: t(`lead.source.${s}`) }))}
        />
        <MultiSelect
          label={t('filters.sla')}
          value={state.slaState}
          onChange={(slaState) => update({ slaState })}
          options={SLA_STATES.map((s) => ({ value: s, label: t(`sla.state.${s}`) }))}
        />
        {canSeeAll ? (
          <NativeSelect
            aria-label={t('filters.assignee')}
            className={cn('w-auto max-md:h-11', state.assigneeId && 'border-primary bg-primary-subtle text-primary')}
            value={state.assigneeId}
            onChange={(e) => update({ assigneeId: e.target.value })}
          >
            <option value="">{t('filters.anyAssignee')}</option>
            <option value="me">{t('filters.mine')}</option>
            <option value="none">{t('filters.unassigned')}</option>
            {assignees.map((a) => (
              <option key={a.id} value={a.id}>
                {a.fullName}
              </option>
            ))}
          </NativeSelect>
        ) : null}
        <NativeSelect
          aria-label={t('filters.period')}
          className={cn('w-auto max-md:h-11', activePreset && 'border-primary bg-primary-subtle text-primary')}
          value={activePreset}
          onChange={(e) => {
            const p = presets.find((x) => x.key === e.target.value);
            if (p) update({ from: p.from, to: p.to });
            else if (e.target.value === '') update({ from: '', to: '' });
            else update({ from: state.from || today, to: state.to || today });
          }}
        >
          <option value="">{t('filters.anyPeriod')}</option>
          <option value="today">{t('period.today')}</option>
          <option value="7d">{t('period.7d')}</option>
          <option value="30d">{t('period.30d')}</option>
          <option value="custom">{t('period.custom')}</option>
        </NativeSelect>
        {activePreset === 'custom' ? (
          <span className="flex items-center gap-1">
            <Input
              type="date"
              aria-label={t('period.from')}
              className="w-40"
              value={state.from}
              max={state.to || today}
              onChange={(e) => update({ from: e.target.value })}
            />
            <span aria-hidden>–</span>
            <Input
              type="date"
              aria-label={t('period.to')}
              className="w-40"
              value={state.to}
              min={state.from}
              max={today}
              onChange={(e) => update({ to: e.target.value })}
            />
          </span>
        ) : null}
        {activeCount > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              window.clearTimeout(timer.current);
              setSearch('');
              reset();
            }}
          >
            {t('filters.reset')}
          </Button>
        ) : null}
      </div>
    </section>
  );
}
