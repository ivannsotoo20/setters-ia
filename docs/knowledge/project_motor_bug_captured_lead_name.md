---
name: project_motor_bug_captured_lead_name
description: "Bug del motor (afecta a TODOS los tenants): la IA captura nombres ajenos — de una plantilla o de un tercero — como si fueran el de la lead, y los persiste a leads.first_name sin guarda de procedencia. Descubierto 2026-07-24 con el feedback de Nani (caso 'Cristina'). Sin fix a 2026-07-30. Recall al tocar name-capture o si vuelve el bug del nombre."
metadata:
  node_type: memory
  type: project
---

Bug descubierto el **2026-07-24** analizando el feedback de Nani: la IA llamó *"Cristina"* a la
lead. Cristina es la **pareja de Nani**, mencionada en una plantilla de encuestas/outbound que
estaba en el historial de la conversación. No es un problema del `coach_block` de Nani — es del
motor, y por tanto **afecta a todos los tenants**. Ver [[project_nani_coach_feedback]].

## Root cause (verificado en código)

El setter LLM emite `captured_lead_name` en su tool output
([`packages/agent-pipeline/src/tool-definition.ts:192-197`](../../packages/agent-pipeline/src/tool-definition.ts))
y el motor lo persiste a `leads.first_name` **sin guarda de procedencia**
([`apps/motor-agente/src/services/process-debounced.ts:442-458`](../../apps/motor-agente/src/services/process-debounced.ts)):
solo `trim().slice(0, 100)` + `update`. No comprueba de dónde salió el nombre ni si `first_name`
ya estaba relleno.

En Instagram `first_name` suele llegar `NULL` → la compuerta queda abierta → el modelo agarra
cualquier nombre que vea en el historial (incluida una plantilla o un tercero) → envenena
`{{lead_contact_status}}`, la Fase 4, la gratitud y el `[nombre]` de la Fase 6.

**El composer NO es el culpable**: sí expone el valor real vía `renderLeadContactBlock`
([`packages/prompt-composer/src/index.ts:190`](../../packages/prompt-composer/src/index.ts)).
El problema no es un placeholder que falte, es la **captura**.

Es exactamente el anti-patrón que motivó revertir el Hito 12.2 (*el nombre viene del registro,
nunca parseado del texto*) reintroducido por otra vía. Ver [[project_hito_12_2_name_gender_prefs]].

## Fix pendiente (código + deploy, NO es `coach_block`)

1. Endurecer la instrucción de `captured_lead_name` en `tool-definition.ts` + espejo en
   `output_contract_v5`: rellenar SOLO con un nombre que la lead declare **sobre sí misma**
   ("me llamo X"); nunca uno de plantilla, bienvenida, encuesta, mensaje del sistema o de un
   tercero.
2. Cinturón en el motor: persistir solo si `first_name` estaba en FALTA.

Bloqueado por el deploy del motor (bloqueo SSH residual del Hito 9 — ver
[[project_hito_9_oauth_cerrado]]).

**Mitigación ya aplicada**: cinturón de voz en el `coach_v5` de Nani
(`coach_tone_voiceprint`, bullet "Nombre de la lead"). Es un parche por prompt en UN tenant, no
el fix.

## Estado

**Verificado el 2026-07-30**: sigue abierto. `tool-definition.ts` no se ha tocado desde
`4ea3d6a` (2026-05-17) y el bloque de persistencia de `process-debounced.ts` sigue sin guarda.
