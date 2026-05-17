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

/**
 * Paleta Fyzon: fases F1→F6 progresan del slate-azul al azul Fyzon profundo
 * (calor del lead aumenta = color más saturado), F7 verde (cita conseguida),
 * outcomes en colores semánticos.
 */
export const COLUMN_COLORS: Record<ColumnKey, string> = {
  f1: '#94A3B8',  // slate — apertura fría
  f2: '#7C8EAB',  // slate→blue
  f3: '#5B7DC9',  // blue mid
  f4: '#3B5BC9',  // Fyzon dark
  f5: '#1E3A8A',  // Fyzon primary
  f6: '#162D6B',  // Fyzon deep
  f7: '#059669',  // success — cita agendada
  cancelled: '#D97706',  // warning amber
  no_show: '#DC2626',    // danger red
  recontact: '#0EA5E9',  // sky — oportunidad recuperar
  bought: '#059669',     // success — cierre ganado
  lost: '#6B7280',       // neutral — cierre perdido
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
