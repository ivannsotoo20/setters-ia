'use client';

import { useTransition } from 'react';
import { Bot, Pause, Play, Zap, Loader2, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { togglePauseConversation } from '@/lib/actions/conversations';
import { isAiPaused } from './format-helpers';
import { AutomatedFollowupsPanel } from './automated-followups-panel';
import type { SelectedConversationDetail } from './types';
import type { ChannelKind, ScheduledFollowupRow } from '@/lib/actions/followups';
import type { TenantFollowupConfigRow } from '@/lib/actions/followup-config';

interface Props {
  detail: SelectedConversationDetail;
  followups: ScheduledFollowupRow[];
  followupConfig: TenantFollowupConfigRow;
  canManageFollowups: boolean;
  lastLeadMessageAt: string | null;
}

export function AIControlPanel({
  detail,
  followups,
  followupConfig,
  canManageFollowups,
  lastLeadMessageAt,
}: Props) {
  const [pending, startTransition] = useTransition();
  const paused = isAiPaused(detail.aiPausedUntil);

  const onTogglePause = () => {
    startTransition(async () => {
      const res = await togglePauseConversation(detail.id, paused);
      if (!res.ok) {
        toast.error(`Error: ${res.error}`);
      } else {
        toast.success(paused ? 'IA reactivada' : 'IA pausada');
      }
    });
  };

  return (
    <Card>
      <Collapsible defaultOpen>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="group/coll-trig w-full text-left rounded-t-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            aria-label="Control de la IA"
          >
            <CardHeader className="space-y-0 pb-3 cursor-pointer select-none hover:bg-muted/30 transition-colors rounded-t-xl">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm flex items-center gap-1.5">
                  <Bot className="size-4 text-success" />
                  Control IA
                </CardTitle>
                <div className="flex items-center gap-2 shrink-0">
                  {paused ? (
                    <Badge variant="outline" className="border-warning/40 text-warning bg-warning/5">
                      <Pause className="size-3 mr-1" />
                      pausada
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-success/40 text-success bg-success/5">
                      <Play className="size-3 mr-1" />
                      activa
                    </Badge>
                  )}
                  <ChevronDown className="size-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]/coll-trig:rotate-180" />
                </div>
              </div>
            </CardHeader>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="overflow-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0">
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <Button
                type="button"
                variant={paused ? 'default' : 'outline'}
                size="sm"
                onClick={onTogglePause}
                disabled={pending}
                className="w-full justify-start"
              >
                {pending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : paused ? (
                  <Play className="size-3.5" />
                ) : (
                  <Pause className="size-3.5" />
                )}
                {paused ? 'Reactivar IA' : 'Pausar IA'}
              </Button>
              <TooltipProvider delayDuration={150}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled
                        aria-disabled
                        className="w-full justify-start opacity-60 cursor-not-allowed"
                      >
                        <Zap className="size-3.5" />
                        Forzar respuesta IA
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Próximamente — disparo manual del pipeline</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            <AutomatedFollowupsPanel
              followups={followups}
              config={followupConfig}
              channelKind={detail.channel.channel_type as ChannelKind}
              lastLeadMessageAt={lastLeadMessageAt}
              canManage={canManageFollowups}
            />
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
