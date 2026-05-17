'use client';

import { useState, useTransition } from 'react';
import { StickyNote, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { addConversationNote, deleteConversationNote } from '@/lib/actions/conversations';
import { formatRelative } from '../format-helpers';
import type { ConversationNote, ConversationViewer } from '../types';

interface Props {
  conversationId: number;
  notes: ConversationNote[];
  viewer: ConversationViewer;
}

export function NotesAction({ conversationId, notes: initialNotes, viewer }: Props) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState('');
  const [pendingAdd, startAdd] = useTransition();
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

  const onAdd = () => {
    const trimmed = content.trim();
    if (!trimmed) return;
    startAdd(async () => {
      const res = await addConversationNote(conversationId, trimmed);
      if (!res.ok) {
        toast.error(`Error: ${res.error}`);
      } else {
        toast.success('Nota añadida');
        setContent('');
      }
    });
  };

  const onDelete = (noteId: number) => {
    setPendingDeleteId(noteId);
    (async () => {
      const res = await deleteConversationNote(conversationId, noteId);
      if (!res.ok) {
        toast.error(`Error: ${res.error}`);
      } else {
        toast.success('Nota eliminada');
      }
      setPendingDeleteId(null);
    })();
  };

  const canDeleteNote = (note: ConversationNote): boolean => {
    if (viewer.isAgencyAdmin || viewer.role === 'owner') return true;
    return note.authorEmail !== null && note.authorEmail === viewer.email;
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <SheetTrigger asChild>
              <Button type="button" variant="ghost" size="icon" aria-label="Notas internas">
                <StickyNote className="size-4" />
                {initialNotes.length > 0 ? (
                  <Badge
                    variant="outline"
                    className="absolute -top-1 -right-1 size-4 p-0 text-[9px] tabular-nums border-warning/40 text-warning bg-warning/10 flex items-center justify-center"
                  >
                    {initialNotes.length}
                  </Badge>
                ) : null}
              </Button>
            </SheetTrigger>
          </TooltipTrigger>
          <TooltipContent>Notas internas</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col gap-4">
        <SheetHeader>
          <SheetTitle>Notas internas</SheetTitle>
          <SheetDescription>
            Visible solo para el equipo. El lead nunca las ve.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-3 px-4 overflow-y-auto flex-1">
          {initialNotes.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">Aún no hay notas.</p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {initialNotes.map((note) => (
                <li
                  key={note.id}
                  className="rounded-md border border-border bg-card/50 p-3 text-sm flex flex-col gap-1.5"
                >
                  <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                    <span className="truncate">{note.authorEmail ?? 'sistema'}</span>
                    <span className="tabular-nums shrink-0">{formatRelative(note.createdAt)}</span>
                  </div>
                  <p className="whitespace-pre-wrap break-words">{note.content}</p>
                  {canDeleteNote(note) ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="self-end h-7 px-2 text-destructive hover:text-destructive"
                      onClick={() => onDelete(note.id)}
                      disabled={pendingDeleteId === note.id}
                    >
                      {pendingDeleteId === note.id ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <Trash2 className="size-3" />
                      )}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-border p-4 flex flex-col gap-2">
          <label htmlFor="new-note" className="text-xs uppercase tracking-wider text-muted-foreground">
            Nueva nota
          </label>
          <textarea
            id="new-note"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Escribe aquí (max 4000 chars)…"
            maxLength={4000}
            rows={3}
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {content.length}/4000
            </span>
            <Button
              type="button"
              size="sm"
              onClick={onAdd}
              disabled={pendingAdd || content.trim().length === 0}
            >
              {pendingAdd ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Añadir nota
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
