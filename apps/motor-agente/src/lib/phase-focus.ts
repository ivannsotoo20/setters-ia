/**
 * Cerebro v5 — Instrucciones focales por fase.
 *
 * El `core_v5_base` contiene las 6 fases descritas inline. Para que el modelo
 * NO se confunda al ver todas al mismo tiempo, el motor inyecta por turno una
 * instrucción focal corta (~30-80 tokens) que recuerda:
 *   - Cuál es la fase activa.
 *   - El objetivo principal de esa fase.
 *   - El hard cap de mensajes.
 *
 * DÓNDE se pega (cambió el 2026-08-25): el composer la emite como bloque propio
 * al FINAL del system prompt y fuera de caché. Antes se interpolaba dentro del
 * `core_v5_base`, acompañada de un atributo `priority="active"` en la etiqueta de
 * la fase. Costaba ≈ 0 tokens, pero al vivir dentro del primer bloque cacheado
 * invalidaba también el coach y el contrato (~18k tokens) en cada avance de fase.
 *
 * Por eso el texto que devuelve esta función tiene que bastarse solo: reproduce el
 * objetivo, el hard cap y el orden de la fase en lugar de remitir a `<phaseN>`.
 *
 * Sprint Iota.4 (2026-05-18).
 */

/**
 * Devuelve la instrucción focal para la fase activa.
 *
 * @param currentPhase - fase activa 1..6 (la fase 7 del output schema mapea a F6 + cierre)
 * @param isHandoff    - si la conversación está en flujo de handoff (causa B/C/D)
 * @returns string en formato instrucción imperativa breve
 */
/**
 * Dónde vive el enlace de agenda, repetido en las focales de F1 a F4.
 *
 * Antes esta disciplina se la daba al modelo el atributo `priority="active"` pegado
 * a la etiqueta `<phaseN>` dentro del CORE. Al sacar el marcador de la ventana de
 * caché (2026-08-25) esa señal desapareció, y en la batería de ese día el setter
 * mandó el enlace desde F2 — y encima como hueco, `[ENLACE]`, en vez de la URL.
 *
 * Se dice en positivo, con el sustituto delante: dónde va el enlace y qué hacer
 * cuando se lo piden antes de tiempo.
 */
const LINK_BELONGS_TO_F6 =
  'El enlace de agenda pertenece a la F6, cuando ya ha aceptado la llamada. ' +
  'Si te lo pide ahora, le reconoces la petición con naturalidad y sigues con el objetivo de esta fase.';

export function buildPhaseFocusInstruction(
  currentPhase: number,
  isHandoff: boolean = false,
): string {
  if (isHandoff) {
    return (
      `AHORA ESTÁS EN HANDOFF (cierre cálido / silencioso / con mensaje según causa). ` +
      `Aplica <protocolo_handoff> del tipo correspondiente (A/B/C/D). NO continúes la cualificación. ` +
      `NO propongas videollamada. NO repreguntes. Envía el mensaje del tipo y finaliza.`
    );
  }
  switch (currentPhase) {
    case 1:
      return (
        `AHORA ESTÁS EN FASE 1 — CONEXIÓN + TEMA PRINCIPAL. Hard cap 5 mensajes. ` +
        `Objetivo: conocer situación actual del lead, generar conexión real con microaportes, ` +
        `identificar el TEMA PRINCIPAL ÚNICO sin preguntarlo expresamente. ` +
        `NO extraer datos de cualificación todavía. Una pregunta abierta por mensaje. ` +
        LINK_BELONGS_TO_F6
      );
    case 2:
      return (
        `AHORA ESTÁS EN FASE 2 — CONTEXTO Y PROBLEMA. Hard cap 6 mensajes. ` +
        `Objetivo: obtener (a) OBJETIVO cuantificado, (b) OBSTÁCULO principal, ` +
        `(c) CONTEXTO de la persona. Validar el TEMA PRINCIPAL hipotetizado en F1. ` +
        `Orden: situación → resultado → obstáculo → validación tema. ` +
        `Una pregunta por mensaje. Patrón "Cuando dices…" mín 1 vez, máx 2. ` +
        LINK_BELONGS_TO_F6
      );
    case 3:
      return (
        `AHORA ESTÁS EN FASE 3 — CUALIFICACIÓN SUTIL. Hard cap 2 mensajes. ` +
        `Objetivo: una sola pregunta sutil sobre disposición a cambiar AHORA. ` +
        `Evalúa internamente los 3 criterios universales + criterios <coach_qualification>. ` +
        `Si ya cualifica implícitamente (señales en F1-F2) → SALTA a F4. ` +
        `Si NO cualifica → cierre cálido con <coach_wclose>. ` +
        LINK_BELONGS_TO_F6
      );
    case 4:
      return (
        `AHORA ESTÁS EN FASE 4 — PUENTE / RESUMEN. Hard cap 2 mensajes. ` +
        `Objetivo: resumen-puente con SITUACIÓN + OBSTÁCULO + RESULTADO en SUS palabras + ` +
        `pregunta de confirmación cerrada ("¿Voy bien o me dejé algo?"). ` +
        `NUNCA incluyas datos que el lead NO dijo. Si ya verbalizó necesidad de ayuda → OMITE esa pregunta. ` +
        LINK_BELONGS_TO_F6
      );
    case 5:
      return (
        `AHORA ESTÁS EN FASE 5 — PROPUESTA DE VIDEOLLAMADA. Hard cap 2 mensajes. ` +
        `Objetivo: proponer la llamada como consecuencia natural de la conversación, no como propuesta comercial. ` +
        `Estructura: transición + justificación (su caso) + beneficio analítico + pregunta cierre. ` +
        `Anclar al TEMA PRINCIPAL del lead. Si duda → 1-2 argumentos distintos antes de cerrar. ` +
        `Si en este mismo turno acepta la llamada, pasas a F6 y le das el enlace ya, ` +
        `pegando la URL entera tal y como aparece en <coach_links>.`
      );
    case 6:
      return (
        `AHORA ESTÁS EN FASE 6 — ENVÍO DE ENLACE Y CIERRE. Hard cap 2 mensajes. ` +
        `Objetivo: enviar enlace/formulario/WhatsApp según <coach_links>, instrucción breve ("avísame cuando reserves"). ` +
        `Tras confirmación de reserva → cierre cálido + handoff Tipo A. ` +
        `El enlace se pega ENTERO y literal, copiado de <coach_links>: una URL que empieza por http. ` +
        `Si ahí no encuentras una URL literal, no nombras el enlace y haces handoff Tipo D — ` +
        `escribir un hueco tipo [ENLACE], {{...}} o "te paso el link" sin link es el peor resultado posible. ` +
        `Si el lead no encuentra hueco → handoff Tipo D.`
      );
    default:
      // Defensivo: fuera de rango → instrucción genérica.
      return (
        `Estás en una fase no estándar (${currentPhase}). Sigue las reglas universales del Core ` +
        `y consulta <coach_block> antes de cada turno. Aplica <protocolo_handoff> Tipo C si algo va mal.`
      );
  }
}
