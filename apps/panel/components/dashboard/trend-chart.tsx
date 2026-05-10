'use client';

import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';
import type { TrendPoint } from '@/lib/dashboard-trend';

interface Props {
  trend: TrendPoint[];
}

const COLORS = {
  wa: '#22c55e',
  fb: '#3b82f6',
  igIn: '#a855f7',
  igOut: '#ec4899',
  rate: '#fbbf24',
};

const NAMES = {
  wa: 'WhatsApp',
  fb: 'Facebook',
  igIn: 'IG inbound',
  igOut: 'IG outbound',
};

function formatDate(date: string) {
  // YYYY-MM-DD → DD/MM, YYYY-Www → Sem N, YYYY-MM → MM/YY
  if (/^\d{4}-W\d{2}$/.test(date)) {
    const w = date.split('W')[1];
    return `Sem ${parseInt(w!, 10)}`;
  }
  if (/^\d{4}-\d{2}$/.test(date)) {
    const [y, m] = date.split('-');
    return `${m}/${y!.slice(2)}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [, m, d] = date.split('-');
    return `${d}/${m}`;
  }
  return date;
}

export function TrendChart({ trend }: Props) {
  if (trend.length === 0 || trend.every((p) => p.total === 0)) {
    return (
      <div className="rounded-lg border border-border/50 bg-muted/10 p-4 text-xs text-muted-foreground italic">
        No hay actividad en el periodo seleccionado para mostrar tendencia.
      </div>
    );
  }

  const data = trend.map((p) => ({
    date: p.date,
    dateLabel: formatDate(p.date),
    wa: p.byChannel.wa,
    fb: p.byChannel.fb,
    igIn: p.byChannel.igIn,
    igOut: p.byChannel.igOut,
    qualifiedRate: p.qualifiedRate != null ? p.qualifiedRate * 100 : null,
  }));

  return (
    <div className="rounded-lg border border-border/50 bg-muted/10 p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2 px-1">
        Tendencia · leads/día por canal + tasa cualificación
      </div>
      <div style={{ width: '100%', height: 280 }}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="dateLabel" tick={{ fontSize: 10, fill: 'currentColor' }} stroke="rgba(255,255,255,0.2)" />
            <YAxis yAxisId="left" tick={{ fontSize: 10, fill: 'currentColor' }} stroke="rgba(255,255,255,0.2)" />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 10, fill: 'currentColor' }}
              stroke="rgba(255,255,255,0.2)"
              tickFormatter={(v) => `${v}%`}
              domain={[0, 100]}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(15,15,15,0.95)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 6,
                fontSize: 11,
              }}
              labelStyle={{ color: 'rgba(255,255,255,0.6)' }}
              formatter={((value: unknown, name: unknown) => {
                const numValue = typeof value === 'number' ? value : 0;
                const strName = typeof name === 'string' ? name : String(name ?? '');
                if (strName === 'qualifiedRate')
                  return [`${Math.round(numValue)}%`, 'Tasa cualif.'];
                return [numValue, NAMES[strName as keyof typeof NAMES] ?? strName];
              }) as never}
            />
            <Legend
              wrapperStyle={{ fontSize: 10, paddingTop: 8 }}
              formatter={(name) => (name === 'qualifiedRate' ? 'Tasa cualif. (%)' : NAMES[name as keyof typeof NAMES] ?? name)}
            />
            <Bar yAxisId="left" dataKey="wa" stackId="a" fill={COLORS.wa} />
            <Bar yAxisId="left" dataKey="fb" stackId="a" fill={COLORS.fb} />
            <Bar yAxisId="left" dataKey="igIn" stackId="a" fill={COLORS.igIn} />
            <Bar yAxisId="left" dataKey="igOut" stackId="a" fill={COLORS.igOut} />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="qualifiedRate"
              stroke={COLORS.rate}
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
