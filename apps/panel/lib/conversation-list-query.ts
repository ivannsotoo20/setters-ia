/**
 * Helpers puros para clasificar y filtrar la lista de conversaciones del
 * panel chat (Sprint Zeta). Sin dependencias de React/Next: corre en SSR
 * para clasificar antes de pasar al cliente, y se testea aislado.
 *
 * Tabs derivation
 * ---------------
 *   - hot     → `is_handoff_to_human === true`
 *   - done    → `phase_number === 6` (cierre del Cerebro v4 — fase final F6)
 *   - bought  → PROXY hasta Sprint Eta. `state === 'closed' &&
 *               is_qualified === true && !is_handoff_to_human`. Cuando el
 *               webhook GHL escriba `ghl_opportunity_status='won'` reemplazar
 *               por ese check exacto.
 *   - chats   → todo lo demás (default).
 *
 * Filters
 * -------
 *   - q       → búsqueda case-insensitive en first_name/last_name/username/external_id
 *   - channel → 'wa' (whatsapp) | 'ig' (instagram_dm) | 'all'
 *   - unread  → solo `is_unread === true`
 *   - mine    → solo `assigned_user_id === viewerId`
 */

export type TabKey = 'chats' | 'hot' | 'done' | 'bought';

export interface ConversationListLead {
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  external_id: string;
}

export interface ConversationListChannel {
  channel_type: string;
  via_provider: string;
}

export interface ConversationListRow {
  id: number;
  phase_number: number;
  state: string;
  is_qualified: boolean | null;
  is_handoff_to_human: boolean | null;
  is_unread: boolean;
  is_blocked: boolean;
  assigned_user_id: string | null;
  ai_paused_until: string | null;
  last_message_at: string | null;
  conversation_source: string | null;
  leads: ConversationListLead | null;
  channels: ConversationListChannel | null;
}

export interface FilterParams {
  q?: string;
  channel?: 'all' | 'wa' | 'ig';
  unread?: boolean;
  mine?: boolean;
  viewerId?: string | null;
}

export function classifyTab(row: Pick<ConversationListRow, 'is_handoff_to_human' | 'phase_number' | 'state' | 'is_qualified'>): TabKey {
  // Precedencia: handoff > phase final > bought (proxy hasta Sprint Eta).
  if (row.is_handoff_to_human === true) return 'hot';
  if (row.phase_number === 6) return 'done';
  // Comprado proxy: state=closed AND qualified=true (sin handoff por la guarda
  // anterior). Reemplazar por `ghl_opportunity_status='won'` cuando el webhook
  // GHL escriba ese campo (Sprint Eta).
  if (row.state === 'closed' && row.is_qualified === true) {
    return 'bought';
  }
  return 'chats';
}

export function tabCounts(rows: ConversationListRow[]): Record<TabKey, number> {
  const counts: Record<TabKey, number> = { chats: 0, hot: 0, done: 0, bought: 0 };
  for (const r of rows) counts[classifyTab(r)] += 1;
  return counts;
}

function normalizeChannelType(channelType: string | null | undefined): 'wa' | 'ig' | 'other' {
  if (channelType === 'whatsapp') return 'wa';
  if (channelType === 'instagram_dm') return 'ig';
  return 'other';
}

export function applyFilters(
  rows: ConversationListRow[],
  filters: FilterParams,
): ConversationListRow[] {
  const q = (filters.q ?? '').trim().toLowerCase();
  const channel = filters.channel ?? 'all';
  const unread = filters.unread === true;
  const mine = filters.mine === true;
  const viewerId = filters.viewerId ?? null;

  return rows.filter((row) => {
    if (unread && row.is_unread !== true) return false;
    if (mine) {
      if (!viewerId) return false;
      if (row.assigned_user_id !== viewerId) return false;
    }
    if (channel !== 'all') {
      const norm = normalizeChannelType(row.channels?.channel_type ?? null);
      if (norm !== channel) return false;
    }
    if (q.length > 0) {
      const haystack = [
        row.leads?.first_name ?? '',
        row.leads?.last_name ?? '',
        row.leads?.username ?? '',
        row.leads?.external_id ?? '',
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

export function rowsForTab(
  rows: ConversationListRow[],
  tab: TabKey,
  filters: FilterParams,
): ConversationListRow[] {
  const filtered = applyFilters(rows, filters);
  return filtered.filter((r) => classifyTab(r) === tab);
}

const VALID_TABS: readonly TabKey[] = ['chats', 'hot', 'done', 'bought'] as const;

export function parseTab(value: string | null | undefined): TabKey {
  if (value && (VALID_TABS as readonly string[]).includes(value)) return value as TabKey;
  return 'chats';
}

export function parseChannel(value: string | null | undefined): 'all' | 'wa' | 'ig' {
  if (value === 'wa' || value === 'ig' || value === 'all') return value;
  return 'all';
}

export function parseBoolFlag(value: string | null | undefined): boolean {
  return value === '1' || value === 'true';
}
