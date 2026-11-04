/**
 * Clave estable de un enlace para compararlo con una lista de permitidos
 * (2026-11-04, cierre de fuera de zona en texto libre).
 *
 * El mismo vídeo de YouTube se escribe de varias formas (`youtu.be/ID`,
 * `watch?v=ID`, `shorts/ID`, con `&feature=` detrás) y el modelo no siempre
 * copia la del bloque. Para cualquier otra URL, la clave es la URL en
 * minúsculas sin esquema, sin `www.`, sin la barra final y sin el signo que la
 * siga («...youtu.be/ID.» → sin el punto).
 */

export const URL_IN_TEXT_RE = /https?:\/\/[^\s"'<>)\]]+/gi;

const YOUTUBE_ID_RE =
  /(?:youtube\.com\/(?:watch\?(?:[^#\s]*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/i;

export function canonicalLinkKey(url: string): string {
  const trimmed = String(url ?? '').trim().replace(/[.,;:!?)\]]+$/, '');
  const yt = trimmed.match(YOUTUBE_ID_RE);
  if (yt) return `yt:${yt[1]}`;
  return trimmed
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '');
}

/** Las URLs de un texto, en orden y tal como están escritas. */
export function extractUrls(text: string): string[] {
  return String(text ?? '').match(URL_IN_TEXT_RE) ?? [];
}

/** ¿Todas las URLs del texto están en la lista de permitidos? (Sin URLs, sí.) */
export function urlsAllowed(text: string, allowed: ReadonlyArray<string>): boolean {
  const keys = new Set(allowed.map(canonicalLinkKey));
  return extractUrls(text).every((u) => keys.has(canonicalLinkKey(u)));
}
