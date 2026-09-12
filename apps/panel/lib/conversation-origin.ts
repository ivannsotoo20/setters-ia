/**
 * Origen de una conversación, tal y como lo entiende la entrenadora.
 *
 * `conversations.conversation_source` NO dice quién abrió: 'inbound' es el TIPO
 * de la palabra clave, y el router de GHL lo escribe también cuando es la
 * automatización de la entrenadora la que escribe primero (contestando a un
 * comentario o a una palabra clave). En el tenant 7 (2026-09-12) eso eran 141
 * conversaciones de Instagram con el primer mensaje nuestro etiquetadas
 * "inbound", más 18 bienvenidas que la automatización re-etiquetó al contestar
 * con una palabra clave. Tania: "Inbound debe ser solo cuando es la persona la
 * que me escribe directamente abriendo conversación".
 *
 * Quién abrió lo dice `conversations.direction`, que es fiable (verificado
 * contra el primer mensaje de las 1.662 conversaciones del tenant). El origen
 * se deriva de los dos campos, y este helper es el ÚNICO sitio donde se hace.
 */

export type ConversationOriginKey =
  | 'inbound'
  | 'welcome'
  | 'keyword'
  | 'lead_magnet'
  | 'manual'
  | 'unknown';

export interface ConversationOrigin {
  key: ConversationOriginKey;
  label: string;
}

const LABELS: Record<ConversationOriginKey, string> = {
  inbound: 'Inbound (escribió ella)',
  welcome: 'Bienvenida',
  keyword: 'Palabra clave',
  lead_magnet: 'Lead magnet',
  manual: 'Manual',
  unknown: 'Sin origen',
};

/** Orden en el que se ofrecen los filtros. */
export const ORIGIN_FILTER_ORDER: readonly ConversationOriginKey[] = [
  'inbound',
  'welcome',
  'keyword',
  'lead_magnet',
  'manual',
];

export function originLabel(key: ConversationOriginKey): string {
  return LABELS[key];
}

export function describeConversationOrigin(conv: {
  conversation_source?: string | null;
  direction?: string | null;
}): ConversationOrigin {
  const key = originKeyOf(conv);
  return { key, label: LABELS[key] };
}

export function originKeyOf(conv: {
  conversation_source?: string | null;
  direction?: string | null;
}): ConversationOriginKey {
  const source = conv.conversation_source ?? null;
  const direction = conv.direction ?? null;
  // Escribió ella primero: es inbound diga lo que diga la etiqueta.
  if (direction === 'inbound') return 'inbound';
  switch (source) {
    case 'bienvenida':
      return 'welcome';
    case 'lm':
      return 'lead_magnet';
    case 'inbound':
      // Con direction='outbound' (o sin dirección conocida) fue nuestra
      // automatización la que abrió por una palabra clave.
      return 'keyword';
    case 'manual':
      return 'manual';
    default:
      return 'unknown';
  }
}

/**
 * Traduce un valor de filtro a claves de origen. Acepta las claves nuevas y,
 * por compatibilidad con enlaces guardados, los valores crudos antiguos de
 * `conversation_source` ('bienvenida', 'lm', 'inbound', 'manual').
 */
export function parseOriginFilterValue(value: string): ConversationOriginKey | null {
  switch (value) {
    case 'inbound':
    case 'welcome':
    case 'keyword':
    case 'lead_magnet':
    case 'manual':
      return value;
    case 'bienvenida':
      return 'welcome';
    case 'lm':
      return 'lead_magnet';
    default:
      return null;
  }
}

export function matchesOriginFilter(
  conv: { conversation_source?: string | null; direction?: string | null },
  filterValues: readonly string[],
): boolean {
  if (filterValues.length === 0) return true;
  const wanted = new Set<ConversationOriginKey>();
  for (const v of filterValues) {
    const k = parseOriginFilterValue(v);
    if (k) wanted.add(k);
  }
  if (wanted.size === 0) return true;
  return wanted.has(originKeyOf(conv));
}
