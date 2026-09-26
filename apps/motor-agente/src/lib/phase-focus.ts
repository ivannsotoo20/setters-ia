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

export interface PhaseFocusOptions {
  /**
   * El motor ha decidido que la persona NO cualifica por residencia (prefijo del
   * teléfono fuera de zona, `zoneVerdict.kind === 'reject_by_prefix'`). La focal
   * deja de hablar de la fase y ordena el cierre en este turno.
   */
  zoneClose?: boolean;
  /**
   * Prefijo fuera de zona pero residencia EN zona declarada en su formulario
   * (`prefix_out_residence_in`, decisión D1 de Iván): el turno no cierra, pasa a
   * la entrenadora con handoff B. Manda sobre `zoneClose`.
   */
  zoneHandoff?: boolean;
}

/**
 * Focal de la excepción D1, determinista desde 2026-09-26: con la excepción
 * solo explicada dentro de la focal de cierre, el modelo cerró con el literal a
 * un +502 que en su formulario había escrito "En Canadá".
 */
const ZONE_HANDOFF_FOCUS =
  'PRIORIDAD ABSOLUTA — ESTE TURNO PASA A LA ENTRENADORA. Esta instrucción manda sobre la fase ' +
  'en la que ibas: su teléfono es de un país al que la entrenadora no lleva, pero en su ' +
  'formulario declaró vivir en uno al que sí lleva (sección "Zona geográfica"). No la cierres, ' +
  'no sigas cualificando y no le preguntes dónde vive. Tu mensaje es breve: le dices que le ' +
  'escribe la entrenadora. Devuelve conversation_status="handoff" con ' +
  'handoff_cause="B_derivacion". Sin propuesta de videollamada y sin enlace.';

/**
 * Focal de cierre por zona. Sustituye a la de la fase, no se suma a ella.
 *
 * Por qué existe (conv 12203, Instagram con teléfono +57, 2026-09-23): la
 * directiva de zona decía "en este turno tu mensaje es el cierre", pero el
 * último bloque del prompt, que es esta focal y el modelo lee como la orden de
 * mayor prioridad, decía "FASE 1… NO extraer datos de cualificación todavía".
 * Razonamiento real del modelo (llm_calls 5064): «Colombia está en lista de
 * exclusión… se aplicará como cierre cuando corresponda; de momento sigo el
 * flujo». Veinticuatro mensajes sin cerrar. Con dos órdenes que se contradicen
 * gana la última, así que la última tiene que ser el cierre.
 *
 * El literal NO vive aquí: lo pone el bloque del coach (coach_qualification_doesnt).
 * El motor solo dice QUÉ toca en este turno y con qué estado sale.
 *
 * La cláusula del cierre ya enviado cubre la conversación que sigue viva tras el
 * `disqualified` (el estado 'stopped' no pausa la IA): si ella vuelve a escribir,
 * el turno sigue cerrando, pero sin repetirle el mismo literal.
 */
const ZONE_CLOSE_FOCUS =
  'PRIORIDAD ABSOLUTA — ESTE TURNO CIERRA POR RESIDENCIA. Esta instrucción manda sobre la fase ' +
  'en la que ibas y sobre cualquier objetivo de fase: el motor ha comprobado que esta persona no ' +
  'cualifica por residencia (sección "Zona geográfica"). No sigas cualificando ni esperes a otro ' +
  'turno para cerrar. Tu mensaje de este turno es el cierre de residencia fuera de zona que define ' +
  'tu bloque (coach_qualification_doesnt), escrito tal cual: sin nombrar el país ni el motivo, sin ' +
  'preguntas, sin propuesta de videollamada y sin ningún enlace. Devuelve ' +
  'conversation_status="disqualified". Si ese cierre ya se lo enviaste en un turno anterior, no lo ' +
  'repitas: una frase breve de despedida, sin preguntas, y conversation_status="disqualified". ' +
  'Única excepción: si ella ha escrito, en el formulario o en el chat, que reside en un país de la ' +
  'zona de contacto, no la cierras tú: conversation_status="handoff" con ' +
  'handoff_cause="B_derivacion" y un mensaje breve de que le escribe la entrenadora, sin enlace.';

/**
 * Devuelve la instrucción focal para la fase activa.
 *
 * @param currentPhase - fase activa 1..6 (la fase 7 del output schema mapea a F6 + cierre)
 * @param isHandoff    - si la conversación está en flujo de handoff (causa B/C/D)
 * @param options      - `zoneClose`: la persona no cualifica por residencia. Manda
 *                       sobre la fase y sobre `isHandoff`.
 * @returns string en formato instrucción imperativa breve
 */
export function buildPhaseFocusInstruction(
  currentPhase: number,
  isHandoff: boolean = false,
  options: PhaseFocusOptions = {},
): string {
  if (options.zoneHandoff === true) {
    return ZONE_HANDOFF_FOCUS;
  }
  if (options.zoneClose === true) {
    return ZONE_CLOSE_FOCUS;
  }
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
