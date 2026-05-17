import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getEffectiveTenant } from '@/lib/effective-tenant';
import { listMembers } from '@/lib/actions/members';
import { listLabels, type LabelRow } from '@/lib/actions/labels';
import { PipelineLayout } from '@/components/pipeline/pipeline-layout';
import {
  parsePipelineKey,
  pipelineKeyToFilter,
  COLUMN_ORDER,
  type ColumnKey,
} from '@/lib/pipeline-constants';
import {
  applyPipelineFilters,
  groupCardsByColumn,
  type PipelineCard,
} from '@/lib/pipeline-query';
import { parseWindowKey, resolveWindowRange } from '@/lib/pipeline-window';

export const dynamic = 'force-dynamic';

const FETCH_HARDCAP = 800;

interface PageProps {
  searchParams: Promise<{
    p?: string;
    q?: string;
    assignee?: string;
    labels?: string;
    w?: string;
    from?: string;
    to?: string;
  }>;
}

export default async function PipelinePage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const pipelineKey = parsePipelineKey(sp.p);
  const dbFilter = pipelineKeyToFilter(pipelineKey);
  const windowKey = parseWindowKey(sp.w);
  const { from, to } = resolveWindowRange(windowKey, sp.from ?? null, sp.to ?? null);

  const supabase = await createSupabaseServerClient();
  const effective = await getEffectiveTenant();
  if (!effective) notFound();

  const labelIds = parseLabelIds(sp.labels);
  const assigneeRaw = sp.assignee ?? 'all';
  const q = (sp.q ?? '').trim();

  // Fetch conversations + labels + events + members + custom labels en paralelo
  const convsPromise = supabase
    .from('conversations')
    .select(
      `id, tenant_id, lead_id, channel_id, phase_number, state,
       is_qualified, is_handoff_to_human, ai_paused_until, assigned_user_id,
       direction, conversation_source, last_message_at, created_at,
       leads!inner(first_name, last_name, username, external_id),
       channels!inner(channel_type, via_provider)`,
    )
    .eq('tenant_id', effective.tenantId)
    .eq('channels.channel_type', dbFilter.channelType)
    .gte('created_at', from)
    .lte('created_at', to)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(FETCH_HARDCAP);

  // Métricas (pipeline_events) movidas al futuro /dashboard. La tabla y los
  // triggers se mantienen activos para no perder histórico, pero esta vista
  // no los consulta.
  const membersPromise = listMembers({ tenantId: effective.tenantId });
  const labelsPromise = listLabels();

  const [convsRes, membersRes, labelsRes] = await Promise.all([
    convsPromise,
    membersPromise,
    labelsPromise,
  ]);

  if (convsRes.error) {
    return (
      <div className="p-8 text-sm text-destructive">
        Error cargando pipeline: {convsRes.error.message}
      </div>
    );
  }

  const rawConvs = (convsRes.data ?? []) as Array<Record<string, unknown>>;
  const convIds = rawConvs.map((r) => Number(r.id));

  // Dispara conversation_labels INMEDIATAMENTE — se ejecuta en paralelo con el
  // mapping sync que viene abajo, evitando el waterfall del await secuencial.
  const convLabelsPromise =
    convIds.length > 0
      ? supabase
          .from('conversation_labels')
          .select(
            'conversation_id, tenant_labels(id, name, color, destination_bucket, is_system)',
          )
          .in('conversation_id', convIds)
          .eq('tenant_id', effective.tenantId)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>>, error: null });

  // Mientras la query vuela, await el resultado solo cuando lo necesitemos para
  // inyectar labels al map de cards. El round-trip ya está consumido en paralelo.
  const { data: convLabelRows } = await convLabelsPromise;
  const labelsByConvId = new Map<number, PipelineCard['labels']>();
  for (const r of (convLabelRows ?? []) as Array<Record<string, unknown>>) {
    const cid = Number(r.conversation_id);
    const labelRel = r.tenant_labels as
      | {
          id: number;
          name: string;
          color: string;
          destination_bucket: string | null;
          is_system: boolean;
        }
      | {
          id: number;
          name: string;
          color: string;
          destination_bucket: string | null;
          is_system: boolean;
        }[]
      | null;
    const labelObj = Array.isArray(labelRel) ? labelRel[0] ?? null : labelRel;
    if (!labelObj) continue;
    const arr = labelsByConvId.get(cid) ?? [];
    arr.push({
      id: Number(labelObj.id),
      name: String(labelObj.name),
      color: String(labelObj.color),
      destinationBucket: (labelObj.destination_bucket ?? null) as string | null,
      isSystem: Boolean(labelObj.is_system),
    });
    labelsByConvId.set(cid, arr);
  }

  // Map raw → PipelineCard[]
  let cards: PipelineCard[] = rawConvs.map((r) => {
    const lead = pickFirst(r.leads as unknown);
    const channel = pickFirst(r.channels as unknown);
    return {
      id: Number(r.id),
      tenantId: Number(r.tenant_id),
      phaseNumber: Number(r.phase_number ?? 0),
      state: String(r.state ?? 'active'),
      isQualified: r.is_qualified as boolean | null,
      isHandoffToHuman: r.is_handoff_to_human as boolean | null,
      aiPausedUntil: (r.ai_paused_until as string | null) ?? null,
      assignedUserId: (r.assigned_user_id as string | null) ?? null,
      direction: String(r.direction ?? 'untagged'),
      conversationSource: (r.conversation_source as string | null) ?? null,
      lastMessageAt: (r.last_message_at as string | null) ?? null,
      createdAt: String(r.created_at ?? ''),
      lead: lead
        ? {
            first_name: (lead as { first_name: string | null }).first_name,
            last_name: (lead as { last_name: string | null }).last_name,
            username: (lead as { username: string | null }).username,
            external_id: String((lead as { external_id: string }).external_id),
          }
        : null,
      channel: channel
        ? {
            channel_type: String((channel as { channel_type: string }).channel_type),
            via_provider: String((channel as { via_provider: string }).via_provider),
          }
        : null,
      labels: labelsByConvId.get(Number(r.id)) ?? [],
    };
  });

  // Filtrar IG por direction (los otros pipelines no distinguen)
  if (dbFilter.direction) {
    cards = cards.filter((c) => c.direction === dbFilter.direction);
  }

  // Aplicar filtros UI
  cards = applyPipelineFilters(cards, {
    q,
    assignee: assigneeRaw,
    viewerId: effective.userId,
    labelIds,
  });

  const columns = groupCardsByColumn(cards);
  // Garantizar que todas las columnas existan (con array vacío si no)
  const fullColumns: Record<ColumnKey, PipelineCard[]> = COLUMN_ORDER.reduce(
    (acc, k) => {
      acc[k] = columns[k] ?? [];
      return acc;
    },
    {} as Record<ColumnKey, PipelineCard[]>,
  );

  const members = membersRes.ok
    ? (membersRes.data ?? []).map((m) => ({
        userId: m.userId,
        email: m.email,
        fullName: m.fullName,
      }))
    : [];

  const assigneeMap: Record<string, string> = {};
  for (const m of members) {
    assigneeMap[m.userId] = m.fullName ?? m.email;
  }

  const allLabels: LabelRow[] = labelsRes.ok ? labelsRes.data ?? [] : [];
  const customLabels = allLabels.filter((l) => !l.isSystem);

  return (
    <PipelineLayout
      pipelineKey={pipelineKey}
      columns={fullColumns}
      totalCards={cards.length}
      viewer={{
        userId: effective.userId,
        role: effective.role,
        isAgencyAdmin: effective.isAgencyAdmin,
      }}
      members={members}
      customLabels={customLabels}
      filters={{
        q,
        assignee: assigneeRaw,
        labelIds,
        windowKey,
        fromIso: from,
        toIso: to,
      }}
      assigneeMap={assigneeMap}
    />
  );
}

function pickFirst<T>(rel: T | T[] | null | undefined): T | null {
  if (rel == null) return null;
  if (Array.isArray(rel)) return (rel[0] as T) ?? null;
  return rel;
}

function parseLabelIds(value: string | null | undefined): number[] {
  if (!value) return [];
  return value
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
}
