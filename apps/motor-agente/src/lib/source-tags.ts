/**
 * Etiquetas de procedencia para el contacto de GHL.
 *
 * Cuando el motor clasifica de dónde viene una conversación, escribe esa misma
 * información como etiquetas en el contacto de GHL, para que el trainer pueda
 * segmentar desde su propio CRM sin depender del panel.
 *
 * Formato acordado con Iván (2026-08-06): minúsculas y guiones.
 *
 * ⚠️ Se aplican con `addContactTags` (POST /contacts/{id}/tags), que es ADITIVO.
 * NUNCA con `updateContact`: ese endpoint trata `tags` como reemplazo del array
 * completo y borraría las etiquetas que el trainer haya puesto a mano.
 */

/** Valores que el motor escribe en `conversations.conversation_source`. */
export type ConversationSource = 'bienvenida' | 'lm' | 'inbound' | 'manual';

/**
 * Canal. Se aceptan las dos nomenclaturas que conviven en el código: la del
 * enum DB (`instagram_dm`) y la interna de los adapters (`instagram`), para que
 * el caller no tenga que traducir según desde dónde llame.
 */
export type TagChannel =
  | 'whatsapp'
  | 'instagram_dm'
  | 'facebook_messenger'
  | 'instagram'
  | 'facebook';

/**
 * Normaliza un texto libre a etiqueta: minúsculas, sin acentos, guiones.
 *
 * Se aplica sobre la keyword que casó el lead magnet, que la escribe el trainer
 * y puede traer tildes, mayúsculas, signos o espacios ("Guía Espalda 2026").
 */
export function slugifyTag(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

const SOURCE_TAG: Record<ConversationSource, string | null> = {
  bienvenida: 'bienvenida',
  lm: 'lead-magnet',
  inbound: 'inbound',
  // 'manual' es intervención humana, no una procedencia: no etiqueta nada.
  manual: null,
};

const CHANNEL_TAG: Record<TagChannel, string> = {
  whatsapp: 'whatsapp',
  instagram_dm: 'instagram',
  facebook_messenger: 'facebook',
  instagram: 'instagram',
  facebook: 'facebook',
};

export interface BuildSourceTagsInput {
  source: ConversationSource | string | null | undefined;
  /**
   * Keyword que disparó la clasificación. Solo se usa con `lm`, para distinguir
   * de qué recurso concreto vino el lead.
   */
  matchedKeyword?: string | null;
  channel?: TagChannel | null;
}

/**
 * Construye la lista de etiquetas para un contacto. Devuelve array vacío si no
 * hay nada cierto que etiquetar.
 *
 * Ejemplos:
 *   {source:'inbound', channel:'instagram_dm'}            → ['inbound', 'instagram']
 *   {source:'lm', matchedKeyword:'Guía Espalda'}          → ['lead-magnet', 'lead-magnet-guia-espalda']
 *   {source:'manual'}                                     → []
 */
export function buildSourceTags(input: BuildSourceTagsInput): string[] {
  const tags: string[] = [];

  const source = input.source;
  if (source && source in SOURCE_TAG) {
    const base = SOURCE_TAG[source as ConversationSource];
    if (base) {
      tags.push(base);
      // Solo el lead magnet se desglosa: es el único origen donde saber "cuál"
      // aporta algo. Un 'inbound-info' no dice nada que no diga 'inbound'.
      if (source === 'lm' && input.matchedKeyword) {
        const slug = slugifyTag(input.matchedKeyword);
        if (slug) tags.push(`lead-magnet-${slug}`);
      }
    }
  }

  if (input.channel && input.channel in CHANNEL_TAG) {
    tags.push(CHANNEL_TAG[input.channel]);
  }

  // Dedupe preservando orden.
  return [...new Set(tags)];
}
