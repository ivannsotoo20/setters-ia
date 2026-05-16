import type { AnthropicTool } from './types.js';

export const RESPOND_AS_SETTER_TOOL_NAME = 'respond_as_setter';

/**
 * Definición JSON Schema de la tool que el Generator debe usar OBLIGATORIAMENTE
 * (forzado con `tool_choice: { type: 'tool', name: 'respond_as_setter' }`).
 *
 * El campo crítico es `message_raw`: la respuesta del setter al lead, antes de
 * que pase por el Judge (validador post-LLM) y el Splitter (1-4 mensajes 20-280 chars).
 *
 * Los otros campos son metadatos que el motor usa para:
 *  - actualizar `conversations.state`, `phase_number`, `is_qualified`, `is_handoff_to_human`
 *  - decidir si envía recursos adjuntos
 *  - registrar el reasoning para debug del comportamiento
 */
export const respondAsSetterTool: AnthropicTool = {
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
          'Respuesta del setter al lead. Texto en lenguaje natural. Si vas a enviar 2-3 ' +
          'mensajes consecutivos, sepáralos con doble salto de línea (\\n\\n). El splitter posterior los ' +
          'particionará en burbujas de chat de 20-280 chars. NO incluyas placeholders [NOMBRE], [SITUACIÓN], etc. — ' +
          'sustitúyelos por los valores reales tomados del coach y de la conversación.',
        minLength: 1,
        maxLength: 1500,
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
    },
    additionalProperties: false,
  },
};
