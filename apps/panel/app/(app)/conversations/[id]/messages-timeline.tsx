import { Bot, MessageSquare, User, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

export interface TimelineMessage {
  id: number;
  source: string;
  content_type: string;
  content: string | null;
  transcription: string | null;
  media_url: string | null;
  sent_at: string;
}

interface Props {
  messages: TimelineMessage[];
}

/**
 * Timeline cronológico estilo chat.
 *   - lead   → izquierda, fondo card neutro.
 *   - ai     → derecha, fondo primary (azul Fyzon).
 *   - human  → derecha, fondo warning suave (intervención manual trainer).
 *   - system → centro, italic (auto-bienvenida/lm/inbound).
 *
 * Media inline:
 *   - audio → <audio controls>.
 *   - image → <img> clicable → full-size.
 *   - video → <video controls>.
 *   - file  → link descarga.
 */
export function MessagesTimeline({ messages }: Props) {
  return (
    <ol className="flex flex-col gap-3">
      {messages.map((m) => (
        <MessageBubble key={m.id} msg={m} />
      ))}
    </ol>
  );
}

function MessageBubble({ msg }: { msg: TimelineMessage }) {
  const align = alignFor(msg.source);
  const Icon = sourceIcon(msg.source);
  const isLead = msg.source === 'lead';
  const isAi = msg.source === 'ai';
  const isHuman = msg.source === 'human';
  const isSystem = msg.source === 'system';

  return (
    <li
      className={cn(
        'flex w-full',
        align === 'right' && 'justify-end',
        align === 'center' && 'justify-center',
      )}
    >
      <div
        className={cn(
          'max-w-[80%] rounded-2xl border px-3.5 py-2.5 flex flex-col gap-1.5 shadow-xs',
          isLead && 'bg-card border-border rounded-bl-sm',
          isAi && 'bg-primary border-primary text-primary-foreground rounded-br-sm',
          isHuman && 'bg-warning/12 border-warning/30 rounded-br-sm dark:bg-warning/20',
          isSystem && 'bg-muted/60 border-border italic text-muted-foreground max-w-[90%]',
        )}
      >
        <div className="flex items-center gap-2">
          <Icon className={cn('size-3', isAi ? 'text-primary-foreground/80' : 'text-muted-foreground')} />
          <span
            className={cn(
              'text-[10px] uppercase tracking-wider font-semibold',
              isLead && 'text-muted-foreground',
              isAi && 'text-primary-foreground/90',
              isHuman && 'text-warning',
              isSystem && 'text-muted-foreground',
            )}
          >
            {sourceLabel(msg.source)}
          </span>
          {msg.content_type !== 'text' ? (
            <Badge
              variant={isAi ? 'secondary' : 'outline'}
              className={cn(
                'h-4 text-[9px] px-1.5 font-normal',
                isAi && 'bg-primary-foreground/15 text-primary-foreground border-primary-foreground/20',
              )}
            >
              {msg.content_type}
            </Badge>
          ) : null}
        </div>

        {msg.content && msg.content.length > 0 ? (
          <div className="text-sm whitespace-pre-wrap break-words leading-relaxed">{msg.content}</div>
        ) : null}

        {msg.media_url ? <MediaPreview url={msg.media_url} type={msg.content_type} /> : null}

        {msg.transcription && msg.transcription.length > 0 && msg.content_type !== 'text' ? (
          <details
            className={cn(
              'text-xs border-t pt-1.5 mt-1',
              isAi
                ? 'text-primary-foreground/70 border-primary-foreground/15'
                : 'text-muted-foreground border-border/50',
            )}
          >
            <summary
              className={cn(
                'cursor-pointer select-none',
                isAi ? 'hover:text-primary-foreground' : 'hover:text-foreground',
              )}
            >
              Transcripción raw
            </summary>
            <pre
              className={cn(
                'mt-1.5 whitespace-pre-wrap break-words font-sans p-2 rounded-md',
                isAi ? 'bg-primary-foreground/10' : 'bg-background/40',
              )}
            >
              {msg.transcription}
            </pre>
          </details>
        ) : null}

        <time
          className={cn(
            'text-[10px] tabular-nums',
            isAi ? 'text-primary-foreground/70' : 'text-muted-foreground',
            align === 'right' ? 'self-end' : align === 'center' ? 'self-center' : 'self-start',
          )}
          dateTime={msg.sent_at}
        >
          {formatTime(msg.sent_at)}
        </time>
      </div>
    </li>
  );
}

function MediaPreview({ url, type }: { url: string; type: string }) {
  if (type === 'audio') {
    return <audio controls preload="none" src={url} className="w-full max-w-xs h-9 mt-1" />;
  }
  if (type === 'image') {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="block mt-1">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt="adjunto"
          className="max-w-xs max-h-64 rounded-md object-cover border border-border"
        />
      </a>
    );
  }
  if (type === 'video') {
    return (
      <video
        controls
        preload="none"
        src={url}
        className="max-w-xs rounded-md mt-1 border border-border"
      />
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-sm text-primary underline underline-offset-2 mt-1"
    >
      Descargar archivo
    </a>
  );
}

function alignFor(source: string): 'left' | 'right' | 'center' {
  if (source === 'lead') return 'left';
  if (source === 'ai' || source === 'human') return 'right';
  return 'center';
}

function sourceLabel(source: string): string {
  if (source === 'lead') return 'Lead';
  if (source === 'ai') return 'IA';
  if (source === 'human') return 'Humano';
  if (source === 'system') return 'Sistema';
  return source;
}

function sourceIcon(source: string) {
  if (source === 'ai') return Bot;
  if (source === 'human') return User;
  if (source === 'system') return Wrench;
  return MessageSquare;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
