import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getEffectiveTenant } from '@/lib/effective-tenant';
import { listMembers } from '@/lib/actions/members';
import { listConversationNotes } from '@/lib/actions/conversations';
import { listLabels, type LabelRow } from '@/lib/actions/labels';
import {
  listScheduledFollowups,
  type ScheduledFollowupRow,
} from '@/lib/actions/followups';
import {
  getTenantFollowupConfig,
  type TenantFollowupConfigRow,
} from '@/lib/actions/followup-config';
import { materializeFollowupSequenceForConv } from '@/lib/actions/materialize-followup';
import {
  type ConversationListRow,
  type ConversationListLabel,
  type FilterParams,
  type TabKey,
} from '@/lib/conversation-list-query';
import { ConversationShell } from './conversation-shell';
import { ConversationListPane } from './conversation-list-pane';
import { ThreadPane } from './thread-pane';
import { ControlPanel } from './control-panel';
import type {
  ConversationNote,
  ConversationViewer,
  SelectedConversationDetail,
  TenantMember,
  TimelineMessage,
} from './types';

interface Props {
  selectedId: number | null;
  activeTab: TabKey;
  filters: FilterParams;
}

const LIST_LIMIT = 100;
const MESSAGES_LIMIT = 200;

export async function ConversationLayout({ selectedId, activeTab, filters }: Props) {
  const supabase = await createSupabaseServerClient();
  const effective = await getEffectiveTenant();
  if (!effective) notFound();

  // ---- Carga lista (siempre) ----------------------------------------------
  const listPromise = supabase
    .from('conversations')
    .select(
      `id, lead_id, channel_id, phase_number, state, conversation_source,
       ai_paused_until, last_message_at, created_at, updated_at,
       is_qualified, is_handoff_to_human, is_unread, is_blocked, assigned_user_id,
       leads(first_name, last_name, username, external_id),
       channels(channel_type, via_provider)`,
    )
    .eq('tenant_id', effective.tenantId)
    .order('updated_at', { ascending: false })
    .limit(LIST_LIMIT);

  // ---- Carga miembros tenant (siempre — para dropdown asignar + map) ------
  const membersPromise = listMembers({ tenantId: effective.tenantId });

  // ---- Sprint Eta — carga labels del tenant (selector + filtro) -----------
  const allLabelsPromise = listLabels();

  // ---- Sprint Iota.1.c — config followups (para chat panel) ---------------
  const followupConfigPromise = getTenantFollowupConfig();

  // ---- Sprint Iota.1.c — materializar SECUENCIA COMPLETA al entrar a conv -
  // Si la conv es elegible (IG/FB con auto-followups enabled), creamos toda
  // la secuencia restante en BD para que el panel derecho la muestre con
  // hora absoluta + preview. Best-effort: si falla, seguir.
  if (selectedId) {
    try {
      await materializeFollowupSequenceForConv(selectedId);
    } catch {
      // ignore — el cron 15min lo intentará después
    }
  }

  // ---- Sprint Iota.1 — followups programados (solo si hay selectedId) -----
  const followupsPromise = selectedId
    ? listScheduledFollowups(selectedId)
    : Promise.resolve({ ok: true as const, data: [] as ScheduledFollowupRow[] });

  // ---- Sprint Iota.1 — último mensaje del lead (para detectar 24h WA) -----
  const lastLeadMessagePromise = selectedId
    ? supabase
        .from('conversation_messages')
        .select('sent_at')
        .eq('conversation_id', selectedId)
        .eq('source', 'lead')
        .order('sent_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    : Promise.resolve({ data: null });

  // ---- Carga detalle + mensajes + notas (solo si selectedId) --------------
  const detailPromise = selectedId
    ? supabase
        .from('conversations')
        .select(
          `id, tenant_id, lead_id, channel_id, phase_number, phase_message_count, state,
           conversation_source, ai_paused_until, created_at, updated_at,
           is_qualified, is_handoff_to_human, is_unread, is_blocked, assigned_user_id,
           handoff_cause, handoff_reason, handoff_at,
           current_context, emotion, problem, goal, urgency, next_action,
           general_context, general_motivation, priority,
           leads(first_name, last_name, username, external_id, phone, email),
           channels(channel_type, via_provider)`,
        )
        .eq('id', selectedId)
        .eq('tenant_id', effective.tenantId)
        .maybeSingle()
    : Promise.resolve({ data: null });

  const messagesPromise = selectedId
    ? supabase
        .from('conversation_messages')
        .select('id, source, content_type, content, transcription, media_url, sent_at')
        .eq('conversation_id', selectedId)
        .order('sent_at', { ascending: true })
        .limit(MESSAGES_LIMIT)
    : Promise.resolve({ data: [] as TimelineMessage[] });

  const notesPromise = selectedId
    ? listConversationNotes(selectedId)
    : Promise.resolve({ ok: true as const, data: [] as ConversationNote[] });

  // Resolver email del viewer para audit/UI (no bloqueante para la lista)
  const viewerEmailPromise = supabase
    .from('profiles')
    .select('email')
    .eq('id', effective.userId)
    .maybeSingle();

  const [
    listRes,
    membersRes,
    detailRes,
    messagesRes,
    notesRes,
    viewerEmailRes,
    allLabelsRes,
    followupConfigRes,
    followupsRes,
    lastLeadMessageRes,
  ] = await Promise.all([
    listPromise,
    membersPromise,
    detailPromise,
    messagesPromise,
    notesPromise,
    viewerEmailPromise,
    allLabelsPromise,
    followupConfigPromise,
    followupsPromise,
    lastLeadMessagePromise,
  ]);

  if (listRes.error) {
    return (
      <div className="p-8 text-sm text-destructive">
        Error cargando conversaciones: {listRes.error.message}
      </div>
    );
  }

  const rawRows = (listRes.data ?? []) as Array<Record<string, unknown>>;

  // Sprint Eta — fetch conversation_labels para los 100 rows + selectedId.
  const allConvIds = new Set<number>(rawRows.map((r) => Number(r.id)));
  if (selectedId) allConvIds.add(selectedId);
  const labelsByConvId = new Map<number, ConversationListLabel[]>();
  if (allConvIds.size > 0) {
    const { data: convLabelRows } = await supabase
      .from('conversation_labels')
      .select('conversation_id, tenant_labels(id, name, color, destination_bucket)')
      .in('conversation_id', Array.from(allConvIds))
      .eq('tenant_id', effective.tenantId);
    for (const r of (convLabelRows ?? []) as Array<Record<string, unknown>>) {
      const cid = Number(r.conversation_id);
      const labelRel = r.tenant_labels as
        | { id: number; name: string; color: string; destination_bucket: string | null }
        | { id: number; name: string; color: string; destination_bucket: string | null }[]
        | null;
      const labelObj = Array.isArray(labelRel) ? labelRel[0] ?? null : labelRel;
      if (!labelObj) continue;
      const arr = labelsByConvId.get(cid) ?? [];
      arr.push({
        id: Number(labelObj.id),
        name: String(labelObj.name),
        color: String(labelObj.color),
        destinationBucket: (labelObj.destination_bucket ?? null) as ConversationListLabel['destinationBucket'],
      });
      labelsByConvId.set(cid, arr);
    }
  }

  const rows = rawRows.map((r) => ({
    ...r,
    labels: labelsByConvId.get(Number(r.id)) ?? [],
  })) as unknown as ConversationListRow[];

  const allLabels: LabelRow[] = allLabelsRes.ok ? allLabelsRes.data ?? [] : [];
  const DEFAULT_FOLLOWUP_CONFIG: TenantFollowupConfigRow = {
    enabled: false,
    windowStartHour: 9,
    windowEndHour: 21,
    windowTimezone: 'Europe/Madrid',
    maxFollowupsPerLead: 3,
    intervalsHours: [6, 12, 20],
    autoPersonalize: true,
    defaultFollowupText: null,
    materializeLookaheadHours: 24,
    followupVoiceExamples: null,
  };
  const followupConfig: TenantFollowupConfigRow = followupConfigRes.ok
    ? followupConfigRes.data!
    : DEFAULT_FOLLOWUP_CONFIG;
  const followups: ScheduledFollowupRow[] = followupsRes.ok ? followupsRes.data ?? [] : [];
  const canManageFollowups =
    effective.isAgencyAdmin || effective.role === 'owner' || effective.role === 'admin';
  const lastLeadMessageAt =
    (lastLeadMessageRes?.data as { sent_at?: string } | null)?.sent_at ?? null;

  const members: TenantMember[] = membersRes.ok
    ? membersRes.data!.map((m) => ({
        userId: m.userId,
        email: m.email,
        fullName: m.fullName,
        role: m.role,
        isActive: m.isActive,
      }))
    : [];

  const assigneeMap: Record<string, string> = {};
  for (const m of members) {
    assigneeMap[m.userId] = m.fullName ?? m.email;
  }

  const viewer: ConversationViewer = {
    userId: effective.userId,
    tenantId: effective.tenantId,
    role: effective.role,
    isAgencyAdmin: effective.isAgencyAdmin,
    email: (viewerEmailRes.data?.email as string | undefined) ?? null,
  };

  // Si selectedId pasado pero no se encontró → notFound (consistente con
  // /conversations/[id] previo).
  let selectedDetail: SelectedConversationDetail | null = null;
  if (selectedId && !detailRes.data) {
    notFound();
  }
  if (selectedId && detailRes.data) {
    selectedDetail = mapDetail(detailRes.data);
    selectedDetail.labels = labelsByConvId.get(selectedId) ?? [];
  }

  const messages =
    (messagesRes && 'data' in messagesRes ? messagesRes.data ?? [] : []) as TimelineMessage[];

  const notes: ConversationNote[] = notesRes.ok ? notesRes.data ?? [] : [];

  return (
    <ConversationShell
      hasSelection={selectedDetail != null}
      list={
        <ConversationListPane
          rows={rows}
          selectedId={selectedDetail?.id ?? null}
          activeTab={activeTab}
          filters={filters}
          assigneeMap={assigneeMap}
          allLabels={allLabels}
        />
      }
      thread={
        <ThreadPane
          detail={selectedDetail}
          messages={messages}
          notes={notes}
          viewer={viewer}
          members={members}
          allLabels={allLabels}
        />
      }
      panel={
        <ControlPanel
          detail={selectedDetail}
          followups={followups}
          followupConfig={followupConfig}
          canManageFollowups={canManageFollowups}
          lastLeadMessageAt={lastLeadMessageAt}
        />
      }
    />
  );
}

interface RawDetailLeadRel {
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  external_id: string;
  phone: string | null;
  email: string | null;
}
interface RawDetailChannelRel {
  channel_type: string;
  via_provider: string;
}

interface RawDetail {
  id: number;
  tenant_id: number;
  lead_id: number;
  channel_id: number;
  phase_number: number;
  phase_message_count: number;
  state: string;
  conversation_source: string | null;
  ai_paused_until: string | null;
  created_at: string;
  updated_at: string;
  is_qualified: boolean | null;
  is_handoff_to_human: boolean;
  is_unread: boolean;
  is_blocked: boolean;
  assigned_user_id: string | null;
  handoff_cause: string | null;
  handoff_reason: string | null;
  handoff_at: string | null;
  current_context: string | null;
  emotion: string | null;
  problem: string | null;
  goal: string | null;
  urgency: string | null;
  next_action: string | null;
  general_context: string | null;
  general_motivation: string | null;
  priority: string | null;
  leads: RawDetailLeadRel | RawDetailLeadRel[] | null;
  channels: RawDetailChannelRel | RawDetailChannelRel[] | null;
}

function pickFirst<T>(rel: T | T[] | null | undefined): T | null {
  if (rel == null) return null;
  if (Array.isArray(rel)) return rel[0] ?? null;
  return rel;
}

function mapDetail(raw: unknown): SelectedConversationDetail & { labels: never[] } {
  const r = raw as RawDetail;
  const lead = pickFirst(r.leads);
  const channel = pickFirst(r.channels);
  return {
    id: Number(r.id),
    tenantId: Number(r.tenant_id),
    leadId: Number(r.lead_id),
    channelId: Number(r.channel_id),
    phaseNumber: Number(r.phase_number),
    phaseMessageCount: Number(r.phase_message_count ?? 0),
    state: String(r.state),
    conversationSource: r.conversation_source ?? null,
    aiPausedUntil: r.ai_paused_until ?? null,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
    isQualified: r.is_qualified,
    isHandoffToHuman: Boolean(r.is_handoff_to_human),
    isUnread: Boolean(r.is_unread),
    isBlocked: Boolean(r.is_blocked),
    assignedUserId: r.assigned_user_id ?? null,
    handoffCause: r.handoff_cause ?? null,
    handoffReason: r.handoff_reason ?? null,
    handoffAt: r.handoff_at ?? null,
    currentContext: r.current_context ?? null,
    emotion: r.emotion ?? null,
    problem: r.problem ?? null,
    goal: r.goal ?? null,
    urgency: r.urgency ?? null,
    nextAction: r.next_action ?? null,
    generalContext: r.general_context ?? null,
    generalMotivation: r.general_motivation ?? null,
    priority: r.priority ?? null,
    lead: lead
      ? {
          first_name: lead.first_name,
          last_name: lead.last_name,
          username: lead.username,
          external_id: lead.external_id,
          phone: lead.phone,
          email: lead.email,
        }
      : {
          first_name: null,
          last_name: null,
          username: null,
          external_id: '',
          phone: null,
          email: null,
        },
    channel: channel
      ? { channel_type: channel.channel_type, via_provider: channel.via_provider }
      : { channel_type: 'unknown', via_provider: 'unknown' },
    labels: [],
  };
}
