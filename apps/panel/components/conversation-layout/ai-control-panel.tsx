'use client';

import { useTransition } from 'react';
import { Bot, Pause, Play, Zap, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { togglePauseConversation } from '@/lib/actions/conversations';
import { isAiPaused } from './format-helpers';
import { ScheduleFollowupDialog } from './actions/schedule-followup-dialog';
import { ScheduledFollowupsList } from './scheduled-followups-list';
import type { SelectedConversationDetail } from './types';
import type {
  ChannelKind,
  FollowupTemplateRow,
  ScheduledFollowupRow,
} from '@/lib/actions/followups';

interface Props {
  detail: SelectedConversationDetail;
  followups: ScheduledFollowupRow[];
  templates: FollowupTemplateRow[];
  canScheduleFollowups: boolean;
  lastLeadMessageAt: string | null;
}

export function AIControlPanel({
  detail,
  followups,
  templates,
  canScheduleFollowups,
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
      <CardHeader className="space-y-0 pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm flex items-center gap-1.5">
            <Bot className="size-4 text-emerald-400" />
            Control IA
          </CardTitle>
          {paused ? (
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
        </div>
      </CardHeader>
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

        <div className="border-t border-border/60 pt-3 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">
              Seguimientos
            </span>
            {canScheduleFollowups ? (
              <ScheduleFollowupDialog
                conversationId={detail.id}
                channelKind={detail.channel.channel_type as ChannelKind}
                lastLeadMessageAt={lastLeadMessageAt}
                templates={templates}
              />
            ) : null}
          </div>
          <ScheduledFollowupsList followups={followups} canCancel={canScheduleFollowups} />
        </div>
      </CardContent>
    </Card>
  );
}
