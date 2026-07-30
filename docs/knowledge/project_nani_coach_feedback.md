---
name: project_nani_coach_feedback
description: "Loop del bloque coach_v5 de Nani (Abderrazak 'Nani') — tenant del SaaS Fyzon, NO academia. Avatar mujeres pérdida de peso/nutrición con foco en hinchazón y ciclo; registro cercano-PROFESIONAL. Rondas 1 y 2 aplicadas 2026-07-24. Recall si vuelve feedback de Nani."
metadata:
  node_type: memory
  type: project
---

Nani (Abderrazak "Nani") = tenant **del SaaS Fyzon**, no de la academia. Es de los pocos loops
de coach que corre sobre este repo y no sobre Automatía: su bloque es `coach_v5` de verdad, con
frontmatter y `{{tracked_calendar_url}}`, y se carga con `build-coach-v5-seed.mjs` → MCP.

Avatar mujeres pérdida de peso / nutrición con foco en **hinchazón y ciclo**. Registro
cercano-**PROFESIONAL** con dirección dominante: más cerca de Julia/Mireya que de María de Lluc.
Programa "Confía en Ti", 3 meses, Calendly, videollamada por Zoom **que da él** (handoff
invisible).

**Prompt:** [`prompts/source/coach-v5/nani.md`](../../prompts/source/coach-v5/nani.md) (~55 k
chars). `status: draft` — **no está cargado todavía**. Antes de correr el script hay que
confirmar el `tenant_slug` / `trainer` reales del tenant creado; el frontmatter va con `nani`
provisional.

## Ronda 1 — 2026-07-24

Fuente: feedback de Nani en `Downloads/outbound y encuesta setter actualizado.pdf`. Aplicado con
criterio propio tras análisis adversarial, agrupado en 5 clusters:

- **A — F1, conexión.** Se re-secuenciaron los exemplars: T1 agradece + de-dónde-me-sigues →
  smalltalk → pivote a entrenar. Regla binaria: **el primer mensaje NUNCA pregunta si entrena**.
  *Autoridad ejercida*: se rechazó su diagnóstico ("deja caer que damos entrenamientos") — estaba
  mal atribuido; la pregunta de entreno es descubrimiento válido, no fuga de oferta. El hueco
  real era el exemplar fusionado (doctrina §8).
- **B — fuera "ostras".** Sí es su voz, pero su reemplazo ("maravilloso / nueva etapa") es sordo
  ante un duelo. Se ruteó la empatía **por valencia**: positivo → "maravilloso, menuda etapa";
  doloroso → "Vaya, siento leer eso..". "ostras" pasa a NUNCA. No se tocó la doctrina (§5 usa
  "ostras" como ejemplo).
- **C — cierre de F5.** Propuesta rica que pinta la llamada (10-15 min, lo que dijo Nani) y se
  mató el clunky *"¿cómo trabajamos juntas?"*. *Autoridad ejercida*: se comprimió su guion — no
  listar "qué has probado" (se filtraría a F2 como drill del pasado, CR7) ni entregables
  plan/soporte (CR3); no se importó el reencuadre que nombra la llamada antes de F5 (§26).
- **D — preguntar por las dudas.** §13 dice no esquivarlas → invitación proactiva, pero **gated a
  F5+**: nunca en descubrimiento (fabricaría objeciones) y acotada a la llamada / dar el paso, no
  a método ni precio (CR2/CR3/CR4).
- **E — caso "Cristina".** No es del `coach_block` → [[project_motor_bug_captured_lead_name]]. En
  el bloque solo entró un cinturón de voz en el voiceprint.

## Ronda 2 — 2026-07-24 (tras el smoke de Iván)

El smoke validó F1-secuencia, empatía por valencia, propuesta de F5 e invitar-dudas. Apareció un
fallo nuevo en **cualificación (F2)**: el setter recorría la lista de 5 situaciones como un
guion — (1) forzaba a elegir/rankear "qué pesa más" entre hinchazón y espejo, repetido; (2)
re-preguntaba "qué te falta para empezar" cuando ella ya había dicho "quiero una guía".

Aplicado en F2:
- Las 5 situaciones son **checklist, NO guion**.
- Prohibido "qué pesa más" / "si tuvieras que elegir" / listar opciones.
- Prioridad solo como "a qué le das más importancia", **máx 1 vez** (a veces ni eso).
- La solución percibida **se salta** si ya la dio.
- Profundidad = impacto emocional, **no** número de preguntas (ser directo cuando el objetivo ya
  está claro).
- Quitado el "OVERRIDE ~8 mensajes".
- Nuevo exemplar `acepta_todo_sin_forzar_F2`.

La pregunta de dudas pre-enlace **se confirma y se queda** (era petición suya, cluster D).

## Abierto

- **Re-smoke de Iván** tras la ronda 2.
- **Fix del motor** del cluster E ([[project_motor_bug_captured_lead_name]]) — necesita deploy.
- **Discrepancia de duración**: el copy dice "10-15 min" pero el slug de Calendly del fallback es
  `calendly.com/nanicoach99/30min` (`nani.md:293` vs `:302`). Reconciliar con Nani cuál de las
  dos es la buena antes de cargar.
- Confirmar `tenant_slug` / `trainer` reales antes de `build-coach-v5-seed.mjs`.
