import type { ConversationListLead, ConversationListChannel } from '@/lib/conversation-list-query';

export function formatLeadName(lead: ConversationListLead | null | undefined): string {
  if (!lead) return '—';
  const fullName = [lead.first_name, lead.last_name].filter(Boolean).join(' ').trim();
  if (fullName.length > 0) return fullName;
  if (lead.username) return `@${lead.username}`;
  return lead.external_id;
}

export function leadInitials(lead: ConversationListLead | null | undefined): string {
  if (!lead) return '?';
  const fn = (lead.first_name ?? '').trim();
  const ln = (lead.last_name ?? '').trim();
  if (fn || ln) {
    return `${(fn[0] ?? '').toUpperCase()}${(ln[0] ?? '').toUpperCase()}` || '?';
  }
  if (lead.username) return lead.username.slice(0, 2).toUpperCase();
  const ext = lead.external_id ?? '';
  if (ext.length === 0) return '?';
  return ext.slice(0, 2).toUpperCase();
}

export function formatChannelLong(channel: ConversationListChannel | null | undefined): string {
  if (!channel) return '—';
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

export function formatChannelShort(channel: ConversationListChannel | null | undefined): string {
  if (!channel) return '—';
  if (channel.channel_type === 'whatsapp') return 'WA';
  if (channel.channel_type === 'instagram_dm') return 'IG';
  if (channel.channel_type === 'facebook_messenger') return 'FB';
  return channel.channel_type;
}

/**
 * Sprint A (2026-05-12) — Devuelve etiqueta corta del direction de la
 * conversación:
 *   - `'inbound'` → `'IN'` (lead escribió primero a la página).
 *   - `'outbound'` → `'OT'` (trainer/IA inició la conv: bienvenida, lm, etc.).
 *   - `'untagged'` o null/undefined → `'—'`.
 */
export function formatDirection(
  direction: 'inbound' | 'outbound' | 'untagged' | string | null | undefined,
): string {
  if (direction === 'inbound') return 'IN';
  if (direction === 'outbound') return 'OT';
  return '—';
}

/**
 * Sprint A (2026-05-12) — Combina channel + direction para el badge compacto:
 *   - `IG-IN`, `IG-OT`, `WA-IN`, `WA-OT`, `FB-IN`, `FB-OT`.
 *   - Si direction no clasificada, devuelve solo el canal corto (sin sufijo).
 */
export function formatChannelDirectionShort(
  channel: ConversationListChannel | null | undefined,
  direction: 'inbound' | 'outbound' | 'untagged' | string | null | undefined,
): string {
  const ch = formatChannelShort(channel);
  if (ch === '—') return '—';
  const dir = formatDirection(direction);
  if (dir === '—') return ch;
  return `${ch}-${dir}`;
}

export function isAiPaused(rawUntil: string | null | undefined): boolean {
  if (!rawUntil) return false;
  if (rawUntil === 'infinity') return true;
  const ts = Date.parse(rawUntil);
  if (!Number.isFinite(ts)) return true;
  return ts > Date.now();
}

export function formatRelative(iso: string | null | undefined): string {
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

export function formatAbsoluteShort(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
