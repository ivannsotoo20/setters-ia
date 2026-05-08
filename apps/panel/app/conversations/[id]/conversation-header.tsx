'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { togglePauseConversation } from '@/lib/actions/conversations';

interface LeadInfo {
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  external_id: string;
  phone: string | null;
  email: string | null;
}

interface ChannelInfo {
  channel_type: string;
  via_provider: string;
}

interface ConversationData {
  id: number;
  phase_number: number;
  state: string;
  conversation_source: string | null;
  ai_paused_until: string | null;
  is_qualified: boolean | null;
  is_handoff_to_human: boolean | null;
  handoff_cause: string | null;
  handoff_reason: string | null;
  handoff_at: string | null;
  created_at: string;
  updated_at: string;
  leads: LeadInfo | LeadInfo[] | null;
  channels: ChannelInfo | ChannelInfo[] | null;
}

interface Props {
  conv: ConversationData;
}

export function ConversationHeader({ conv }: Props) {
  const lead = pickFirst(conv.leads);
  const channel = pickFirst(conv.channels);
  const isPaused = isAiPaused(conv.ai_paused_until);
  const leadName = formatLeadName(lead);

  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onTogglePause = () => {
    setError(null);
    startTransition(async () => {
      const result = await togglePauseConversation(conv.id, isPaused);
      if (!result.ok) setError(result.error);
    });
  };

  return (
    <section className="conv-detail-header">
      <div className="conv-detail-titlerow">
        <Link href="/conversations" className="conv-back">
          ← Volver
        </Link>
        <div>
          <h2 className="conv-detail-title">{leadName}</h2>
          <p className="conv-detail-sub">
            {lead?.username ? `@${lead.username} · ` : ''}
            {lead?.external_id ? `ID ${truncate(lead.external_id, 14)} · ` : ''}
            {channel ? formatChannel(channel) : '—'}
          </p>
        </div>
        <div className="conv-detail-actions">
          <button
            type="button"
            className={isPaused ? 'conv-btn conv-btn-resume' : 'conv-btn conv-btn-pause'}
            onClick={onTogglePause}
            disabled={pending}
          >
            {pending ? '…' : isPaused ? 'Reactivar IA' : 'Pausar IA'}
          </button>
          {error ? <small className="conv-error">{error}</small> : null}
        </div>
      </div>

      <dl className="conv-detail-meta">
        <div>
          <dt>Fase</dt>
          <dd>
            <span className="conv-badge conv-badge-phase">F{conv.phase_number}</span>
          </dd>
        </div>
        <div>
          <dt>Origen</dt>
          <dd>
            {conv.conversation_source ? (
              <span className={`conv-badge conv-badge-source-${conv.conversation_source}`}>
                {conv.conversation_source}
              </span>
            ) : (
              <span className="conv-muted">—</span>
            )}
          </dd>
        </div>
        <div>
          <dt>Estado</dt>
          <dd>
            <StateBadge
              state={conv.state}
              qualified={conv.is_qualified}
              handoff={conv.is_handoff_to_human}
            />
          </dd>
        </div>
        <div>
          <dt>IA</dt>
          <dd>
            {isPaused ? (
              <span className="conv-badge conv-badge-paused">⏸ pausada</span>
            ) : (
              <span className="conv-badge conv-badge-active">▶ activa</span>
            )}
          </dd>
        </div>
        {conv.is_handoff_to_human ? (
          <div>
            <dt>Handoff</dt>
            <dd className="conv-detail-handoff">
              <span>{conv.handoff_cause ?? '—'}</span>
              {conv.handoff_reason ? <small>{conv.handoff_reason}</small> : null}
            </dd>
          </div>
        ) : null}
        <div>
          <dt>Creada</dt>
          <dd className="conv-time">{new Date(conv.created_at).toLocaleString('es-ES')}</dd>
        </div>
        <div>
          <dt>Actualizada</dt>
          <dd className="conv-time">{new Date(conv.updated_at).toLocaleString('es-ES')}</dd>
        </div>
      </dl>
    </section>
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
  if (handoff) return <span className="conv-badge conv-badge-handoff">handoff</span>;
  if (qualified) return <span className="conv-badge conv-badge-qualified">cualificado</span>;
  return <span className={`conv-badge conv-badge-state-${state}`}>{state}</span>;
}

function pickFirst<T>(rel: T | T[] | null | undefined): T | null {
  if (rel == null) return null;
  if (Array.isArray(rel)) return rel[0] ?? null;
  return rel;
}

function isAiPaused(rawUntil: string | null): boolean {
  if (!rawUntil) return false;
  if (rawUntil === 'infinity') return true;
  const ts = Date.parse(rawUntil);
  if (!Number.isFinite(ts)) return true;
  return ts > Date.now();
}

function formatLeadName(lead: LeadInfo | null): string {
  if (!lead) return '—';
  const fullName = [lead.first_name, lead.last_name].filter(Boolean).join(' ').trim();
  if (fullName.length > 0) return fullName;
  if (lead.username) return `@${lead.username}`;
  return lead.external_id;
}

function formatChannel(channel: ChannelInfo): string {
  const ch =
    channel.channel_type === 'instagram_dm'
      ? 'Instagram DM'
      : channel.channel_type === 'facebook_messenger'
        ? 'Facebook Messenger'
        : channel.channel_type === 'whatsapp'
          ? 'WhatsApp'
          : channel.channel_type;
  return `${ch} · ${channel.via_provider}`;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}
