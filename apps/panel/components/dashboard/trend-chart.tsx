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
import { useTheme } from 'next-themes';
import type { TrendPoint } from '@/lib/dashboard-trend';

interface Props {
  trend: TrendPoint[];
}

/**
 * Paleta Fyzon para el chart — funciona en ambos modos (light/dark):
 *   wa: azul Fyzon profundo (canal principal)
 *   fb: azul Facebook
 *   igIn: rosa Instagram
 *   igOut: naranja Instagram
 *   rate: verde success (línea cualificación)
 */
const COLORS = {
  wa: '#1E3A8A',
  fb: '#1877F2',
  igIn: '#E1306C',
  igOut: '#F77737',
  rate: '#059669',
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
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  if (trend.length === 0 || trend.every((p) => p.total === 0)) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 text-xs text-muted-foreground italic">
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

  // Colores tomados del theme para que el chart se integre en light + dark
  const gridStroke = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(10,10,10,0.06)';
  const axisStroke = isDark ? 'rgba(255,255,255,0.20)' : 'rgba(10,10,10,0.18)';
  const axisTextColor = isDark ? 'rgba(248,248,246,0.7)' : 'rgba(17,24,39,0.7)';
  const tooltipBg = isDark ? 'rgba(17,24,39,0.96)' : 'rgba(255,255,255,0.98)';
  const tooltipBorder = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(10,10,10,0.08)';
  const tooltipLabelColor = isDark ? 'rgba(248,248,246,0.6)' : 'rgba(17,24,39,0.6)';
  const tooltipTextColor = isDark ? '#F8F8F6' : '#0A0A0A';

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="text-[11px] uppercase tracking-wide font-medium text-muted-foreground mb-3 px-1">
        Tendencia · leads/día por canal + tasa cualificación
      </div>
      <div style={{ width: '100%', height: 280 }}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
            <XAxis
              dataKey="dateLabel"
              tick={{ fontSize: 10, fill: axisTextColor }}
              stroke={axisStroke}
            />
            <YAxis yAxisId="left" tick={{ fontSize: 10, fill: axisTextColor }} stroke={axisStroke} />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 10, fill: axisTextColor }}
              stroke={axisStroke}
              tickFormatter={(v) => `${v}%`}
              domain={[0, 100]}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: tooltipBg,
                border: `1px solid ${tooltipBorder}`,
                borderRadius: 8,
                fontSize: 11,
                color: tooltipTextColor,
                boxShadow: '0 8px 24px rgba(10,10,10,0.12)',
              }}
              labelStyle={{ color: tooltipLabelColor, fontWeight: 500 }}
              cursor={{ fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(10,10,10,0.04)' }}
              formatter={((value: unknown, name: unknown) => {
                const numValue = typeof value === 'number' ? value : 0;
                const strName = typeof name === 'string' ? name : String(name ?? '');
                if (strName === 'qualifiedRate')
                  return [`${Math.round(numValue)}%`, 'Tasa cualif.'];
                return [numValue, NAMES[strName as keyof typeof NAMES] ?? strName];
              }) as never}
            />
            <Legend
              wrapperStyle={{ fontSize: 10, paddingTop: 8, color: axisTextColor }}
              formatter={(name) => (name === 'qualifiedRate' ? 'Tasa cualif. (%)' : NAMES[name as keyof typeof NAMES] ?? name)}
            />
            <Bar yAxisId="left" dataKey="wa" stackId="a" fill={COLORS.wa} radius={[2, 2, 0, 0]} />
            <Bar yAxisId="left" dataKey="fb" stackId="a" fill={COLORS.fb} radius={[2, 2, 0, 0]} />
            <Bar yAxisId="left" dataKey="igIn" stackId="a" fill={COLORS.igIn} radius={[2, 2, 0, 0]} />
            <Bar yAxisId="left" dataKey="igOut" stackId="a" fill={COLORS.igOut} radius={[2, 2, 0, 0]} />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="qualifiedRate"
              stroke={COLORS.rate}
              strokeWidth={2.5}
              dot={{ r: 3, fill: COLORS.rate }}
              activeDot={{ r: 5 }}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
