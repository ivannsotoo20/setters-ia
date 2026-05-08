'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { togglePauseConversation } from '@/lib/actions/conversations';

interface LeadInfo {
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  external_id: string;
}

interface ChannelInfo {
  channel_type: string;
  via_provider: string;
}

interface ConversationRow {
  id: number;
  lead_id: number;
  phase_number: number;
  state: string;
  conversation_source: string | null;
  ai_paused_until: string | null;
  last_message_at: string | null;
  is_qualified: boolean | null;
  is_handoff_to_human: boolean | null;
  leads: LeadInfo | LeadInfo[] | null;
  channels: ChannelInfo | ChannelInfo[] | null;
}

interface Props {
  rows: ConversationRow[];
}

export function ConversationsTable({ rows }: Props) {
  return (
    <div className="conversations-table-wrap">
      <table className="conversations-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Lead</th>
            <th>Canal</th>
            <th>Fase</th>
            <th>Origen</th>
            <th>Estado</th>
            <th>IA</th>
            <th>Último mensaje</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <ConversationRowItem key={r.id} row={r} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ConversationRowItem({ row }: { row: ConversationRow }) {
  const lead = pickFirst(row.leads);
  const channel = pickFirst(row.channels);
  const isPaused = isAiPaused(row.ai_paused_until);
  const leadName = formatLeadName(lead);

  return (
    <tr>
      <td>
        <Link href={`/conversations/${row.id}`} className="conv-id-link">
          <span className="conv-id">#{row.id}</span>
        </Link>
      </td>
      <td>
        <Link href={`/conversations/${row.id}`} className="conv-lead-link">
          <div className="conv-lead">
            <strong>{leadName}</strong>
            {lead?.username ? <small>@{lead.username}</small> : null}
          </div>
        </Link>
      </td>
      <td>
        <span className="conv-badge conv-badge-channel">
          {formatChannel(channel)}
        </span>
      </td>
      <td>
        <span className="conv-badge conv-badge-phase">F{row.phase_number}</span>
      </td>
      <td>
        {row.conversation_source ? (
          <span className={`conv-badge conv-badge-source-${row.conversation_source}`}>
            {row.conversation_source}
          </span>
        ) : (
          <span className="conv-muted">—</span>
        )}
      </td>
      <td>
        <StateBadge state={row.state} qualified={row.is_qualified} handoff={row.is_handoff_to_human} />
      </td>
      <td>
        {isPaused ? (
          <span className="conv-badge conv-badge-paused" title={row.ai_paused_until ?? undefined}>
            ⏸ pausada
          </span>
        ) : (
          <span className="conv-badge conv-badge-active">▶ activa</span>
        )}
      </td>
      <td>
        <span className="conv-time" title={row.last_message_at ?? undefined}>
          {formatRelative(row.last_message_at)}
        </span>
      </td>
      <td>
        <PauseToggleButton conversationId={row.id} currentlyPaused={isPaused} />
      </td>
    </tr>
  );
}

function StateBadge({
  state,
  qualified,
  handoff,
}: {
  state: string;
  qualified: boolean | null;
  handoff: boolean | null;
}) {
  if (handoff) {
    return <span className="conv-badge conv-badge-handoff">handoff</span>;
  }
  if (qualified) {
    return <span className="conv-badge conv-badge-qualified">cualificado</span>;
  }
  return <span className={`conv-badge conv-badge-state-${state}`}>{state}</span>;
}

function PauseToggleButton({
  conversationId,
  currentlyPaused,
}: {
  conversationId: number;
  currentlyPaused: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onClick = () => {
    setError(null);
    startTransition(async () => {
      const result = await togglePauseConversation(conversationId, currentlyPaused);
      if (!result.ok) {
        setError(result.error);
      }
    });
  };

  return (
    <div className="conv-action">
      <button
        type="button"
        className={
          currentlyPaused ? 'conv-btn conv-btn-resume' : 'conv-btn conv-btn-pause'
        }
        onClick={onClick}
        disabled={pending}
      >
        {pending ? '…' : currentlyPaused ? 'Reactivar IA' : 'Pausar IA'}
      </button>
      {error ? <small className="conv-error">{error}</small> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pickFirst<T>(rel: T | T[] | null | undefined): T | null {
  if (rel == null) return null;
  if (Array.isArray(rel)) return rel[0] ?? null;
  return rel;
}

function isAiPaused(rawUntil: string | null): boolean {
  if (!rawUntil) return false;
  // Postgres infinity llega como string "infinity" en algunas versiones.
  if (rawUntil === 'infinity') return true;
  const ts = Date.parse(rawUntil);
  if (!Number.isFinite(ts)) {
    // No se pudo parsear (ej: "infinity"); tratamos como pausada por seguridad.
    return true;
  }
  return ts > Date.now();
}

function formatLeadName(lead: LeadInfo | null): string {
  if (!lead) return '—';
  const fullName = [lead.first_name, lead.last_name].filter(Boolean).join(' ').trim();
  if (fullName.length > 0) return fullName;
  if (lead.username) return `@${lead.username}`;
  return lead.external_id;
}

function formatChannel(channel: ChannelInfo | null): string {
  if (!channel) return '—';
  const ch = channel.channel_type === 'instagram_dm'
    ? 'IG'
    : channel.channel_type === 'facebook_messenger'
      ? 'FB'
      : channel.channel_type === 'whatsapp'
        ? 'WA'
        : channel.channel_type;
  return `${ch} · ${channel.via_provider}`;
}

function formatRelative(iso: string | null): string {
  if (!iso) return '—';
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return iso;
  const diffMs = Date.now() - ts;
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return `hace ${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `hace ${min}m`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `hace ${hour}h`;
  const day = Math.floor(hour / 24);
  if (day < 30) return `hace ${day}d`;
  return new Date(ts).toLocaleDateString('es-ES');
}
