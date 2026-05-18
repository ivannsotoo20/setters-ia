/**
 * Cerebro v5 — Instrucciones focales por fase para el placeholder `{{current_phase_focus}}`.
 *
 * El `core_v5_base` contiene las 6 fases descritas inline. Para que el modelo
 * NO se confunda al ver todas al mismo tiempo, el motor inyecta por turno una
 * instrucción focal corta (~30-80 tokens) que recuerda:
 *   - Cuál es la fase activa.
 *   - El objetivo principal de esa fase.
 *   - El hard cap de mensajes.
 *
 * Combinado con el atributo XML `priority="active|reference"` (también dinámico,
 * resuelto en el composer en `interpolatePhasePriorities`), reduce drásticamente
 * el riesgo de que el modelo aplique reglas de una fase distinta a la actual.
 *
 * Plan: ~/.claude/plans/c-users-sotob-downloads-bloques-1-md-c-iterative-kitten.md
 * Sprint Iota.4 (2026-05-18).
 */

/**
 * Devuelve la instrucción focal para la fase activa.
 *
 * @param currentPhase - fase activa 1..6 (la fase 7 del output schema mapea a F6 + cierre)
 * @param isHandoff    - si la conversación está en flujo de handoff (causa B/C/D)
 * @returns string en formato instrucción imperativa breve
 */
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
        `NO extraer datos de cualificación todavía. Una pregunta abierta por mensaje.`
      );
    case 2:
      return (
        `AHORA ESTÁS EN FASE 2 — CONTEXTO Y PROBLEMA. Hard cap 6 mensajes. ` +
        `Objetivo: obtener (a) OBJETIVO cuantificado, (b) OBSTÁCULO principal, ` +
        `(c) CONTEXTO de la persona. Validar el TEMA PRINCIPAL hipotetizado en F1. ` +
        `Orden: situación → resultado → obstáculo → validación tema. ` +
        `Una pregunta por mensaje. Patrón "Cuando dices…" mín 1 vez, máx 2.`
      );
    case 3:
      return (
        `AHORA ESTÁS EN FASE 3 — CUALIFICACIÓN SUTIL. Hard cap 2 mensajes. ` +
        `Objetivo: una sola pregunta sutil sobre disposición a cambiar AHORA. ` +
        `Evalúa internamente los 3 criterios universales + criterios <coach_qualification>. ` +
        `Si ya cualifica implícitamente (señales en F1-F2) → SALTA a F4. ` +
        `Si NO cualifica → cierre cálido con <coach_wclose>.`
      );
    case 4:
      return (
        `AHORA ESTÁS EN FASE 4 — PUENTE / RESUMEN. Hard cap 2 mensajes. ` +
        `Objetivo: resumen-puente con SITUACIÓN + OBSTÁCULO + RESULTADO en SUS palabras + ` +
        `pregunta de confirmación cerrada ("¿Voy bien o me dejé algo?"). ` +
        `NUNCA incluyas datos que el lead NO dijo. Si ya verbalizó necesidad de ayuda → OMITE esa pregunta.`
      );
    case 5:
      return (
        `AHORA ESTÁS EN FASE 5 — PROPUESTA DE VIDEOLLAMADA. Hard cap 2 mensajes. ` +
        `Objetivo: proponer la llamada como consecuencia natural de la conversación, no como propuesta comercial. ` +
        `Estructura: transición + justificación (su caso) + beneficio analítico + pregunta cierre. ` +
        `Anclar al TEMA PRINCIPAL del lead. Si duda → 1-2 argumentos distintos antes de cerrar.`
      );
    case 6:
      return (
        `AHORA ESTÁS EN FASE 6 — ENVÍO DE ENLACE Y CIERRE. Hard cap 2 mensajes. ` +
        `Objetivo: enviar enlace/formulario/WhatsApp según <coach_links>, instrucción breve ("avísame cuando reserves"). ` +
        `Tras confirmación de reserva → cierre cálido + handoff Tipo A. ` +
        `NO inventar enlaces. NO modificar enlaces. Si el lead no encuentra hueco → handoff Tipo D.`
      );
    default:
      // Defensivo: fuera de rango → instrucción genérica.
      return (
        `Estás en una fase no estándar (${currentPhase}). Sigue las reglas universales del Core ` +
        `y consulta <coach_block> antes de cada turno. Aplica <protocolo_handoff> Tipo C si algo va mal.`
      );
  }
}
