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
 * Server component (no interactividad). Renderiza el historial completo de
 * la conversación con burbujas distintas por `source`:
 *   - lead   → izquierda, fondo gris.
 *   - ai     → derecha, fondo verde Fyzon.
 *   - system → centro, italic, color muted (auto-bienvenida/lm/inbound).
 *   - human  → derecha, fondo ámbar (intervención manual del trainer).
 *
 * Soporta media inline:
 *   - audio → <audio controls> con la URL CDN GHL (si caduca, broken link).
 *   - image → <img> thumbnail clicable que abre full size en nueva pestaña.
 *   - video → <video controls>.
 *   - file  → link descarga.
 */
export function MessagesTimeline({ messages }: Props) {
  return (
    <ol className="msg-timeline">
      {messages.map((m) => {
        const align = alignFor(m.source);
        return (
          <li key={m.id} className={`msg-row msg-row--${align}`}>
            <div className={`msg-bubble msg-bubble--${m.source}`}>
              <SourceLabel source={m.source} contentType={m.content_type} />
              <MessageBody msg={m} />
              {m.transcription && m.transcription.length > 0 && m.content_type !== 'text' ? (
                <details className="msg-transcription">
                  <summary>Transcripción raw</summary>
                  <pre>{m.transcription}</pre>
                </details>
              ) : null}
              <time className="msg-time" dateTime={m.sent_at}>
                {formatTime(m.sent_at)}
              </time>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function MessageBody({ msg }: { msg: TimelineMessage }) {
  const text = msg.content ?? '';
  return (
    <>
      {text.length > 0 ? <div className="msg-text">{text}</div> : null}
      {msg.media_url ? <MediaPreview url={msg.media_url} type={msg.content_type} /> : null}
    </>
  );
}

function MediaPreview({ url, type }: { url: string; type: string }) {
  if (type === 'audio') {
    return <audio controls preload="none" src={url} className="msg-media-audio" />;
  }
  if (type === 'image') {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="msg-media-link">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="adjunto" className="msg-media-image" />
      </a>
    );
  }
  if (type === 'video') {
    return <video controls preload="none" src={url} className="msg-media-video" />;
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="msg-media-link">
      Descargar archivo
    </a>
  );
}

function SourceLabel({ source, contentType }: { source: string; contentType: string }) {
  const label =
    source === 'lead'
      ? 'Lead'
      : source === 'ai'
        ? 'IA'
        : source === 'human'
          ? 'Humano'
          : source === 'system'
            ? 'Sistema'
            : source;
  const showType = contentType !== 'text' ? ` · ${contentType}` : '';
  return <span className="msg-source">{label}{showType}</span>;
}

function alignFor(source: string): 'left' | 'right' | 'center' {
  if (source === 'lead') return 'left';
  if (source === 'ai' || source === 'human') return 'right';
  return 'center'; // system
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
