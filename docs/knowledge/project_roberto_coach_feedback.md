---
name: project_roberto_coach_feedback
description: "Loop del bloque COACH Roberto Cordobilla (academia/Automatía, hombres sobrepeso +100kg); estado tras la ronda 2026-07-13 (agendamiento método Andrea = pedir WhatsApp del lead, sin Calendly). Recall si vuelve feedback de Roberto o se toca su agendamiento."
metadata: 
  node_type: memory
  type: project
  originSessionId: ce919e07-d1b4-49a3-8444-79c65dd1b808
---

Roberto "Rober" Cordobilla = coach academia/Automatía (hombres con sobrepeso/obesidad, mayoría +100 kg, pérdida de grasa/energía, historial de dietas que no sostiene), formato full-XML `<coach_block>`, hermano de [[project_alfonso_coach_feedback]] / [[project_chema_coach_feedback_loop]] / Juan Gil. **NO es el coach_v5 del SaaS Fyzon**; Iván lo despliega en Automatía. Mismo loop de reconciliación (informe → Iván aprueba → cambios + diff → backup `*.pre-<fecha>.bak`).

⚠️ **DOS Robertos distintos, no confundir:**
1. El que DESPLIEGA en Automatía = `C:\Users\sotob\Downloads\coach_block_roberto_3.0.md` (academia, XML, VIGENTE; hay `coach_block_roberto2.0.txt` y `coach_block_roberto.txt` que quedan atrás). El CORE de ese sistema = `Downloads/core_block_roberto.md`.
2. `prompts/source/coach-v5/roberto-cordobilla.md` en el repo = reconciliación Fyzon-SaaS (formato coach_v5, `{{tracked_calendar_url}}`, status draft, tenant pendiente, **NO desplegado**). Es la v2 de la reunión de Rubén ([[feedback_coach_direccion_bloqueos]]).

**Ronda 2026-07-13 — agendamiento método Andrea Oliver** (pasar de Calendly a pedir el WhatsApp del lead y que Rober contacte él; Andrea Oliver no envía enlace, pide el número directamente; es el mismo método que ya tiene Alfonso). Backup = `coach_block_roberto_3.0.pre-2026-07-13.bak.md`. Cambios (+34/−24):
- `coach_links`: Calendly → `human_handoff`; WhatsApp de Rober como dato INTERNO (nunca se envía) — **número PENDIENTE de Iván** (dejado `[PENDIENTE]`).
- `coach_phase_massage_fase6`: reescrita a 3 MSG literales (pedir WhatsApp → franja mañanas/tardes → cierre "te escribo yo, nos vemos en la llamada!"). ⚠️ **Regla de voz de Iván para estos literales: sin puntos en medio de la frase ni al final; "Genial!" con exclamación.** MSG 1 literal exacto que dio Iván: *"Perfecto señor 👌 Pues vamos a organizarlo, pásame tu número de WhatsApp y te escribo yo directamente para cuadrarlo contigo"*.
- Fase 6 de `coach_structural_modifications_phases` + `handoff`: reescritas; **override explícito CR5/CR6** en handoff (recoger el WhatsApp como canal alternativo, nunca cerrar día/hora concretos ni enviar enlace) + handoff Tipo A `handoff_cause="datos_agenda_recogidos"`.
- Referencias a "Calendly" en tono (léxico/emoji/exentos/principio de autoría) actualizadas a "recogida de WhatsApp de F6".
- El CORE (`core_block_roberto.md`) **NO se toca**: ya soporta el método vía la excepción de CR6 ("prohibido pedir el teléfono salvo que coach_special_protocols defina un canal alternativo").

Nota: Roberto 3.0 YA traía en su voiceprint la regla anti-videollamada ("NUNCA menciones nada de la llamada… salvo en F6 o si lo pregunta el lead"), alineada con doctrina §26 (ver [[project_coach_authoring_kb]]). El método de agendamiento por WhatsApp quedó documentado en el ledger de la KB (`patrones-comunes.md §7`).

Recall si vuelve feedback de Roberto o se toca su agendamiento.
