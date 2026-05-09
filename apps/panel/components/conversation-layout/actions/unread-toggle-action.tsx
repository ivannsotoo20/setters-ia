'use client';

import { useTransition } from 'react';
import { Mail, MailOpen, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { setConversationUnread } from '@/lib/actions/conversations';

interface Props {
  conversationId: number;
  currentlyUnread: boolean;
}

export function UnreadToggleAction({ conversationId, currentlyUnread }: Props) {
  const [pending, startTransition] = useTransition();

  const onClick = () => {
    startTransition(async () => {
      const next = !currentlyUnread;
      const res = await setConversationUnread(conversationId, next);
      if (!res.ok) {
        toast.error(`Error: ${res.error}`);
      } else {
        toast.success(next ? 'Marcado como no leído' : 'Marcado como leído');
      }
    });
  };

  const label = currentlyUnread ? 'Marcar leído' : 'Marcar no leído';
  const Icon = currentlyUnread ? MailOpen : Mail;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClick}
            disabled={pending}
            aria-label={label}
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Icon className="size-4" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
