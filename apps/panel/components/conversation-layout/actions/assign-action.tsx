'use client';

import { useTransition } from 'react';
import { UserPlus, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { assignConversation } from '@/lib/actions/conversations';
import type { TenantMember } from '../types';

interface Props {
  conversationId: number;
  currentAssigneeUserId: string | null;
  viewerUserId: string;
  members: TenantMember[];
}

export function AssignAction({
  conversationId,
  currentAssigneeUserId,
  viewerUserId,
  members,
}: Props) {
  const [pending, startTransition] = useTransition();

  const currentAssignee = members.find((m) => m.userId === currentAssigneeUserId) ?? null;
  const triggerLabel = currentAssignee
    ? currentAssignee.fullName ?? currentAssignee.email.split('@')[0]
    : 'Sin asignar';

  const onAssign = (newAssigneeUserId: string | null) => {
    startTransition(async () => {
      const res = await assignConversation(conversationId, newAssigneeUserId);
      if (!res.ok) {
        toast.error(`Error: ${res.error}`);
      } else {
        toast.success(newAssigneeUserId ? 'Conversación asignada' : 'Asignación retirada');
      }
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={pending} className="gap-2 max-w-[180px]">
          {pending ? <Loader2 className="size-3.5 animate-spin shrink-0" /> : <UserPlus className="size-3.5 shrink-0" />}
          <span className="truncate">{triggerLabel}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>Asignar conversación</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onAssign(viewerUserId)} className="gap-2">
          <UserPlus className="size-3.5" />
          Asignar a mí
          {currentAssigneeUserId === viewerUserId ? (
            <Check className="size-3.5 ml-auto text-emerald-400" />
          ) : null}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAssign(null)} className="gap-2">
          <span className="size-3.5" />
          Sin asignar
          {currentAssigneeUserId == null ? (
            <Check className="size-3.5 ml-auto text-emerald-400" />
          ) : null}
        </DropdownMenuItem>
        {members.length > 0 ? <DropdownMenuSeparator /> : null}
        {members.map((m) => (
          <DropdownMenuItem
            key={m.userId}
            onClick={() => onAssign(m.userId)}
            disabled={!m.isActive}
            className="gap-2"
          >
            <span className="size-3.5" />
            <div className="flex flex-col leading-tight min-w-0">
              <span className="truncate text-sm">{m.fullName ?? m.email}</span>
              {m.fullName ? (
                <span className="truncate text-[10px] text-muted-foreground">{m.email}</span>
              ) : null}
            </div>
            {currentAssigneeUserId === m.userId ? (
              <Check className="size-3.5 ml-auto text-emerald-400" />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
