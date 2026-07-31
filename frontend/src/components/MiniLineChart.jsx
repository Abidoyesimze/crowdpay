import { useTranslation } from 'react-i18next';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';

export default function MiniLineChart({ data, dataKey = 'total_amount', label = '' }) {
  const { t } = useTranslation();
  if (!data || data.length === 0) {
    return (
      <p style={{ color: 'var(--color-text-hint)', fontSize: '0.9rem' }}>
        {t('dashboard.noContributionData')}
      </p>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
        <XAxis dataKey="day" tick={{ fontSize: 11 }} tickFormatter={(d) => d?.slice(5)} />
        <YAxis tick={{ fontSize: 11 }} width={48} />
        <Tooltip formatter={(v) => [Number(v).toLocaleString(), label]} />
        <Line
          type="monotone"
          dataKey={dataKey}
          stroke="var(--color-accent)"
          dot={false}
          strokeWidth={2}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
