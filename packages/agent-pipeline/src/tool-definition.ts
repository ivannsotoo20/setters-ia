import type { AnthropicTool } from './types.js';

export const RESPOND_AS_SETTER_TOOL_NAME = 'respond_as_setter';

/**
 * Hito 12.1 — Holgura sobre `maxParts × 280` para acomodar separadores `\n\n`
 * entre partes consecutivas. 30 chars cubren hasta 10 separadores (3 chars c/u).
 */
const MESSAGE_RAW_HOLGURA_CHARS = 30;
const MAX_CHARS_PER_PART = 280;
const DEFAULT_MAX_PARTS: 1 | 2 | 3 | 4 = 4;

/**
 * Cap absoluto del `message_raw` por nivel de `aiMessagesPerTurnMax`:
 *   - cap=1 → 310 chars
 *   - cap=2 → 590 chars
 *   - cap=3 → 870 chars
 *   - cap=4 → 1150 chars
 *
 * Es lo que el SCHEMA de Anthropic acepta como `maxLength`. El modelo
 * recibirá además una directriz en el system prompt (`trainer_prefs_v1`)
 * con instrucciones explícitas (ESTRICTA).
 */
function computeMessageRawMaxLength(maxParts: 1 | 2 | 3 | 4): number {
  return maxParts * MAX_CHARS_PER_PART + MESSAGE_RAW_HOLGURA_CHARS;
}

/**
 * Hito 12.1 — Construye la definición de la tool `respond_as_setter` con
 * `maxLength` dinámico del campo `message_raw` según el cap del trainer.
 *
 * Antes del Hito 12.1 el `maxLength` estaba hardcoded a 1500. Ahora es función
 * de `aiMessagesPerTurnMax` (1-4) para que el cap se cumpla al 100%:
 *  - Generator genera respuesta con techo de chars proporcional al cap.
 *  - Splitter recibe `maxParts` coherente y particiona dentro del cap.
 *  - Validador (V0-V16) no necesita conocer este cap (el Generator no podrá
 *    pasarse del schema, Anthropic rechazaría el tool_use).
 *
 * El factory NO se memoiza — construir la tool es trivial (un object literal)
 * y se llama 1 vez por turno. Sí se cachean los system prompts vía
 * `cache_control: { type: 'ephemeral' }` en otro flujo.
 */
export function buildRespondAsSetterTool(opts: { maxParts: 1 | 2 | 3 | 4 } = { maxParts: DEFAULT_MAX_PARTS }): AnthropicTool {
  const maxLength = computeMessageRawMaxLength(opts.maxParts);
  return {
    name: RESPOND_AS_SETTER_TOOL_NAME,
    description:
      'Genera el siguiente turno del setter. Devuelve la respuesta del setter (message_raw), el resumen del lead, ' +
      'el estado de la conversación, la fase decidida tras el turno y opcionalmente recursos a enviar y motivo de handoff. ' +
      'OBLIGATORIO usar esta tool en cada turno.',
    input_schema: {
      type: 'object',
      required: ['message_raw', 'conversation_status', 'phase_decision'],
      properties: {
        message_raw: {
          type: 'string',
          description:
            `Respuesta del setter al lead. Texto en lenguaje natural. Si vas a enviar varios ` +
            `mensajes consecutivos, sepáralos con doble salto de línea (\\n\\n). El splitter posterior los ` +
            `particionará en burbujas de chat de 20-280 chars (máximo ${opts.maxParts} burbujas). NO incluyas ` +
            `placeholders [NOMBRE], [SITUACIÓN], etc. — sustitúyelos por los valores reales tomados del coach ` +
            `y de la conversación.

` +
            `APAGADO SILENCIOSO: cadena VACÍA ("") si el coach ordena no contestar nada a este ` +
            `turno (típicamente cuando preguntan si eres una IA). Solo es válido junto a ` +
            `conversation_status="handoff" y su handoff_cause. Con cualquier otro estado, el ` +
            `mensaje no puede ir vacío.`,
          minLength: 0,
          maxLength,
        },
      user_summary: {
        type: 'string',
        description:
          'Resumen breve (1-2 frases) de lo que has entendido del lead en este turno. Se guarda en ' +
          'conversations.current_context para los siguientes turnos.',
        maxLength: 500,
      },
      conversation_status: {
        type: 'string',
        enum: ['active', 'qualified', 'disqualified', 'handoff', 'paused'],
        description:
          'Estado de la conversación tras este turno. ' +
          '`active`: sigue conversando. ' +
          '`qualified`: lead cualifica, pasa a propuesta/agenda. ' +
          '`disqualified`: lead no cualifica (D1-D8 del coach). ' +
          '`handoff`: derivar a humano (incluido tras agenda confirmada). ' +
          '`paused`: el lead pidió pausar (se reactivará cuando el lead vuelva a escribir).',
      },
      phase_decision: {
        type: 'integer',
        minimum: 1,
        maximum: 7,
        description:
          'Fase del setting tras este turno. 1: apertura/conexión. 2: profundizar (situación, resultado, freno). ' +
          '3: cualificación profunda. 4: el puente (resumen). 5: propuesta de llamada. 6: envío de link de agenda. ' +
          '7: cierre post-agenda. NO retrocedas fases salvo emergencia explícita.',
      },
      resources_to_send: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Recursos sugeridos (PDFs, vídeos, links) por su clave/nombre tal como aparecen en el coach. Opcional.',
      },
      handoff_cause: {
        type: 'string',
        enum: [
          'A_agenda',
          'B_derivacion',
          'C_descualificado',
          'D_espera',
          'E_error',
        ],
        description:
          'Solo si conversation_status == handoff. ' +
          'A_agenda: lead confirmó reserva. B_derivacion: derivado a humano por complejidad. ' +
          'C_descualificado: handoff tras descualificación grave (D6 TCA, D7 falta respeto). ' +
          'D_espera: lead pidió pausar. E_error: error técnico que requiere intervención.',
      },
      reasoning: {
        type: 'string',
        description:
          'Razonamiento corto (≤200 chars) de por qué tomas esta decisión. NO se envía al lead. Solo para debug.',
        maxLength: 500,
      },
      // Razonamiento estructurado del Generator — campos opcionales que rellenan
      // las columnas conversations.{current_context,emotion,problem,goal,urgency,
      // next_action,general_context,general_motivation}. Se muestran al trainer
      // en el panel /conversations → ControlPanel → FunnelPhaseIndicator.
      // Opcionales por compatibilidad con turnos donde el LLM no los rellene
      // (en ese caso quedan NULL en BD). El prompt del Generator se ampliará
      // por separado para forzar su llenado en cada turno.
      emotion: {
        type: 'string',
        description: 'Emoción dominante del lead en este turno (1-4 palabras, ej: "frustrado", "ilusionado", "escéptico", "agotado"). Opcional.',
        maxLength: 60,
      },
      problem: {
        type: 'string',
        description: 'Dolor / problema concreto detectado en el lead (≤120 chars). Ej: "no consigue cerrar leads de IG, lleva 6 meses pagando ads sin retorno". Opcional.',
        maxLength: 200,
      },
      goal: {
        type: 'string',
        description: 'Outcome / objetivo que el lead busca (≤120 chars). Ej: "facturar 5k/mes con su agencia de contenidos". Opcional.',
        maxLength: 200,
      },
      urgency: {
        type: 'string',
        description: 'Nivel de urgencia ("alta" / "media" / "baja") + 1 frase de contexto si aplica. Ej: "alta — quiere arrancar antes de mes que viene". Opcional.',
        maxLength: 120,
      },
      next_action: {
        type: 'string',
        description: 'Próximo paso del setter en el próximo turno (≤100 chars). Ej: "preguntar por presupuesto de marketing actual". Opcional.',
        maxLength: 200,
      },
      general_context: {
        type: 'string',
        description: 'Contexto histórico acumulado del lead a lo largo de la conversación (≤300 chars, se acumula turno a turno). Diferente de current_context (que es del turno actual). Opcional.',
        maxLength: 500,
      },
      general_motivation: {
        type: 'string',
        description: 'Motivación profunda / driver del lead (≤200 chars). Ej: "quiere dejar el trabajo por cuenta ajena en 12 meses". Opcional.',
        maxLength: 300,
      },
      // Hito 10.6 — API Booking. Solo rellenar cuando el lead confirma EXPLÍCITAMENTE
      // un slot de los que se le propusieron en el turno anterior. El motor lee este
      // campo tras el Generator output y llama POST /calendars/events/appointments a
      // GHL con el contactId real del lead (sin pasar por widget). Eso garantiza
      // trazabilidad lead bot → cita 100%.
      proposed_booking_slot: {
        type: 'string',
        description:
          'Si el lead confirma EXPLÍCITAMENTE un slot de los que le propusiste en el turno anterior, ' +
          'rellena con la fecha/hora EXACTA en ISO 8601 con offset, copiada literalmente del listado de slots ' +
          'que tienes en el system prompt (entre paréntesis junto a la etiqueta humana). Ejemplo: "2026-05-19T17:00:00+02:00". ' +
          'PRE-REQUISITO ABSOLUTO: solo rellenar si ya tienes EMAIL y NOMBRE del lead (mira "Datos del lead" en F6). ' +
          'Si falta email o nombre → NO rellenar, pídelos primero. ' +
          'CUÁNDO RELLENAR: solo cuando el lead diga claramente "sí, ese me viene", "el lunes 17h va bien", "agéndame ese". ' +
          'CUÁNDO NO RELLENAR (omitir el campo): si el lead pregunta, duda, negocia, pide otro día, o aún no confirma. ' +
          'NO inventes slots — copia EXACTAMENTE uno de los que tienes en el system prompt. ' +
          'El motor reservará la cita automáticamente al detectar este campo.',
      },
      // Hito 10.6.1 — Captura de email/nombre del lead durante la conversación.
      // El setter rellena estos campos cuando el lead da el dato en este turno.
      // Motor los persiste a leads.email / leads.first_name + sincroniza al contacto
      // GHL via upsertContact para que GHL pueda enviar el email de confirmación
      // al lead cuando se cree la cita.
      captured_lead_email: {
        type: 'string',
        description:
          'Email del lead capturado en ESTE turno (no en uno anterior). Rellenar solo si el lead acaba de dar su email ' +
          'en su último mensaje. Formato email válido (ej: "juan@example.com"). Si el lead ya dio el email antes y ya está ' +
          'guardado en BD (ves "Email: ya tienes" en Datos del lead), NO rellenar. NO inventar emails.',
      },
      captured_lead_name: {
        type: 'string',
        description:
          'Nombre real del lead capturado en ESTE turno. Rellenar solo si el lead acaba de dar su nombre en su último ' +
          'mensaje y ANTES estaba marcado como "FALTA". Formato: solo el nombre o "Nombre Apellido". Si ya está en BD ' +
          '(ves "Nombre: Ivan ✓" en Datos del lead), NO rellenar. NO inventar nombres.',
      },
    },
    additionalProperties: false,
  },
  };
}

/**
 * Hito 12.1 — Export legacy de compatibilidad con consumidores que aún no
 * propagan `maxParts`. Equivale al cap por defecto (4 = baseline pre-Hito 12.1).
 * Tests existentes y código no migrado siguen funcionando sin cambios.
 *
 * Para enforce real del cap dinámico, el caller debe usar `buildRespondAsSetterTool({ maxParts })`.
 */
export const respondAsSetterTool: AnthropicTool = buildRespondAsSetterTool();
