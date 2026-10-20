import type { DailyRow } from '@vippi/shared';
import { useTranslation } from 'react-i18next';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatDayMonth } from '@/shared/lib';

/** FR-054: leads vs breached per day (colors: design-system §2.6, legend with labels). */
export function DailyChart({ rows }: { rows: DailyRow[] }) {
  const { t } = useTranslation();
  const data = rows.map((r) => ({ ...r, label: formatDayMonth(r.date) }));
  return (
    <div className="h-72 w-full" role="img" aria-label={t('dashboard.dailyAria', { days: rows.length })}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} tickLine={false} />
          <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{ borderRadius: 6, border: '1px solid var(--border)', fontSize: 12 }}
            labelStyle={{ color: 'var(--foreground)' }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="leads" name={t('dashboard.leads')} fill="var(--primary)" radius={[3, 3, 0, 0]} />
          <Bar dataKey="breached" name={t('dashboard.breached')} fill="var(--danger)" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
