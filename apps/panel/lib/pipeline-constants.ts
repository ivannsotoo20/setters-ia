/**
 * Sprint Kappa — Constantes del pipeline visual.
 * Sin deps de React/Next: importable desde cualquier lado.
 */

export type PipelineKey = 'wa' | 'fb' | 'ig-in' | 'ig-out';

export type ColumnKey =
  | 'f1'
  | 'f2'
  | 'f3'
  | 'f4'
  | 'f5'
  | 'f6'
  | 'f7'
  | 'cancelled'
  | 'no_show'
  | 'recontact'
  | 'bought'
  | 'lost';

export type OutcomeBucket = 'cancelled' | 'no_show' | 'recontact' | 'bought' | 'lost';

export const COLUMN_ORDER: readonly ColumnKey[] = [
  'f1',
  'f2',
  'f3',
  'f4',
  'f5',
  'f6',
  'f7',
  'cancelled',
  'no_show',
  'recontact',
  'bought',
  'lost',
] as const;

export const PHASE_COLUMNS: readonly ColumnKey[] = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7'];

export const OUTCOME_BUCKETS: readonly OutcomeBucket[] = [
  'cancelled',
  'no_show',
  'recontact',
  'bought',
  'lost',
] as const;

export const COLUMN_LABELS: Record<ColumnKey, string> = {
  f1: 'F1 · Apertura',
  f2: 'F2 · Profundizar',
  f3: 'F3 · Cualificación',
  f4: 'F4 · Puente',
  f5: 'F5 · Propuesta',
  f6: 'F6 · Link agenda',
  f7: 'F7 · Cita agendada',
  cancelled: 'Cita cancelada',
  no_show: 'No-Show',
  recontact: 'Recontacto',
  bought: 'Cierre ganado',
  lost: 'Cierre perdido',
};

export const COLUMN_COLORS: Record<ColumnKey, string> = {
  f1: '#94a3b8',
  f2: '#64748b',
  f3: '#3b82f6',
  f4: '#6366f1',
  f5: '#8b5cf6',
  f6: '#a855f7',
  f7: '#10b981',
  cancelled: '#f59e0b',
  no_show: '#dc2626',
  recontact: '#0ea5e9',
  bought: '#22c55e',
  lost: '#64748b',
};

export const PIPELINE_LABELS: Record<PipelineKey, string> = {
  wa: 'WhatsApp',
  fb: 'Facebook',
  'ig-in': 'Instagram · Inbound',
  'ig-out': 'Instagram · Outbound',
};

export interface PipelineDbFilter {
  channelType: 'whatsapp' | 'instagram_dm' | 'facebook_messenger';
  direction?: 'inbound' | 'outbound';
}

export function pipelineKeyToFilter(key: PipelineKey): PipelineDbFilter {
  switch (key) {
    case 'wa':
      return { channelType: 'whatsapp' };
    case 'fb':
      return { channelType: 'facebook_messenger' };
    case 'ig-in':
      return { channelType: 'instagram_dm', direction: 'inbound' };
    case 'ig-out':
      return { channelType: 'instagram_dm', direction: 'outbound' };
  }
}

export function isOutcomeColumn(col: string): col is OutcomeBucket {
  return (OUTCOME_BUCKETS as readonly string[]).includes(col);
}

export function isPhaseColumn(col: string): col is 'f1' | 'f2' | 'f3' | 'f4' | 'f5' | 'f6' | 'f7' {
  return (PHASE_COLUMNS as readonly string[]).includes(col);
}

export function parsePipelineKey(value: string | null | undefined): PipelineKey {
  if (value === 'wa' || value === 'fb' || value === 'ig-in' || value === 'ig-out') return value;
  return 'wa';
}
