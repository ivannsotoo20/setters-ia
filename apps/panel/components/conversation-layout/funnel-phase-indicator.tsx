'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { SelectedConversationDetail } from './types';

interface Props {
  detail: SelectedConversationDetail;
}

const PHASE_LABELS: Record<number, string> = {
  1: 'Apertura',
  2: 'Contexto',
  3: 'Diagnóstico',
  4: 'Cualificación',
  5: 'Cierre',
  6: 'Cita / Cierre final',
};

export function FunnelPhaseIndicator({ detail }: Props) {
  const [expanded, setExpanded] = useState(true);

  const phaseLabel = PHASE_LABELS[detail.phaseNumber] ?? '—';

  const insights: Array<{ label: string; value: string | null }> = [
    { label: 'Contexto actual', value: detail.currentContext },
    { label: 'Emoción', value: detail.emotion },
    { label: 'Problema', value: detail.problem },
    { label: 'Objetivo', value: detail.goal },
    { label: 'Urgencia', value: detail.urgency },
    { label: 'Próximo paso', value: detail.nextAction },
  ];

  const generalInsights: Array<{ label: string; value: string | null }> = [
    { label: 'Contexto general', value: detail.generalContext },
    { label: 'Motivación general', value: detail.generalMotivation },
  ];

  return (
    <Card>
      <CardHeader className="space-y-0 pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-sm">Fase del funnel</CardTitle>
          <Badge variant="secondary" className="font-mono">
            F{detail.phaseNumber}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          {phaseLabel} · {detail.phaseMessageCount} mensajes en esta fase
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          aria-expanded={expanded}
        >
          {expanded ? (
            <ChevronDown className="size-3.5" />
          ) : (
            <ChevronRight className="size-3.5" />
          )}
          Razonamiento del Generator
        </button>
        {expanded ? (
          <dl className="flex flex-col gap-2.5 text-sm">
            {insights.map((it) => (
              <InsightRow key={it.label} label={it.label} value={it.value} />
            ))}
            <div className="border-t border-border/60 pt-2.5 mt-1 flex flex-col gap-2.5">
              {generalInsights.map((it) => (
                <InsightRow key={it.label} label={it.label} value={it.value} muted />
              ))}
            </div>
          </dl>
        ) : null}
      </CardContent>
    </Card>
  );
}

function InsightRow({
  label,
  value,
  muted,
}: {
  label: string;
  value: string | null;
  muted?: boolean;
}) {
  const display = value && value.trim().length > 0 ? value : '—';
  return (
    <div className="flex flex-col gap-0.5">
      <dt
        className={cn(
          'text-[10px] uppercase tracking-wider',
          muted ? 'text-muted-foreground/60' : 'text-muted-foreground',
        )}
      >
        {label}
      </dt>
      <dd
        className={cn(
          'text-sm whitespace-pre-wrap break-words',
          display === '—' ? 'text-muted-foreground italic' : '',
        )}
      >
        {display}
      </dd>
    </div>
  );
}
