/**
 * Sprint Kappa — Helpers puros del pipeline visual.
 *
 * Reglas de clasificación de columna por card:
 *   1. Si la conversation tiene una label con destination_bucket en
 *      OUTCOME_BUCKETS, la card vive en esa columna outcome (override total
 *      sobre phase_number).
 *   2. Si NO hay outcome label, la columna se decide por phase_number:
 *        - 1 → f1, 2 → f2, ..., 7 → f7.
 *        - 0 (default) → f1 (capturas no clasificadas viven en apertura).
 *   3. Precedencia de outcomes (si por error hay >1): bought > lost > no_show > cancelled > recontact.
 *      `applyPipelineOutcome` enforced exclusión mutua, pero defendemos por si.
 *
 * Filtros UI (sobre cards ya fetched):
 *   - q: búsqueda case-insensitive en first_name/last_name/username/external_id.
 *   - assignee: 'all' | 'me' | 'unassigned' | <userId>.
 *   - labelIds: cards con AL MENOS una label custom seleccionada.
 *
 * Sin deps de React/Next; testeable aislado.
 */

import {
  COLUMN_ORDER,
  OUTCOME_BUCKETS,
  type ColumnKey,
  type OutcomeBucket,
} from './pipeline-constants';

export interface PipelineCardLead {
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  external_id: string;
}

export interface PipelineCardChannel {
  channel_type: string;
  via_provider: string;
}

export interface PipelineCardLabel {
  id: number;
  name: string;
  color: string;
  destinationBucket: string | null;
  isSystem: boolean;
}

export interface PipelineCard {
  id: number;
  tenantId: number;
  phaseNumber: number;
  state: string;
  isQualified: boolean | null;
  isHandoffToHuman: boolean | null;
  aiPausedUntil: string | null;
  assignedUserId: string | null;
  direction: string;
  conversationSource: string | null;
  lastMessageAt: string | null;
  createdAt: string;
  lead: PipelineCardLead | null;
  channel: PipelineCardChannel | null;
  labels: PipelineCardLabel[];
}

export interface PipelineFilterParams {
  q?: string;
  assignee?: 'all' | 'me' | 'unassigned' | string;
  viewerId?: string | null;
  labelIds?: number[];
}

const OUTCOME_PRECEDENCE: readonly OutcomeBucket[] = [
  'bought',
  'lost',
  'no_show',
  'cancelled',
  'recontact',
] as const;

export function classifyCardColumn(card: PipelineCard): ColumnKey {
  const outcomeBuckets = card.labels
    .map((l) => l.destinationBucket)
    .filter((b): b is OutcomeBucket => b != null && (OUTCOME_BUCKETS as readonly string[]).includes(b));
  for (const oc of OUTCOME_PRECEDENCE) {
    if (outcomeBuckets.includes(oc)) return oc;
  }
  // Sin outcome: deriva de phase_number
  const p = card.phaseNumber;
  if (p >= 1 && p <= 7) return (`f${p}` as ColumnKey);
  return 'f1';
}

export function applyPipelineFilters(
  cards: PipelineCard[],
  filters: PipelineFilterParams,
): PipelineCard[] {
  const q = (filters.q ?? '').trim().toLowerCase();
  const assignee = filters.assignee ?? 'all';
  const viewerId = filters.viewerId ?? null;
  const labelIds = filters.labelIds ?? [];

  return cards.filter((c) => {
    if (assignee === 'me') {
      if (!viewerId || c.assignedUserId !== viewerId) return false;
    } else if (assignee === 'unassigned') {
      if (c.assignedUserId != null) return false;
    } else if (assignee !== 'all') {
      if (c.assignedUserId !== assignee) return false;
    }
    if (q.length > 0) {
      const haystack = [
        c.lead?.first_name ?? '',
        c.lead?.last_name ?? '',
        c.lead?.username ?? '',
        c.lead?.external_id ?? '',
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    if (labelIds.length > 0) {
      const cardLabelIds = c.labels.map((l) => l.id);
      if (!labelIds.some((id) => cardLabelIds.includes(id))) return false;
    }
    return true;
  });
}

export function groupCardsByColumn(
  cards: PipelineCard[],
): Record<ColumnKey, PipelineCard[]> {
  const result: Record<ColumnKey, PipelineCard[]> = {
    f1: [],
    f2: [],
    f3: [],
    f4: [],
    f5: [],
    f6: [],
    f7: [],
    cancelled: [],
    no_show: [],
    recontact: [],
    bought: [],
    lost: [],
  };
  for (const c of cards) {
    const col = classifyCardColumn(c);
    result[col].push(c);
  }
  return result;
}

export function cardsForColumn(
  cards: PipelineCard[],
  column: ColumnKey,
): PipelineCard[] {
  return cards.filter((c) => classifyCardColumn(c) === column);
}

export function columnCounts(cards: PipelineCard[]): Record<ColumnKey, number> {
  const counts: Partial<Record<ColumnKey, number>> = {};
  for (const k of COLUMN_ORDER) counts[k] = 0;
  for (const c of cards) {
    const col = classifyCardColumn(c);
    counts[col] = (counts[col] ?? 0) + 1;
  }
  return counts as Record<ColumnKey, number>;
}

export function parseAssignee(value: string | null | undefined): PipelineFilterParams['assignee'] {
  if (!value) return 'all';
  if (value === 'me' || value === 'unassigned' || value === 'all') return value;
  return value;
}

export function parseLabelIds(value: string | null | undefined): number[] {
  if (!value) return [];
  return value
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
}

export interface DateRange {
  from: string;
  to: string;
}

export function defaultDateRange(now: Date = new Date()): DateRange {
  const to = new Date(now);
  const from = new Date(now);
  from.setDate(from.getDate() - 30);
  return { from: from.toISOString(), to: to.toISOString() };
}

export function parseDateRange(
  fromStr: string | null | undefined,
  toStr: string | null | undefined,
  now: Date = new Date(),
): DateRange {
  if (!fromStr && !toStr) return defaultDateRange(now);
  const def = defaultDateRange(now);
  const fromValid = fromStr && !Number.isNaN(Date.parse(fromStr));
  const toValid = toStr && !Number.isNaN(Date.parse(toStr));
  return {
    from: fromValid ? new Date(fromStr!).toISOString() : def.from,
    to: toValid ? new Date(toStr!).toISOString() : def.to,
  };
}
