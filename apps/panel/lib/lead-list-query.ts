/**
 * Sprint Mu — Helpers puros para clasificar y filtrar la lista de contactos
 * (tabla `leads`). Hermano de `conversation-list-query.ts` pero a nivel LEAD,
 * no conversation.
 *
 * Cardinalidad nominal: 1 lead = 1 conversation (porque `leads` ya está
 * limitada por `channel_id` y `conversations` usa el mismo `channel_id`).
 * Los helpers están escritos para soportar N conversations por lead — si en
 * el futuro se decide multi-canal por lead, el código aguanta.
 *
 * Tabs derivation (sobre el conjunto de conversations del lead)
 * -------------------------------------------------------------
 *   - bought    → al menos 1 conv con label bucket='bought'
 *   - lost      → al menos 1 conv con label bucket='lost'
 *   - cancelled → al menos 1 conv con label bucket IN ('cancelled','no_show')
 *   - hot       → al menos 1 conv con label bucket='hot'
 *   - active    → al menos 1 conv con state='active' AND ningún bucket terminal
 *   - all       → cualquier lead (default, no filtra)
 *
 * Precedencia (cuando un mismo lead matchea varios tabs): bought > lost >
 * cancelled > hot > active > all. Mostrar el primer match. Esto refleja "el
 * estado final" del lead — si compró ya no importa que también estuviera hot.
 *
 * Filters
 * -------
 *   - q             búsqueda CI en first/last/username/phone/email/external_id/location
 *   - channels      multi: 'wa' | 'ig' | 'fb' (match cualquier conv del lead)
 *   - providers     multi: 'manychat' | 'ycloud' | 'meta_cloud' | 'ghl' | 'other'
 *   - triggers      multi: valores distintos de conversation_source
 *   - phases        multi 0..7 sobre phase_number de cualquier conv
 *   - states        multi: 'active' | 'paused' | 'stopped' | 'closed'
 *   - qualified     'yes' | 'no' | 'undecided' | 'all'
 *   - handoffCauses multi: 'A_agenda' | 'B_derivacion' | ...
 *   - labelIds      multi: at-least-one match sobre labels del conjunto
 *   - assignee      'mine' | 'unassigned' | 'any' | <userId>
 *   - createdFrom/createdTo  rango ISO sobre lead.created_at
 *   - lastMsgFrom/lastMsgTo  rango ISO sobre MAX(conv.last_message_at)
 *   - lastMsgNever           true → solo leads SIN ninguna conv con last_message_at
 *   - aiState       'active' | 'paused' | 'all' (paused = handoff OR ai_paused_until futuro)
 *   - blocked       'yes' | 'no' | 'all'
 *   - scheduled     'yes' | 'no' | 'all' (call_scheduled_at NOT NULL en alguna conv)
 */

export type LeadTabKey = 'all' | 'active' | 'hot' | 'bought' | 'cancelled' | 'lost';

export type DestinationBucket =
  | 'chats'
  | 'hot'
  | 'done'
  | 'bought'
  | 'cancelled'
  | 'no_show'
  | 'recontact'
  | 'lost';

export interface LeadListLabel {
  id: number;
  name: string;
  color: string;
  destination_bucket: DestinationBucket | null;
}

export interface LeadListConv {
  id: number;
  channel_id: number;
  channel_type: string | null;
  via_provider: string | null;
  state: string;
  phase_number: number;
  is_qualified: boolean | null;
  is_handoff_to_human: boolean;
  is_blocked: boolean;
  ai_paused_until: string | null;
  handoff_cause: string | null;
  handoff_reason: string | null;
  handoff_at: string | null;
  conversation_source: string | null;
  call_scheduled_at: string | null;
  is_call_scheduling_link_sent: boolean;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
  assigned_user_id: string | null;
  labels: LeadListLabel[];
}

export interface LeadListRow {
  id: number;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  phone: string | null;
  email: string | null;
  location: string | null;
  external_id: string;
  source_channel: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  conversations: LeadListConv[];
}

export interface LeadFilterParams {
  q?: string;
  channels?: string[];
  providers?: string[];
  triggers?: string[];
  phases?: number[];
  states?: string[];
  qualified?: 'yes' | 'no' | 'undecided' | 'all';
  handoffCauses?: string[];
  labelIds?: number[];
  assignee?: string;
  viewerId?: string | null;
  createdFrom?: string | null;
  createdTo?: string | null;
  lastMsgFrom?: string | null;
  lastMsgTo?: string | null;
  lastMsgNever?: boolean;
  aiState?: 'active' | 'paused' | 'all';
  blocked?: 'yes' | 'no' | 'all';
  scheduled?: 'yes' | 'no' | 'all';
}

// ---------------------------------------------------------------------------
// Derived helpers
// ---------------------------------------------------------------------------

export function getLastMessageAt(row: LeadListRow): string | null {
  let max: string | null = null;
  for (const c of row.conversations) {
    if (!c.last_message_at) continue;
    if (max === null || c.last_message_at > max) max = c.last_message_at;
  }
  return max;
}

export function getMaxPhase(row: LeadListRow): number {
  let max = 0;
  for (const c of row.conversations) {
    if (c.phase_number > max) max = c.phase_number;
  }
  return max;
}

export function getUniqueBuckets(row: LeadListRow): DestinationBucket[] {
  const set = new Set<DestinationBucket>();
  for (const c of row.conversations) {
    for (const l of c.labels) {
      if (l.destination_bucket) set.add(l.destination_bucket);
    }
  }
  return Array.from(set);
}

export function getUniqueLabelIds(row: LeadListRow): number[] {
  const set = new Set<number>();
  for (const c of row.conversations) {
    for (const l of c.labels) set.add(l.id);
  }
  return Array.from(set);
}

export function getUniqueLabels(row: LeadListRow): LeadListLabel[] {
  const seen = new Set<number>();
  const out: LeadListLabel[] = [];
  // System labels primero (las que tienen destination_bucket).
  const all: LeadListLabel[] = [];
  for (const c of row.conversations) {
    for (const l of c.labels) all.push(l);
  }
  for (const l of all) {
    if (l.destination_bucket && !seen.has(l.id)) {
      seen.add(l.id);
      out.push(l);
    }
  }
  for (const l of all) {
    if (!l.destination_bucket && !seen.has(l.id)) {
      seen.add(l.id);
      out.push(l);
    }
  }
  return out;
}

export function isAiPausedNow(rawUntil: string | null | undefined): boolean {
  if (!rawUntil) return false;
  if (rawUntil === 'infinity') return true;
  const ts = Date.parse(rawUntil);
  if (!Number.isFinite(ts)) return true;
  return ts > Date.now();
}

export function isLeadAiPaused(row: LeadListRow): boolean {
  return row.conversations.some(
    (c) => c.is_handoff_to_human || isAiPausedNow(c.ai_paused_until),
  );
}

export function isLeadBlocked(row: LeadListRow): boolean {
  return row.conversations.some((c) => c.is_blocked);
}

export function hasCallScheduled(row: LeadListRow): boolean {
  return row.conversations.some((c) => c.call_scheduled_at != null);
}

export function getAssignedSummary(row: LeadListRow): {
  ids: string[];
  display: 'unassigned' | 'single' | 'multiple';
  primaryId: string | null;
} {
  const set = new Set<string>();
  for (const c of row.conversations) {
    if (c.assigned_user_id) set.add(c.assigned_user_id);
  }
  const ids = Array.from(set);
  if (ids.length === 0)
    return { ids, display: 'unassigned', primaryId: null };
  if (ids.length === 1) return { ids, display: 'single', primaryId: ids[0] ?? null };
  return { ids, display: 'multiple', primaryId: ids[0] ?? null };
}

// ---------------------------------------------------------------------------
// Tab classification
// ---------------------------------------------------------------------------

export function classifyLeadTabByLabels(row: LeadListRow): LeadTabKey {
  const buckets = getUniqueBuckets(row);
  if (buckets.includes('bought')) return 'bought';
  if (buckets.includes('lost')) return 'lost';
  if (buckets.includes('cancelled') || buckets.includes('no_show')) return 'cancelled';
  if (buckets.includes('hot')) return 'hot';
  if (row.conversations.some((c) => c.state === 'active')) return 'active';
  return 'all';
}

const ALL_TABS: readonly LeadTabKey[] = ['all', 'active', 'hot', 'bought', 'cancelled', 'lost'];

export type LeadTabCounts = Record<LeadTabKey, number>;

export function leadTabCounts(rows: LeadListRow[]): LeadTabCounts {
  const counts: LeadTabCounts = {
    all: rows.length,
    active: 0,
    hot: 0,
    bought: 0,
    cancelled: 0,
    lost: 0,
  };
  for (const r of rows) {
    const tab = classifyLeadTabByLabels(r);
    if (tab !== 'all') counts[tab] += 1;
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Channel normalization
// ---------------------------------------------------------------------------

const VALID_CHANNEL_KEYS: readonly string[] = ['wa', 'ig', 'fb'];

function normalizeChannel(channelType: string | null | undefined): string | null {
  if (channelType === 'whatsapp') return 'wa';
  if (channelType === 'instagram_dm') return 'ig';
  if (channelType === 'facebook_messenger') return 'fb';
  return null;
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

function inRange(iso: string | null, from: string | null, to: string | null): boolean {
  if (!from && !to) return true;
  if (!iso) return false;
  if (from && iso < from) return false;
  if (to && iso > to) return false;
  return true;
}

export function applyFilters(rows: LeadListRow[], filters: LeadFilterParams): LeadListRow[] {
  const q = (filters.q ?? '').trim().toLowerCase();
  const channels = (filters.channels ?? []).filter((c) => VALID_CHANNEL_KEYS.includes(c));
  const providers = filters.providers ?? [];
  const triggers = filters.triggers ?? [];
  const phases = filters.phases ?? [];
  const states = filters.states ?? [];
  const qualified = filters.qualified ?? 'all';
  const handoffCauses = filters.handoffCauses ?? [];
  const labelIds = filters.labelIds ?? [];
  const assignee = filters.assignee ?? 'any';
  const viewerId = filters.viewerId ?? null;
  const createdFrom = filters.createdFrom ?? null;
  const createdTo = filters.createdTo ?? null;
  const lastMsgFrom = filters.lastMsgFrom ?? null;
  const lastMsgTo = filters.lastMsgTo ?? null;
  const lastMsgNever = filters.lastMsgNever === true;
  const aiState = filters.aiState ?? 'all';
  const blocked = filters.blocked ?? 'all';
  const scheduled = filters.scheduled ?? 'all';

  return rows.filter((row) => {
    // ----- Búsqueda libre -----
    if (q.length > 0) {
      const haystack = [
        row.first_name,
        row.last_name,
        row.username,
        row.phone,
        row.email,
        row.external_id,
        row.location,
        row.notes,
      ]
        .filter((v): v is string => v != null && v.length > 0)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }

    // ----- Lead-level dates -----
    if (!inRange(row.created_at, createdFrom, createdTo)) return false;

    const lastMsg = getLastMessageAt(row);
    if (lastMsgNever) {
      if (lastMsg !== null) return false;
    } else if (lastMsgFrom || lastMsgTo) {
      if (!inRange(lastMsg, lastMsgFrom, lastMsgTo)) return false;
    }

    // ----- Filtros que dependen de las conversations del lead -----
    // Semantics: "al menos UNA conversation matchea" para multi-conv (sólo
    // aplicable cuando un lead tiene >1 conv, raro hoy pero el código aguanta).
    const convs = row.conversations;
    if (convs.length === 0) {
      // Lead sin conversations (raro). Si hay filtros conv-level, descartar.
      if (
        channels.length > 0 ||
        providers.length > 0 ||
        triggers.length > 0 ||
        phases.length > 0 ||
        states.length > 0 ||
        qualified !== 'all' ||
        handoffCauses.length > 0 ||
        labelIds.length > 0 ||
        assignee !== 'any' ||
        aiState !== 'all' ||
        blocked !== 'all' ||
        scheduled !== 'all'
      ) {
        return false;
      }
      return true;
    }

    if (channels.length > 0) {
      const has = convs.some((c) => {
        const norm = normalizeChannel(c.channel_type);
        return norm != null && channels.includes(norm);
      });
      if (!has) return false;
    }

    if (providers.length > 0) {
      const has = convs.some((c) => c.via_provider != null && providers.includes(c.via_provider));
      if (!has) return false;
    }

    if (triggers.length > 0) {
      const has = convs.some(
        (c) => c.conversation_source != null && triggers.includes(c.conversation_source),
      );
      if (!has) return false;
    }

    if (phases.length > 0) {
      const has = convs.some((c) => phases.includes(c.phase_number));
      if (!has) return false;
    }

    if (states.length > 0) {
      const has = convs.some((c) => states.includes(c.state));
      if (!has) return false;
    }

    if (qualified !== 'all') {
      const has = convs.some((c) => {
        if (qualified === 'yes') return c.is_qualified === true;
        if (qualified === 'no') return c.is_qualified === false;
        return c.is_qualified === null;
      });
      if (!has) return false;
    }

    if (handoffCauses.length > 0) {
      const has = convs.some(
        (c) => c.handoff_cause != null && handoffCauses.includes(c.handoff_cause),
      );
      if (!has) return false;
    }

    if (labelIds.length > 0) {
      const ids = getUniqueLabelIds(row);
      if (!labelIds.some((id) => ids.includes(id))) return false;
    }

    if (assignee !== 'any') {
      const summary = getAssignedSummary(row);
      if (assignee === 'unassigned') {
        if (summary.display !== 'unassigned') return false;
      } else if (assignee === 'mine') {
        if (!viewerId) return false;
        if (!summary.ids.includes(viewerId)) return false;
      } else {
        // assignee === <userId>
        if (!summary.ids.includes(assignee)) return false;
      }
    }

    if (aiState !== 'all') {
      const paused = isLeadAiPaused(row);
      if (aiState === 'paused' && !paused) return false;
      if (aiState === 'active' && paused) return false;
    }

    if (blocked !== 'all') {
      const isB = isLeadBlocked(row);
      if (blocked === 'yes' && !isB) return false;
      if (blocked === 'no' && isB) return false;
    }

    if (scheduled !== 'all') {
      const has = hasCallScheduled(row);
      if (scheduled === 'yes' && !has) return false;
      if (scheduled === 'no' && has) return false;
    }

    return true;
  });
}

export function rowsForTab(
  rows: LeadListRow[],
  tab: LeadTabKey,
  filters: LeadFilterParams,
): LeadListRow[] {
  const filtered = applyFilters(rows, filters);
  if (tab === 'all') return filtered;
  return filtered.filter((r) => classifyLeadTabByLabels(r) === tab);
}

// ---------------------------------------------------------------------------
// URL param parsers
// ---------------------------------------------------------------------------

export function parseLeadTab(value: string | null | undefined): LeadTabKey {
  if (value && (ALL_TABS as readonly string[]).includes(value)) return value as LeadTabKey;
  return 'all';
}

export function parseCsvIntList(value: string | null | undefined): number[] {
  if (!value) return [];
  return value
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n >= 0);
}

export function parseCsvStringList(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function parseQualified(
  value: string | null | undefined,
): 'yes' | 'no' | 'undecided' | 'all' {
  if (value === 'yes' || value === 'no' || value === 'undecided') return value;
  return 'all';
}

export function parseAiState(value: string | null | undefined): 'active' | 'paused' | 'all' {
  if (value === 'active' || value === 'paused') return value;
  return 'all';
}

export function parseTriState(value: string | null | undefined): 'yes' | 'no' | 'all' {
  if (value === 'yes' || value === 'no') return value;
  return 'all';
}

export function countActiveFilters(filters: LeadFilterParams): number {
  let n = 0;
  if ((filters.q ?? '').trim().length > 0) n += 1;
  if ((filters.channels ?? []).length > 0) n += 1;
  if ((filters.providers ?? []).length > 0) n += 1;
  if ((filters.triggers ?? []).length > 0) n += 1;
  if ((filters.phases ?? []).length > 0) n += 1;
  if ((filters.states ?? []).length > 0) n += 1;
  if ((filters.qualified ?? 'all') !== 'all') n += 1;
  if ((filters.handoffCauses ?? []).length > 0) n += 1;
  if ((filters.labelIds ?? []).length > 0) n += 1;
  if ((filters.assignee ?? 'any') !== 'any') n += 1;
  if (filters.createdFrom || filters.createdTo) n += 1;
  if (filters.lastMsgFrom || filters.lastMsgTo || filters.lastMsgNever) n += 1;
  if ((filters.aiState ?? 'all') !== 'all') n += 1;
  if ((filters.blocked ?? 'all') !== 'all') n += 1;
  if ((filters.scheduled ?? 'all') !== 'all') n += 1;
  return n;
}
