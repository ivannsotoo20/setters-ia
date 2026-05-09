'use client';

import { useState, useTransition } from 'react';
import { Loader2, Pause, Play, User } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
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
  const [, setError] = useState<string | null>(null);

  const onTogglePause = () => {
    setError(null);
    startTransition(async () => {
      const result = await togglePauseConversation(conv.id, isPaused);
      if (!result.ok) {
        setError(result.error);
        toast.error(`Error: ${result.error}`);
      } else {
        toast.success(isPaused ? 'IA reactivada' : 'IA pausada');
      }
    });
  };

  return (
    <Card>
      <CardContent className="flex flex-col gap-5 pt-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-full bg-muted flex items-center justify-center">
              <User className="size-5 text-muted-foreground" />
            </div>
            <div>
              <h2 className="text-lg font-semibold leading-tight">{leadName}</h2>
              <p className="text-xs text-muted-foreground">
                {lead?.username ? `@${lead.username} · ` : ''}
                {channel ? formatChannel(channel) : '—'}
                {lead?.phone ? ` · ${lead.phone}` : ''}
                {lead?.email ? ` · ${lead.email}` : ''}
              </p>
            </div>
          </div>
          <Button
            variant={isPaused ? 'default' : 'outline'}
            size="sm"
            onClick={onTogglePause}
            disabled={pending}
          >
            {pending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : isPaused ? (
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
        </div>

        <Separator />

        <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-6 gap-y-3 text-sm">
          <MetaCell label="Fase">
            <Badge variant="secondary" className="font-mono">
              F{conv.phase_number}
            </Badge>
          </MetaCell>
          <MetaCell label="Origen">
            {conv.conversation_source ? (
              <SourceBadge source={conv.conversation_source} />
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </MetaCell>
          <MetaCell label="Estado">
            <StateBadge
              state={conv.state}
              qualified={conv.is_qualified}
              handoff={conv.is_handoff_to_human}
            />
          </MetaCell>
          <MetaCell label="IA">
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
          </MetaCell>
          <MetaCell label="Creada">
            <span className="text-muted-foreground tabular-nums">
              {new Date(conv.created_at).toLocaleString('es-ES', {
                day: '2-digit',
                month: '2-digit',
                year: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </MetaCell>
          <MetaCell label="Actualizada">
            <span className="text-muted-foreground tabular-nums">
              {new Date(conv.updated_at).toLocaleString('es-ES', {
                day: '2-digit',
                month: '2-digit',
                year: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </MetaCell>
        </dl>

        {conv.is_handoff_to_human ? (
          <div className="rounded-md bg-rose-500/5 border border-rose-500/20 p-3 text-sm">
            <p className="font-medium text-rose-400">
              Handoff: {conv.handoff_cause ?? '—'}
            </p>
            {conv.handoff_reason ? (
              <p className="text-muted-foreground mt-1">{conv.handoff_reason}</p>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function MetaCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
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
    <Badge variant="outline" className="capitalize">
      {state}
    </Badge>
  );
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
