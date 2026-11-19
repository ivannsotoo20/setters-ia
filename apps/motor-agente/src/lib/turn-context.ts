/**
 * Datos de contexto que el motor le da al modelo por turno (2026-11-19, Tania:
 * "necesitamos que conserve el contexto, responda a lo que la persona pregunta y
 * evite repetir tanto mensajes como preguntas").
 *
 *  - Apertura repetida: la automatización de la entrenadora (ManyChat / GHL) le
 *    vuelve a mandar el mensaje de apertura dentro de una conversación ya
 *    abierta. Lo que contesta la persona responde a ESA apertura, pero el modelo
 *    lo leía como respuesta a su última pregunta (raquel28el, 18-nov: «Todo el
 *    día» a «¿en qué movimientos notas molestias?» se entendió como la duración
 *    del dolor). 15 de 273 aperturas del 1 al 19-nov cayeron así.
 *  - País ya contestado y en zona: a «desde dónde me escribes?» contestó un sitio
 *    de la zona («desde Ceuta») y el modelo seguía dudando y preguntando
 *    (gmma.1971: «Ceuta es parte de España o te mueves entre dos países?»).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { countryNameEs, findCountryNames, zoneOfIso, type ZoneAllowlist } from './zone-config.js';

export interface ReopenerInfo {
  /** Días entre el último mensaje de la IA y la apertura repetida. */
  daysSinceLastAi: number;
}

/**
 * ¿Lo último que recibió la persona (antes de lo que acaba de escribir) es una
 * apertura de la automatización, en una conversación donde la IA ya había
 * hablado? null si no, o si la consulta falla (nunca lanza).
 */
export async function detectRepeatedOpener(
  supabase: SupabaseClient,
  conversationId: number,
): Promise<ReopenerInfo | null> {
  try {
    const { data: lastOut } = await supabase
      .from('conversation_messages')
      .select('source, sent_at')
      .eq('conversation_id', conversationId)
      .neq('source', 'lead')
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!lastOut || lastOut.source !== 'system') return null;
    const { data: prevAi } = await supabase
      .from('conversation_messages')
      .select('sent_at')
      .eq('conversation_id', conversationId)
      .eq('source', 'ai')
      .lt('sent_at', String(lastOut.sent_at))
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!prevAi) return null;
    const days = (Date.parse(String(lastOut.sent_at)) - Date.parse(String(prevAi.sent_at))) / 86_400_000;
    return { daysSinceLastAi: Math.max(0, Math.round(days)) };
  } catch {
    return null;
  }
}

export function buildRepeatedOpenerDirective(info: ReopenerInfo | null): string | null {
  if (!info) return null;
  const when =
    info.daysSinceLastAi >= 2
      ? `hace unos ${info.daysSinceLastAi} días`
      : info.daysSinceLastAi === 1
        ? 'ayer'
        : 'hace poco';
  return (
    '## Apertura repetida (dato del motor)\n\n' +
    'La automatización de la entrenadora le ha vuelto a mandar el mensaje de apertura dentro de ' +
    `esta conversación, que ya estaba abierta (la última vez que le escribiste fue ${when}). Lo que ` +
    'acaba de escribir contesta a ESA apertura, no a la última pregunta que le hiciste tú antes. ' +
    'Retoma con todo lo que ya sabes de ella: no le repitas preguntas que ya te contestó y sigue ' +
    'desde lo que le falta por contarte.'
  );
}

/**
 * Si a nuestra pregunta del país contestó con un país de la zona «siempre» de la
 * lista blanca (no los de filtro, que siguen su camino), el ISO; si no, null.
 */
export function countryAnsweredInZone(
  countryAnswers: ReadonlyArray<string>,
  allowlist: ZoneAllowlist | null | undefined,
): { iso: string; answer: string } | null {
  if (!allowlist) return null;
  for (let i = countryAnswers.length - 1; i >= 0; i--) {
    const answer = countryAnswers[i]!;
    const isos = findCountryNames(answer);
    if (isos.length === 0) continue;
    if (isos.some((iso) => zoneOfIso(iso, allowlist) !== 'always')) return null;
    return { iso: isos[0]!, answer };
  }
  return null;
}

export function buildCountryInZoneDirective(found: { iso: string; answer: string } | null): string | null {
  if (!found) return null;
  const excerpt = found.answer.length > 60 ? `${found.answer.slice(0, 60)}…` : found.answer;
  return (
    '## Dónde vive (dato del motor)\n\n' +
    `A tu pregunta de desde dónde escribe contestó «${excerpt}», que es ${countryNameEs(found.iso)}: ` +
    'vive en la zona de la entrenadora y está resuelto. No le vuelvas a preguntar dónde vive ni le ' +
    `comentes nada sobre su país ni sobre la zona; declara lead_country_iso=${found.iso}.`
  );
}
