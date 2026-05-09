'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { Loader2, Pause, Play } from 'lucide-react';
import { toast } from 'sonner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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

export interface ConversationRow {
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
    <div className="overflow-x-auto -mx-6">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[60px]">ID</TableHead>
            <TableHead>Lead</TableHead>
            <TableHead>Canal</TableHead>
            <TableHead>Fase</TableHead>
            <TableHead>Origen</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>IA</TableHead>
            <TableHead>Último</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <ConversationRowItem key={r.id} row={r} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ConversationRowItem({ row }: { row: ConversationRow }) {
  const lead = pickFirst(row.leads);
  const channel = pickFirst(row.channels);
  const isPaused = isAiPaused(row.ai_paused_until);
  const leadName = formatLeadName(lead);
  const detailHref = `/conversations/${row.id}`;

  return (
    <TableRow className="group">
      <TableCell>
        <Link
          href={detailHref}
          className="font-mono text-xs text-muted-foreground hover:text-primary"
        >
          #{row.id}
        </Link>
      </TableCell>
      <TableCell>
        <Link href={detailHref} className="block hover:text-primary">
          <div className="flex flex-col gap-0.5">
            <span className="font-medium">{leadName}</span>
            {lead?.username ? (
              <span className="text-xs text-muted-foreground">@{lead.username}</span>
            ) : null}
          </div>
        </Link>
      </TableCell>
      <TableCell>
        <Badge variant="outline" className="font-normal">
          {formatChannel(channel)}
        </Badge>
      </TableCell>
      <TableCell>
        <Badge variant="secondary" className="font-mono">
          F{row.phase_number}
        </Badge>
      </TableCell>
      <TableCell>
        {row.conversation_source ? (
          <SourceBadge source={row.conversation_source} />
        ) : (
          <span className="text-muted-foreground text-sm">—</span>
        )}
      </TableCell>
      <TableCell>
        <StateBadge
          state={row.state}
          qualified={row.is_qualified}
          handoff={row.is_handoff_to_human}
        />
      </TableCell>
      <TableCell>
        {isPaused ? (
          <Badge variant="outline" className="border-amber-500/40 text-amber-400 bg-amber-500/5">
            <Pause className="size-3 mr-1" />
            pausada
          </Badge>
        ) : (
          <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 bg-emerald-500/5">
            <Play className="size-3 mr-1" />
            activa
          </Badge>
        )}
      </TableCell>
      <TableCell>
        <span className="text-sm text-muted-foreground tabular-nums" title={row.last_message_at ?? undefined}>
          {formatRelative(row.last_message_at)}
        </span>
      </TableCell>
      <TableCell className="text-right">
        <PauseToggleButton conversationId={row.id} currentlyPaused={isPaused} />
      </TableCell>
    </TableRow>
  );
}

function SourceBadge({ source }: { source: string }) {
  const styles: Record<string, string> = {
    bienvenida: 'border-emerald-500/40 text-emerald-400 bg-emerald-500/5',
    lm: 'border-violet-500/40 text-violet-400 bg-violet-500/5',
    inbound: 'border-sky-500/40 text-sky-400 bg-sky-500/5',
    manual: 'border-rose-500/40 text-rose-400 bg-rose-500/5',
  };
  return (
    <Badge variant="outline" className={`font-normal ${styles[source] ?? ''}`}>
      {source}
    </Badge>
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
  if (handoff)
    return (
      <Badge variant="outline" className="border-rose-500/40 text-rose-400 bg-rose-500/5">
        handoff
      </Badge>
    );
  if (qualified)
    return (
      <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 bg-emerald-500/5">
        cualificado
      </Badge>
    );
  return (
    <Badge variant="outline" className="font-normal capitalize">
      {state}
    </Badge>
  );
}

function PauseToggleButton({
  conversationId,
  currentlyPaused,
}: {
  conversationId: number;
  currentlyPaused: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [, setError] = useState<string | null>(null);

  const onClick = () => {
    setError(null);
    startTransition(async () => {
      const result = await togglePauseConversation(conversationId, currentlyPaused);
      if (!result.ok) {
        setError(result.error);
        toast.error(`Error: ${result.error}`);
      } else {
        toast.success(currentlyPaused ? 'IA reactivada' : 'IA pausada');
      }
    });
  };

  return (
    <Button
      variant={currentlyPaused ? 'default' : 'outline'}
      size="sm"
      onClick={onClick}
      disabled={pending}
    >
      {pending ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : currentlyPaused ? (
        <>
          <Play className="size-3.5" />
          Reactivar IA
        </>
      ) : (
        <>
          <Pause className="size-3.5" />
          Pausar IA
        </>
      )}
    </Button>
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

function formatChannel(channel: ChannelInfo | null): string {
  if (!channel) return '—';
  const ch =
    channel.channel_type === 'instagram_dm'
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
