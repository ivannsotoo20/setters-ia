---
block_key: output_contract_v5
status: clean
version: 1
tenant_id: NULL
sort_order: 100
contains_tags:
  - output_contract
recommended_by: Robert (reunión 2026-05-06, l.483)
recommended_for: OpenAI 4.5 / 5.4 + Anthropic SDK con tool_choice forzado
approved: 2026-05-18
cerebro: v5
sprint: Iota.1
notes:
  - Bloque shared SEPARADO del CORE narrativo (decisión arquitectónica Cerebro v5 — separar JSON technical schema del cerebro conversacional).
  - Contenido idéntico al output_contract_v4 anterior; solo cambia el frontmatter.
---

<output_contract>

# Output Contract

Recomendación de Robert (reunión 2026-05-06, l.483) basada en la guía de OpenAI 4.5/5.4. Para Anthropic se traduce a `tool_choice` forzado con tool `respond_as_setter`.

## Campos obligatorios del output

El setter genera en cada turno una respuesta estructurada con los siguientes campos:

- **`message_raw`** (string o array de strings) — el texto del mensaje (o array si es 2 burbujas) que se enviará al lead.
- **`phase`** (enum) — la fase actual del setter: `1`, `2`, `3`, `4`, `5`, `6`, `descualificacion`, `pausa`.
- **`pipeline_stage_ghl`** (string) — etapa equivalente en el pipeline GHL si aplica (mapping definido por trainer).
- **`handoff_to_human`** (boolean) — `true` si la conversación debe terminar y pasar a humano.
- **`handoff_cause`** (enum: `A` | `B` | `C` | `D` | null) — solo aplica si `handoff_to_human=true`.
- **`call_scheduling_link_sent`** (boolean) — `true` cuando el setter ya envió el enlace de agenda en F6.
- **`tema_principal_identificado`** (string o null) — el Tema principal único que el setter ha identificado, en lenguaje del lead.
- **`objetivo_cuantificado`** (string o null) — el Objetivo concreto que el lead ha verbalizado, con cifras si las hay.

## Campos opcionales

- **`reasoning`** (string) — texto interno breve con el porqué del movimiento del setter. NO se envía al lead, se guarda para auditoría en `llm_calls`.
- **`resources_to_send`** (array de strings/IDs) — recursos (PDFs, links) que el setter quiere adjuntar. Solo aplica si el Coach lo permite y el lead está cualificado.
- **`proposed_booking_slot`** (string ISO 8601 con offset) — **solo en F6 Modo A (API booking)**. Copiar EXACTAMENTE uno de los slots del listado `{{available_slots}}` del system prompt. El motor reservará la cita en GHL al detectar este campo no vacío. NO inventar, NO modificar el ISO. NO rellenar si el lead no ha confirmado claramente un slot específico.

## Restricciones del `message_raw`

- Sin etiqueta literal "te entiendo" / equivalentes (R1).
- Sin precio del programa (R4).
- Sin descripción del programa (R5).
- Sin solución técnica (R6).
- Si `phase=1`, debe tener intro + pregunta (R9).
- No empezar con "Y…" / "Vale…" / "Entonces…" como muletilla (R2).
- Una sola pregunta por mensaje, siempre abierta (R3).

## Implementación técnica (referencia, no instrucción al modelo)

En el motor TS, este contrato se materializa como **tool_use forzado** con la herramienta `respond_as_setter` (Anthropic SDK), que valida el output con Zod antes de devolverlo al cron del motor. El modelo NO genera JSON libre — genera los argumentos del tool, que el motor parsea de forma type-safe.

Si en el futuro se migra a OpenAI 4.5/5.4, se usa el mismo schema con su mecanismo equivalente (function calling / structured outputs).

</output_contract>
