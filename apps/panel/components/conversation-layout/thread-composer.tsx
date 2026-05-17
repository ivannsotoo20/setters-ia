'use client';

import { useState, useTransition, useRef, useEffect } from 'react';
import { Send, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { sendManualMessage } from '@/lib/actions/conversations';
import type { ConversationViewer } from './types';

interface Props {
  conversationId: number;
  viewer: ConversationViewer;
  isBlocked: boolean;
  isHandoffToHuman: boolean;
}

const MAX_LENGTH = 4000;
const MAX_AUTO_HEIGHT_PX = 200;

/**
 * Composer manual del thread. Al enviar:
 *   - El mensaje sale al lead vía adapter del provider (ManyChat / YCloud / GHL).
 *   - Se inserta en `conversation_messages` con `source='human'` (visible en
 *     timeline al instante).
 *   - La IA queda **pausada automáticamente** (`ai_paused_until=infinity`) —
 *     el humano toma el control sin tener que tocar el botón "Pausar IA".
 *
 * Disabled cuando:
 *   - viewer.role === 'viewer' (no permitido enviar).
 *   - conversation está bloqueada.
 */
export function ThreadComposer({
  conversationId,
  viewer,
  isBlocked,
  isHandoffToHuman,
}: Props) {
  const [content, setContent] = useState('');
  const [pending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const canSend = viewer.isAgencyAdmin || viewer.role !== 'viewer';
  const disabledReason = !canSend
    ? 'Tu rol no permite enviar mensajes.'
    : isBlocked
      ? 'La conversación está bloqueada. Desbloquéala para escribir.'
      : null;
  const disabled = disabledReason !== null || pending;

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, MAX_AUTO_HEIGHT_PX)}px`;
  }, [content]);

  const onSend = () => {
    const trimmed = content.trim();
    if (!trimmed || disabled) return;
    startTransition(async () => {
      const res = await sendManualMessage(conversationId, trimmed);
      if (!res.ok) {
        toast.error(`Error: ${res.error}`);
      } else {
        toast.success('Mensaje enviado · IA pausada');
        setContent('');
      }
    });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter envía, Shift+Enter nueva línea (patrón estándar chat).
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className="border-t border-border bg-background/95 backdrop-blur p-3 shrink-0">
      {disabledReason ? (
        <div className="flex items-center gap-2 text-xs text-warning bg-warning/5 border border-warning/20 rounded-md px-3 py-2 mb-2">
          <AlertCircle className="size-3.5 shrink-0" />
          <span>{disabledReason}</span>
        </div>
      ) : null}
      {!isBlocked && !isHandoffToHuman && canSend ? (
        <p className="text-[11px] text-muted-foreground mb-2 px-1">
          Al enviar, la IA queda pausada automáticamente. Reactívala desde el panel
          derecho cuando quieras devolver el control al setter.
        </p>
      ) : null}
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={
            disabledReason
              ? '—'
              : 'Escribe un mensaje al lead… (Enter envía, Shift+Enter nueva línea)'
          }
          maxLength={MAX_LENGTH}
          rows={1}
          disabled={disabled}
          className={cn(
            'flex-1 resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm',
            'focus:outline-none focus:ring-2 focus:ring-ring',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'min-h-[40px]',
          )}
        />
        <Button
          type="button"
          size="icon"
          onClick={onSend}
          disabled={disabled || content.trim().length === 0}
          aria-label="Enviar mensaje"
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
        </Button>
      </div>
      {content.length > MAX_LENGTH * 0.8 ? (
        <div className="text-[10px] text-muted-foreground text-right tabular-nums mt-1 px-1">
          {content.length}/{MAX_LENGTH}
        </div>
      ) : null}
    </div>
  );
}
