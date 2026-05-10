'use server';

import { revalidatePath } from 'next/cache';
import { getEffectiveTenant } from '@/lib/effective-tenant';
import { getServiceRoleClient } from '@/lib/supabase/service-role';
import { computeLabelSideEffects, hasSideEffects } from '@/lib/labels-side-effects';
import type {
  LeadListRow,
  LeadListConv,
  LeadListLabel,
  LeadFilterParams,
  DestinationBucket,
} from '@/lib/lead-list-query';

/**
 * Sprint Mu.2 — Server Actions para /contacts.
 *
 * Diseño escalable (target: miles de leads × decenas de sub-cuentas):
 *  - listContactsPage: SQL aplica filtros lead-level + algunos conv-level
 *    server-side. Cursor-based pagination keyset sobre
 *    (last_message_at DESC NULLS LAST, id DESC). Página default 100.
 *  - getContactDetail: detalle por leadId — no cambia salvo que lead.last_message_at
 *    ahora viene denormalizado.
 *  - Acciones individuales: updateLead, applyLeadLabel/removeLeadLabel,
 *    assignLead, togglePauseLead, addContactNote.
 *
 * RBAC: viewer puede leer todo; aplicar etiquetas/asignar/pausar requiere
 * collaborator+ (admin/owner). Editar datos del lead requiere collaborator+
 * también (data sensible).
 */

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 200;

export type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface CursorParam {
  lastMessageAt: string | null;
  id: number;
}

export interface ListContactsPageInput {
  filters: LeadFilterParams;
  cursor?: CursorParam | null;
  limit?: number;
}

export interface ListContactsPageResult {
  rows: LeadListRow[];
  nextCursor: CursorParam | null;
  hasMore: boolean;
}

export interface ContactPipelineEvent {
  id: number;
  conversationId: number;
  eventType: 'phase_change' | 'outcome_applied' | 'outcome_removed';
  fromValue: string | null;
  toValue: string;
  source: string;
  occurredAt: string;
}

export interface ContactNote {
  id: number;
  conversationId: number;
  content: string;
  authorEmail: string | null;
  createdAt: string;
}

export interface ContactDetail {
  lead: LeadListRow;
  events: ContactPipelineEvent[];
  notes: ContactNote[];
}

// ---------------------------------------------------------------------------
// Helpers privados
// ---------------------------------------------------------------------------

interface RawChannelRel {
  channel_type: string | null;
  via_provider: string | null;
}

function pickFirst<T>(rel: T | T[] | null | undefined): T | null {
  if (rel == null) return null;
  if (Array.isArray(rel)) return rel[0] ?? null;
  return rel;
}

interface RawConvRow {
  id: number;
  channel_id: number;
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
  channels: RawChannelRel | RawChannelRel[] | null;
}

function mapConv(raw: RawConvRow, labels: LeadListLabel[]): LeadListConv {
  const channel = pickFirst(raw.channels);
  return {
    id: Number(raw.id),
    channel_id: Number(raw.channel_id),
    channel_type: channel?.channel_type ?? null,
    via_provider: channel?.via_provider ?? null,
    state: String(raw.state),
    phase_number: Number(raw.phase_number),
    is_qualified: raw.is_qualified,
    is_handoff_to_human: Boolean(raw.is_handoff_to_human),
    is_blocked: Boolean(raw.is_blocked),
    ai_paused_until: raw.ai_paused_until,
    handoff_cause: raw.handoff_cause,
    handoff_reason: raw.handoff_reason,
    handoff_at: raw.handoff_at,
    conversation_source: raw.conversation_source,
    call_scheduled_at: raw.call_scheduled_at,
    is_call_scheduling_link_sent: Boolean(raw.is_call_scheduling_link_sent),
    last_message_at: raw.last_message_at,
    created_at: String(raw.created_at),
    updated_at: String(raw.updated_at),
    assigned_user_id: raw.assigned_user_id,
    labels,
  };
}

interface RawLabelRel {
  id: number;
  name: string;
  color: string;
  destination_bucket: string | null;
}

function mapLabel(raw: RawLabelRel): LeadListLabel {
  return {
    id: Number(raw.id),
    name: String(raw.name),
    color: String(raw.color),
    destination_bucket: (raw.destination_bucket ?? null) as DestinationBucket | null,
  };
}

async function fetchLabelsByConvId(
  supabase: ReturnType<typeof getServiceRoleClient>,
  tenantId: number,
  conversationIds: number[],
): Promise<Map<number, LeadListLabel[]>> {
  const map = new Map<number, LeadListLabel[]>();
  if (conversationIds.length === 0) return map;

  const { data } = await supabase
    .from('conversation_labels')
    .select('conversation_id, tenant_labels(id, name, color, destination_bucket)')
    .eq('tenant_id', tenantId)
    .in('conversation_id', conversationIds);

  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const convId = Number(row.conversation_id);
    const rel = row.tenant_labels as RawLabelRel | RawLabelRel[] | null;
    const labelObj = pickFirst(rel);
    if (!labelObj) continue;
    const arr = map.get(convId) ?? [];
    arr.push(mapLabel(labelObj));
    map.set(convId, arr);
  }
  return map;
}

/**
 * Sanitiza un valor para usarlo dentro de un patrón ILIKE de Supabase. Los
 * caracteres `%` y `_` son wildcards de SQL; los escapamos para evitar
 * matches accidentales. La coma es metacarácter en `.or()` de PostgREST,
 * así que también la quitamos.
 */
function sanitizeIlike(value: string): string {
  return value.replace(/[,()%_]/g, '');
}

/**
 * Pre-fetch de channel ids del tenant que matchean un set de channel_types
 * y/o providers. Devuelve la lista de IDs para filtrar `leads.channel_id`.
 *
 * Se usa cuando hay filtros canal/provider — más fiable que filtrar nested
 * 2-niveles en supabase-js (que solo soporta filter de 1er nivel anidado).
 */
async function resolveChannelIdsForFilters(
  supabase: ReturnType<typeof getServiceRoleClient>,
  tenantId: number,
  channelKeys: string[],
  providerKeys: string[],
): Promise<number[] | null> {
  if (channelKeys.length === 0 && providerKeys.length === 0) return null;

  const channelTypeMap: Record<string, string> = {
    wa: 'whatsapp',
    ig: 'instagram_dm',
    fb: 'facebook_messenger',
  };
  const channelTypes = channelKeys.map((k) => channelTypeMap[k] ?? k);

  let q = supabase.from('channels').select('id').eq('tenant_id', tenantId);
  if (channelTypes.length > 0) q = q.in('channel_type', channelTypes);
  if (providerKeys.length > 0) q = q.in('via_provider', providerKeys);

  const { data } = await q;
  return (data ?? []).map((r) => Number((r as { id: number }).id));
}

// ---------------------------------------------------------------------------
// listContactsPage — server-side filtering + cursor pagination
// ---------------------------------------------------------------------------

export async function listContactsPage(
  input: ListContactsPageInput,
): Promise<ActionResult<ListContactsPageResult>> {
  const filters = input.filters;
  const cursor = input.cursor ?? null;
  const limit = Math.max(1, Math.min(input.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE));

  const effective = await getEffectiveTenant();
  if (!effective) return { ok: false, error: 'unauthenticated' };

  const supabase = getServiceRoleClient();

  // Pre-resolve channel_ids si hay filtro canal/provider.
  const channelIdsFilter = await resolveChannelIdsForFilters(
    supabase,
    effective.tenantId,
    filters.channels ?? [],
    filters.providers ?? [],
  );
  if (channelIdsFilter !== null && channelIdsFilter.length === 0) {
    // No hay channels que matcheen → resultado vacío.
    return { ok: true, data: { rows: [], nextCursor: null, hasMore: false } };
  }

  // Decisión de inner vs left join: si hay filtros conv-level, usamos
  // !inner para que Supabase haga inner-join y excluya leads sin convs
  // que matcheen los filtros nested. Sin filtros conv-level → no embeded
  // join (más rápido).
  const hasConvFilters =
    (filters.phases ?? []).length > 0 ||
    (filters.states ?? []).length > 0 ||
    (filters.qualified ?? 'all') !== 'all' ||
    (filters.handoffCauses ?? []).length > 0 ||
    (filters.triggers ?? []).length > 0 ||
    (filters.assignee ?? 'any') !== 'any';

  const convSelect = `
    id, channel_id, state, phase_number, is_qualified, is_handoff_to_human, is_blocked,
    ai_paused_until, handoff_cause, handoff_reason, handoff_at, conversation_source,
    call_scheduled_at, is_call_scheduling_link_sent, last_message_at, created_at, updated_at,
    assigned_user_id,
    channels(channel_type, via_provider)
  `;

  let q = supabase
    .from('leads')
    .select(
      `id, first_name, last_name, username, phone, email, location, notes,
       external_id, source_channel, created_at, updated_at, last_message_at,
       conversations${hasConvFilters ? '!inner' : ''}(${convSelect})`,
    )
    .eq('tenant_id', effective.tenantId);

  // ---- Búsqueda libre (lead-level, indexado con pg_trgm) ----
  const qStr = (filters.q ?? '').trim();
  if (qStr.length > 0) {
    const safe = sanitizeIlike(qStr);
    if (safe.length > 0) {
      q = q.or(
        [
          `first_name.ilike.%${safe}%`,
          `last_name.ilike.%${safe}%`,
          `username.ilike.%${safe}%`,
          `phone.ilike.%${safe}%`,
          `email.ilike.%${safe}%`,
          `external_id.ilike.%${safe}%`,
          `location.ilike.%${safe}%`,
        ].join(','),
      );
    }
  }

  // ---- Channel filter via channel_id IN (precomputed) ----
  if (channelIdsFilter !== null) {
    q = q.in('channel_id', channelIdsFilter);
  }

  // ---- Date ranges sobre lead.created_at ----
  if (filters.createdFrom) q = q.gte('created_at', filters.createdFrom);
  if (filters.createdTo) q = q.lte('created_at', filters.createdTo);

  // ---- last_message_at: rango o "nunca" ----
  if (filters.lastMsgNever) {
    q = q.is('last_message_at', null);
  } else {
    if (filters.lastMsgFrom) q = q.gte('last_message_at', filters.lastMsgFrom);
    if (filters.lastMsgTo) q = q.lte('last_message_at', filters.lastMsgTo);
  }

  // ---- Conversation-level filters (vía nested table prefix) ----
  if ((filters.phases ?? []).length > 0) {
    q = q.in('conversations.phase_number', filters.phases as number[]);
  }
  if ((filters.states ?? []).length > 0) {
    q = q.in('conversations.state', filters.states as string[]);
  }
  if (filters.qualified === 'yes') q = q.eq('conversations.is_qualified', true);
  else if (filters.qualified === 'no') q = q.eq('conversations.is_qualified', false);
  else if (filters.qualified === 'undecided') q = q.is('conversations.is_qualified', null);
  if ((filters.handoffCauses ?? []).length > 0) {
    q = q.in('conversations.handoff_cause', filters.handoffCauses as string[]);
  }
  if ((filters.triggers ?? []).length > 0) {
    q = q.in('conversations.conversation_source', filters.triggers as string[]);
  }
  if (filters.assignee && filters.assignee !== 'any') {
    if (filters.assignee === 'unassigned') {
      q = q.is('conversations.assigned_user_id', null);
    } else if (filters.assignee === 'mine') {
      q = q.eq('conversations.assigned_user_id', effective.userId);
    } else {
      q = q.eq('conversations.assigned_user_id', filters.assignee);
    }
  }

  // ---- Cursor (keyset pagination DESC NULLS LAST) ----
  // Caso A: cursor con last_message_at NOT NULL.
  //   match si lead.last_message_at < cursor.lastMessageAt
  //   OR (lead.last_message_at = cursor.lastMessageAt AND lead.id < cursor.id)
  //   OR lead.last_message_at IS NULL
  // Caso B: cursor con last_message_at NULL (ya en bucket NULL).
  //   match si last_message_at IS NULL AND id < cursor.id
  if (cursor) {
    if (cursor.lastMessageAt !== null) {
      q = q.or(
        [
          `last_message_at.lt.${cursor.lastMessageAt}`,
          `and(last_message_at.eq.${cursor.lastMessageAt},id.lt.${cursor.id})`,
          `last_message_at.is.null`,
        ].join(','),
      );
    } else {
      q = q.is('last_message_at', null).lt('id', cursor.id);
    }
  }

  q = q
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false })
    .limit(limit + 1);

  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };

  const allRaw = (data ?? []) as Array<Record<string, unknown>>;
  const hasMore = allRaw.length > limit;
  const visibleRaw = hasMore ? allRaw.slice(0, limit) : allRaw;

  // Recolectar conv ids para fetch de labels.
  const convIds: number[] = [];
  const partialRows = visibleRaw.map((raw) => {
    const r = raw as Record<string, unknown> & {
      conversations: RawConvRow[] | null;
    };
    const convs = (r.conversations ?? []).map((c) => mapConv(c, []));
    for (const c of convs) convIds.push(c.id);
    return {
      raw: r,
      convs,
    };
  });

  // Fetch labels en batch.
  const labelsByConvId = await fetchLabelsByConvId(supabase, effective.tenantId, convIds);

  let rows: LeadListRow[] = partialRows.map(({ raw, convs }) => {
    for (const c of convs) {
      c.labels = labelsByConvId.get(c.id) ?? [];
    }
    return {
      id: Number(raw.id),
      first_name: (raw.first_name as string | null) ?? null,
      last_name: (raw.last_name as string | null) ?? null,
      username: (raw.username as string | null) ?? null,
      phone: (raw.phone as string | null) ?? null,
      email: (raw.email as string | null) ?? null,
      location: (raw.location as string | null) ?? null,
      external_id: String(raw.external_id ?? ''),
      source_channel: (raw.source_channel as string | null) ?? null,
      notes: (raw.notes as string | null) ?? null,
      created_at: String(raw.created_at),
      updated_at: String(raw.updated_at),
      conversations: convs,
    };
  });

  // ---- Filtros post-fetch (no expresables fácil en SQL con supabase-js) ----
  if ((filters.labelIds ?? []).length > 0) {
    const wanted = new Set(filters.labelIds);
    rows = rows.filter((r) =>
      r.conversations.some((c) => c.labels.some((l) => wanted.has(l.id))),
    );
  }

  if (filters.aiState && filters.aiState !== 'all') {
    const now = Date.now();
    rows = rows.filter((r) => {
      const paused = r.conversations.some((c) => {
        if (c.is_handoff_to_human) return true;
        if (!c.ai_paused_until) return false;
        if (c.ai_paused_until === 'infinity') return true;
        const ts = Date.parse(c.ai_paused_until);
        return Number.isFinite(ts) ? ts > now : true;
      });
      return filters.aiState === 'paused' ? paused : !paused;
    });
  }

  if (filters.blocked && filters.blocked !== 'all') {
    rows = rows.filter((r) => {
      const isB = r.conversations.some((c) => c.is_blocked);
      return filters.blocked === 'yes' ? isB : !isB;
    });
  }

  if (filters.scheduled && filters.scheduled !== 'all') {
    rows = rows.filter((r) => {
      const has = r.conversations.some((c) => c.call_scheduled_at != null);
      return filters.scheduled === 'yes' ? has : !has;
    });
  }

  // nextCursor desde el último row visible (antes de filtros JS) — así
  // siempre avanzamos la ventana SQL, aunque el filter JS deje la página
  // con menos rows visibles.
  let nextCursor: CursorParam | null = null;
  if (hasMore && visibleRaw.length > 0) {
    const last = visibleRaw[visibleRaw.length - 1] as { last_message_at: string | null; id: number };
    nextCursor = {
      lastMessageAt: last.last_message_at ?? null,
      id: Number(last.id),
    };
  }

  return { ok: true, data: { rows, nextCursor, hasMore } };
}

// ---------------------------------------------------------------------------
// getContactDetail — detalle por leadId
// ---------------------------------------------------------------------------

export async function getContactDetail(leadId: number): Promise<ActionResult<ContactDetail>> {
  if (!Number.isFinite(leadId) || leadId <= 0) {
    return { ok: false, error: 'invalid leadId' };
  }
  const effective = await getEffectiveTenant();
  if (!effective) return { ok: false, error: 'unauthenticated' };

  const supabase = getServiceRoleClient();

  const { data: leadRaw, error: leadErr } = await supabase
    .from('leads')
    .select(
      `id, first_name, last_name, username, phone, email, location, notes,
       external_id, source_channel, created_at, updated_at, last_message_at`,
    )
    .eq('id', leadId)
    .eq('tenant_id', effective.tenantId)
    .maybeSingle();

  if (leadErr) return { ok: false, error: leadErr.message };
  if (!leadRaw) return { ok: false, error: 'not found' };

  const { data: convsRaw, error: convsErr } = await supabase
    .from('conversations')
    .select(
      `id, channel_id, state, phase_number, is_qualified, is_handoff_to_human,
       is_blocked, ai_paused_until, handoff_cause, handoff_reason, handoff_at,
       conversation_source, call_scheduled_at, is_call_scheduling_link_sent,
       last_message_at, created_at, updated_at, assigned_user_id,
       channels(channel_type, via_provider)`,
    )
    .eq('lead_id', leadId)
    .eq('tenant_id', effective.tenantId)
    .order('created_at', { ascending: false });

  if (convsErr) return { ok: false, error: convsErr.message };

  const convIds = (convsRaw ?? []).map((c) => Number((c as { id: number }).id));

  const labelsPromise = fetchLabelsByConvId(supabase, effective.tenantId, convIds);

  const eventsPromise =
    convIds.length > 0
      ? supabase
          .from('pipeline_events')
          .select('id, conversation_id, event_type, from_value, to_value, source, occurred_at')
          .eq('tenant_id', effective.tenantId)
          .in('conversation_id', convIds)
          .order('occurred_at', { ascending: false })
          .limit(200)
      : Promise.resolve({ data: [] as unknown[], error: null });

  const notesPromise =
    convIds.length > 0
      ? supabase
          .from('conversation_notes')
          .select('id, conversation_id, content, author_email, created_at')
          .eq('tenant_id', effective.tenantId)
          .in('conversation_id', convIds)
          .order('created_at', { ascending: false })
          .limit(200)
      : Promise.resolve({ data: [] as unknown[], error: null });

  const [labelsByConvId, eventsRes, notesRes] = await Promise.all([
    labelsPromise,
    eventsPromise,
    notesPromise,
  ]);

  if ('error' in eventsRes && eventsRes.error) {
    return { ok: false, error: (eventsRes.error as { message: string }).message };
  }
  if ('error' in notesRes && notesRes.error) {
    return { ok: false, error: (notesRes.error as { message: string }).message };
  }

  const conversations: LeadListConv[] = (convsRaw ?? []).map((c) =>
    mapConv(c as RawConvRow, labelsByConvId.get(Number((c as { id: number }).id)) ?? []),
  );

  const events: ContactPipelineEvent[] = ((eventsRes.data ?? []) as Array<Record<string, unknown>>).map(
    (e) => ({
      id: Number(e.id),
      conversationId: Number(e.conversation_id),
      eventType: e.event_type as ContactPipelineEvent['eventType'],
      fromValue: (e.from_value as string | null) ?? null,
      toValue: String(e.to_value),
      source: String(e.source),
      occurredAt: String(e.occurred_at),
    }),
  );

  const notes: ContactNote[] = ((notesRes.data ?? []) as Array<Record<string, unknown>>).map((n) => ({
    id: Number(n.id),
    conversationId: Number(n.conversation_id),
    content: String(n.content),
    authorEmail: (n.author_email as string | null) ?? null,
    createdAt: String(n.created_at),
  }));

  const r = leadRaw as Record<string, unknown>;
  const lead: LeadListRow = {
    id: Number(r.id),
    first_name: (r.first_name as string | null) ?? null,
    last_name: (r.last_name as string | null) ?? null,
    username: (r.username as string | null) ?? null,
    phone: (r.phone as string | null) ?? null,
    email: (r.email as string | null) ?? null,
    location: (r.location as string | null) ?? null,
    external_id: String(r.external_id ?? ''),
    source_channel: (r.source_channel as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
    conversations,
  };

  return { ok: true, data: { lead, events, notes } };
}

// ---------------------------------------------------------------------------
// Acciones de mutación (Mu.2)
// ---------------------------------------------------------------------------

interface AuthCtx {
  userId: string;
  tenantId: number;
  isAgencyAdmin: boolean;
  role: 'owner' | 'admin' | 'viewer';
}

function isCollaboratorOrAbove(ctx: { isAgencyAdmin: boolean; role: string }): boolean {
  return ctx.isAgencyAdmin || ctx.role === 'owner' || ctx.role === 'admin';
}

async function authorizeLeadWrite(
  leadId: number,
): Promise<{ ok: true; ctx: AuthCtx; supabase: ReturnType<typeof getServiceRoleClient> } | { ok: false; error: string }> {
  if (!Number.isFinite(leadId) || leadId <= 0) {
    return { ok: false, error: 'invalid leadId' };
  }
  const effective = await getEffectiveTenant();
  if (!effective) return { ok: false, error: 'unauthenticated' };

  const supabase = getServiceRoleClient();
  const { data: lead } = await supabase
    .from('leads')
    .select('tenant_id')
    .eq('id', leadId)
    .maybeSingle();
  if (!lead) return { ok: false, error: 'lead no encontrado' };
  if (Number(lead.tenant_id) !== effective.tenantId && !effective.isAgencyAdmin) {
    return { ok: false, error: 'forbidden — wrong tenant' };
  }
  const ctx: AuthCtx = {
    userId: effective.userId,
    tenantId: Number(lead.tenant_id),
    isAgencyAdmin: effective.isAgencyAdmin,
    role: effective.role,
  };
  if (!isCollaboratorOrAbove(ctx)) {
    return { ok: false, error: 'forbidden — viewer no puede editar contactos' };
  }
  return { ok: true, ctx, supabase };
}

async function getLeadConversationIds(
  supabase: ReturnType<typeof getServiceRoleClient>,
  leadId: number,
  tenantId: number,
): Promise<number[]> {
  const { data } = await supabase
    .from('conversations')
    .select('id')
    .eq('lead_id', leadId)
    .eq('tenant_id', tenantId);
  return ((data ?? []) as Array<{ id: number }>).map((c) => Number(c.id));
}

// ---- updateLead ----------------------------------------------------------

export interface UpdateLeadPatch {
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  phone?: string | null;
  email?: string | null;
  location?: string | null;
  notes?: string | null;
}

export async function updateLead(input: {
  leadId: number;
  patch: UpdateLeadPatch;
}): Promise<ActionResult> {
  const auth = await authorizeLeadWrite(input.leadId);
  if (!auth.ok) return auth;

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const trimNullable = (v: unknown): string | null => {
    if (v == null) return null;
    const s = String(v).trim();
    return s.length > 0 ? s : null;
  };

  if (input.patch.firstName !== undefined) updates.first_name = trimNullable(input.patch.firstName);
  if (input.patch.lastName !== undefined) updates.last_name = trimNullable(input.patch.lastName);
  if (input.patch.username !== undefined) updates.username = trimNullable(input.patch.username);
  if (input.patch.phone !== undefined) updates.phone = trimNullable(input.patch.phone);
  if (input.patch.email !== undefined) {
    const e = trimNullable(input.patch.email);
    if (e !== null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
      return { ok: false, error: 'email inválido' };
    }
    updates.email = e;
  }
  if (input.patch.location !== undefined) updates.location = trimNullable(input.patch.location);
  if (input.patch.notes !== undefined) updates.notes = trimNullable(input.patch.notes);

  if (Object.keys(updates).length === 1) return { ok: true }; // solo updated_at, no-op

  const { error } = await auth.supabase
    .from('leads')
    .update(updates)
    .eq('id', input.leadId)
    .eq('tenant_id', auth.ctx.tenantId);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/contacts');
  revalidatePath(`/contacts/${input.leadId}`);
  return { ok: true };
}

// ---- applyLeadLabel / removeLeadLabel ------------------------------------

async function loadLabelMeta(
  supabase: ReturnType<typeof getServiceRoleClient>,
  labelId: number,
  tenantId: number,
): Promise<
  | { ok: true; pauseAiOnApply: boolean; resumeAiOnApply: boolean; autoAssignTo: string | null }
  | { ok: false; error: string }
> {
  const { data } = await supabase
    .from('tenant_labels')
    .select('id, tenant_id, pause_ai_on_apply, resume_ai_on_apply, auto_assign_to')
    .eq('id', labelId)
    .maybeSingle();
  if (!data) return { ok: false, error: 'etiqueta no encontrada' };
  if (Number(data.tenant_id) !== tenantId) {
    return { ok: false, error: 'la etiqueta no pertenece a esta sub-cuenta' };
  }
  return {
    ok: true,
    pauseAiOnApply: Boolean(data.pause_ai_on_apply),
    resumeAiOnApply: Boolean(data.resume_ai_on_apply),
    autoAssignTo: (data.auto_assign_to as string | null) ?? null,
  };
}

export async function applyLeadLabel(input: {
  leadId: number;
  labelId: number;
}): Promise<ActionResult> {
  const auth = await authorizeLeadWrite(input.leadId);
  if (!auth.ok) return auth;
  if (!Number.isFinite(input.labelId) || input.labelId <= 0) {
    return { ok: false, error: 'invalid labelId' };
  }

  const labelMeta = await loadLabelMeta(auth.supabase, input.labelId, auth.ctx.tenantId);
  if (!labelMeta.ok) return labelMeta;

  const convIds = await getLeadConversationIds(auth.supabase, input.leadId, auth.ctx.tenantId);
  if (convIds.length === 0) return { ok: false, error: 'el lead no tiene conversaciones' };

  // INSERT idempotente para todas las convs.
  const inserts = convIds.map((cid) => ({
    conversation_id: cid,
    label_id: input.labelId,
    tenant_id: auth.ctx.tenantId,
    applied_by: auth.ctx.userId,
    applied_via: 'manual' as const,
  }));
  const { error: insertErr } = await auth.supabase
    .from('conversation_labels')
    .upsert(inserts, { onConflict: 'conversation_id,label_id', ignoreDuplicates: true });
  if (insertErr) return { ok: false, error: insertErr.message };

  // Side effects (pause AI / auto-assign) sobre cada conv individualmente.
  for (const cid of convIds) {
    const { data: cur } = await auth.supabase
      .from('conversations')
      .select('assigned_user_id')
      .eq('id', cid)
      .maybeSingle();
    const currentAssigned = (cur?.assigned_user_id as string | null) ?? null;
    const patch = computeLabelSideEffects({
      pauseAiOnApply: labelMeta.pauseAiOnApply,
      resumeAiOnApply: labelMeta.resumeAiOnApply,
      autoAssignTo: labelMeta.autoAssignTo,
      currentAssignedUserId: currentAssigned,
    });
    if (hasSideEffects(patch)) {
      await auth.supabase
        .from('conversations')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', cid)
        .eq('tenant_id', auth.ctx.tenantId);
    }
  }

  revalidatePath('/contacts');
  revalidatePath(`/contacts/${input.leadId}`);
  revalidatePath('/conversations');
  return { ok: true };
}

export async function removeLeadLabel(input: {
  leadId: number;
  labelId: number;
}): Promise<ActionResult> {
  const auth = await authorizeLeadWrite(input.leadId);
  if (!auth.ok) return auth;
  if (!Number.isFinite(input.labelId) || input.labelId <= 0) {
    return { ok: false, error: 'invalid labelId' };
  }

  const convIds = await getLeadConversationIds(auth.supabase, input.leadId, auth.ctx.tenantId);
  if (convIds.length === 0) return { ok: true };

  const { error } = await auth.supabase
    .from('conversation_labels')
    .delete()
    .eq('label_id', input.labelId)
    .eq('tenant_id', auth.ctx.tenantId)
    .in('conversation_id', convIds);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/contacts');
  revalidatePath(`/contacts/${input.leadId}`);
  revalidatePath('/conversations');
  return { ok: true };
}

// ---- assignLead ----------------------------------------------------------

export async function assignLead(input: {
  leadId: number;
  userId: string | null;
}): Promise<ActionResult> {
  const auth = await authorizeLeadWrite(input.leadId);
  if (!auth.ok) return auth;

  // Verifica que el userId (si != null) pertenezca al tenant — evita asignar
  // a alguien fuera de la sub-cuenta.
  if (input.userId !== null) {
    const { data: profile } = await auth.supabase
      .from('profiles')
      .select('id, tenant_id, is_active')
      .eq('id', input.userId)
      .maybeSingle();
    if (!profile) return { ok: false, error: 'miembro no encontrado' };
    if (Number(profile.tenant_id) !== auth.ctx.tenantId && !auth.ctx.isAgencyAdmin) {
      return { ok: false, error: 'el miembro no pertenece a esta sub-cuenta' };
    }
    if (profile.is_active === false) return { ok: false, error: 'miembro inactivo' };
  }

  const { error } = await auth.supabase
    .from('conversations')
    .update({ assigned_user_id: input.userId, updated_at: new Date().toISOString() })
    .eq('lead_id', input.leadId)
    .eq('tenant_id', auth.ctx.tenantId);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/contacts');
  revalidatePath(`/contacts/${input.leadId}`);
  revalidatePath('/conversations');
  return { ok: true };
}

// ---- togglePauseLead -----------------------------------------------------

export async function togglePauseLead(input: {
  leadId: number;
  paused: boolean;
}): Promise<ActionResult> {
  const auth = await authorizeLeadWrite(input.leadId);
  if (!auth.ok) return auth;

  const update = input.paused
    ? { ai_paused_until: 'infinity', updated_at: new Date().toISOString() }
    : { ai_paused_until: null, updated_at: new Date().toISOString() };

  const { error } = await auth.supabase
    .from('conversations')
    .update(update)
    .eq('lead_id', input.leadId)
    .eq('tenant_id', auth.ctx.tenantId);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/contacts');
  revalidatePath(`/contacts/${input.leadId}`);
  revalidatePath('/conversations');
  return { ok: true };
}

// ---- addContactNote ------------------------------------------------------

export async function addContactNote(input: {
  leadId: number;
  content: string;
}): Promise<ActionResult<{ id: number }>> {
  const auth = await authorizeLeadWrite(input.leadId);
  if (!auth.ok) return auth;

  const content = (input.content ?? '').trim();
  if (content.length === 0) return { ok: false, error: 'nota vacía' };
  if (content.length > 4000) return { ok: false, error: 'nota demasiado larga (>4000)' };

  // Conversation más reciente del lead — donde se guarda la nota.
  const { data: convs } = await auth.supabase
    .from('conversations')
    .select('id')
    .eq('lead_id', input.leadId)
    .eq('tenant_id', auth.ctx.tenantId)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(1);
  const convId = ((convs ?? [])[0] as { id: number } | undefined)?.id;
  if (!convId) return { ok: false, error: 'el lead no tiene conversaciones' };

  // Resolver email del autor para audit.
  const { data: profile } = await auth.supabase
    .from('profiles')
    .select('email')
    .eq('id', auth.ctx.userId)
    .maybeSingle();
  const authorEmail = (profile?.email as string | null) ?? null;

  const { data, error } = await auth.supabase
    .from('conversation_notes')
    .insert({
      conversation_id: convId,
      tenant_id: auth.ctx.tenantId,
      content,
      author_user_id: auth.ctx.userId,
      author_email: authorEmail,
    })
    .select('id')
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? 'insert failed' };

  revalidatePath('/contacts');
  revalidatePath(`/contacts/${input.leadId}`);
  revalidatePath('/conversations');
  return { ok: true, data: { id: Number(data.id) } };
}
