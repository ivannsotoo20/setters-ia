import type { ValidationRule } from '../types.js';
import { canonicalLinkKey, extractUrls } from '../lib/link-key.js';

/**
 * V20 — ningún enlace a una persona que NO cualifica por residencia.
 *
 * Caso real (tenant 7, 2026-09-11): un lead de WhatsApp con prefijo +502
 * (Guatemala, país al que la entrenadora no lleva) llegó a F6 y recibió el
 * enlace de agenda. El país estaba en el número desde el primer mensaje; la
 * regla de zona vivía solo en el bloque del coach y el modelo no la aplicó.
 *
 * Desde 2026-09-12 el motor calcula la zona por prefijo (zone-policy.ts), se la
 * declara al setter como hecho y, cuando el veredicto es "no cualifica por
 * residencia", enciende `ctx.zoneRejected`. Esta regla es la red de seguridad
 * DETERMINISTA por debajo del modelo: con ese flag encendido, un turno con una
 * URL es un turno que iba a mandar el calendario a quien no toca.
 *
 * Solo se mira la URL, no el resto del mensaje: es lo único que produce una
 * reserva. El texto (cierre, tono, sin nombrar el país) lo fija el coach.
 *
 * Severidad `error`: el orquestador reintenta una vez con la instrucción de
 * cerrar sin enlace y, si el segundo intento vuelve con URL, tumba el turno.
 * Aquí no cabe degradar como en V17: mandar el enlace es exactamente el fallo.
 */
/**
 * 2026-11-04 (D5 de Iván, cierre en texto libre): con `ctx.zoneAllowedUrls`, los
 * vídeos sin CTA de la biblioteca de la entrenadora sí pueden salir; se comparan
 * por clave canónica para que `youtu.be/ID` y `watch?v=ID` cuenten igual. Todo lo
 * demás (la agenda, cualquier otra URL) sigue siendo error.
 */
export const V20_zoneRejectLink: ValidationRule = {
  id: 'V20',
  description: 'Enlace en un turno a una persona que no cualifica por residencia (zona)',
  check: (text, ctx) => {
    if (ctx.zoneRejected !== true) return null;
    const urls = extractUrls(text);
    if (urls.length === 0) return null;
    const allowed = new Set((ctx.zoneAllowedUrls ?? []).map(canonicalLinkKey));
    const offending = urls.find((u) => !allowed.has(canonicalLinkKey(u)));
    if (!offending) return null;
    return {
      ruleId: 'V20',
      description: `la persona no cualifica por residencia y el turno lleva un enlace: "${offending}"`,
      severity: 'error',
      match: offending,
      suggestion:
        allowed.size > 0
          ? 'Este turno es el cierre de residencia fuera de zona del bloque del coach, sin propuesta de videollamada y sin más enlace que un vídeo sin CTA de tu bloque.'
          : 'Este turno es el cierre de residencia fuera de zona del bloque del coach, sin propuesta de videollamada y sin ninguna URL.',
    };
  },
};
