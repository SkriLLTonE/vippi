import type { MyStatsDailyRow } from '@vippi/shared';
import { useTranslation } from 'react-i18next';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatDayMonth } from '@/shared/lib';

/** FR-056: my leads and breaches per day, with the team mean per member as a line. */
export function TrendChart({ rows }: { rows: MyStatsDailyRow[] }) {
  const { t } = useTranslation();
  const showTeam = rows.some((r) => r.teamAverageLeads !== null);
  const data = rows.map((r) => ({
    ...r,
    label: formatDayMonth(r.date),
    teamAverageLeads: r.teamAverageLeads === null ? null : Math.round(r.teamAverageLeads * 10) / 10,
  }));
  return (
    <div className="h-72 w-full" role="img" aria-label={t('myStats.trendAria', { days: rows.length })}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} tickLine={false} />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            contentStyle={{ borderRadius: 6, border: '1px solid var(--border)', fontSize: 12 }}
            labelStyle={{ color: 'var(--foreground)' }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="leads" name={t('myStats.myLeads')} fill="var(--primary)" radius={[3, 3, 0, 0]} />
          <Bar dataKey="breached" name={t('myStats.myBreached')} fill="var(--danger)" radius={[3, 3, 0, 0]} />
          {showTeam ? (
            <Line
              dataKey="teamAverageLeads"
              name={t('myStats.teamLeads')}
              stroke="var(--muted-foreground)"
              strokeDasharray="4 4"
              dot={false}
              type="monotone"
            />
          ) : null}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
