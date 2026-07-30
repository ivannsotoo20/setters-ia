---
name: project_nani_coach_feedback
description: "Loop del bloque COACH Nani (coach_v5 del repo Fyzon; mujeres, hinchazón/pérdida de peso, programa 'Confía en Ti'). 4º REGISTRO del avatar mujeres: HOMBRE experto no-afectivo (firma 'señorita' + reconocimiento experto). 3 rondas aplicadas (23 y 24 de julio) + validación del setter en prueba real. Recall si vuelve Nani."
metadata:
  node_type: memory
  type: project
---

Coach **Nani** (Abderrazak Nani) — `coach_v5` del repo Fyzon (NO academia/Automatía; se carga
como bloque `coach_v5` en el SaaS). Es de los pocos loops de coach que corre sobre este repo:
su bloque lleva frontmatter y `{{tracked_calendar_url}}`, y se carga con
`build-coach-v5-seed.mjs` → MCP.

Avatar mujeres-pérdida-peso/nutrición, pero con un **registro NUEVO (el 4º del avatar)**: HOMBRE
entrenando a MUJERES, cercano-PROFESIONAL con punto simpático y autoridad experta sobre el cuerpo
de la mujer (hinchazón, ciclo). NO es el afectivo de María ("cielo/amor" prohibidos; veta
"guapa"), ni Julia (profesional-sobrio), ni Sandra (gamberro). Su firma: "señorita" +
reconocimiento experto ("eso lo veo cada semana"). Programa "Confía en Ti" (3 meses, 3 fases:
quitar hinchazón → entreno de menos a más → pérdida 6-12 kg). Diferencial: adaptado al cuerpo de
la mujer; "la hinchazón es la señal de que algo no va bien, no estético".

**Bloque:** [`prompts/source/coach-v5/nani.md`](../../prompts/source/coach-v5/nani.md) (status
draft, ~55 k chars). NO cargado (tenant `nani` sin alta). Fuentes del feedback en `Downloads/`:
formulario `setter_nani.pdf` + 3 conversaciones (`SETTER IA CONVERSACION 1/2`, `setter ia -
inbound`) para la ronda 1, y el PDF `outbound y encuesta setter actualizado` para las rondas 2-3.

**4 desviaciones vs la plantilla del avatar por defecto:** (1) registro no-afectivo experto;
(2) cierre por FLUJO DE CALENDARIO (Calendly propio + Zoom que da el propio Nani, NO handoff a
Closer como María); (3) SIN lead magnet (F1 conexión pura); (4) casos especiales de HINCHAZÓN,
no médicos (no trabaja patologías).

## Ronda 1 — 2026-07-23 (3 conversaciones reales anotadas por Nani)

Aplicada en 4 bloques:

- **A · Ritmo/descubrimiento:** el fallo nº1 era ir "a cuchillo". F1 ya no dispara la situación
  (1-2 turnos de conexión antes). F2 con la estructura de Nani (situación actual/deseada/
  obstáculos/intentos previos/solución percibida) + MÍN 2 preguntas por situación clave,
  profundizando en el impacto emocional (**reemplaza el anti-drilling** "acepta y avanza"). No
  saltar de tema, no re-preguntar el mismo dato, no pivotar mecánicamente a hinchazón, no forzar
  a elegir hinchazón vs peso. F3 sin presuponer compra ("por qué ahora" fuera).
- **B · Ofrecer ayuda ≠ agendar:** F4 resumen sin correr; F5 en dos movimientos separados
  (ofrecer ayuda ligada a su necesidad → luego proponer la llamada).
- **C · Objeciones:** precio con el reencuadre de Nani (fuera el seco "depende del caso");
  objeción presencial-vs-online nueva (explorar primero + flexibilidad + corrección online);
  reabrir ante re-interés.
- **D · Voz:** "maravilloso", "muchas gracias, me ayuda saberlo", y "lo entiendo perfectamente"
  PERMITIDO (a Nani le gusta rematando una empatía real).

**Decisiones D1-D4 (validadas por Iván):** D1 intentos previos ligero/emocional (1 pincelada,
respeta el Core fase2 "máx 1 pregunta breve del pasado", sin autopsia del método); D2 profundizar
en el dolor que ella trae sin pescar síntomas mecánicamente (ampliar solo si el problema es pobre);
D3 → **REVERTIDA** (ver garantía); D4 manda Nani sobre la doctrina academia §19-§29, salvo las
CR1-CR12 del Core.

**GARANTÍA de devolución — resuelta:** SÍ se dice, pero **SOLO como ÚLTIMO RECURSO en F5+**
(cuando ya se propuso la videollamada y la lead se resiste a agendar; "la última bala para salvar
la llamada"). NUNCA de apertura ni en descubrimiento (queda raro y presupone). Reversión de riesgo
por RESULTADOS ("si aplicas y no consigues tu objetivo, te devuelvo el dinero"), NUNCA una cifra
(CR2). Vive en `coach_structural_modifications_phases` Fase 5; el reencuadre presencial NO la usa.

**Validación del setter (prueba real de Iván):** veredicto = funciona correctamente y con fidelidad
alta. Clava F1 sin cuchillo, profundización emocional, reconocimiento experto sin diagnosticar,
empatía ante evento vital, precio con su reencuadre, presencial explorando primero, reabrir, y —lo
más difícil— cierre digno cuando la lead no encaja ("me veo bien, puedo yo sola") sin forzar. Gaps
corregidos tras la prueba: la garantía salía demasiado pronto (→ gateada a F5+) y se coló "de
verdad" una vez (veto reforzado; candidato a `forbiddenPhrases`/V17 al dar de alta el tenant).

## Ronda 2 — 2026-07-24 (PDF "outbound y encuesta setter actualizado")

Aplicada con criterio propio tras análisis adversarial, agrupada en 5 clusters:

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

## Ronda 3 — 2026-07-24 (tras el smoke de Iván)

El smoke validó F1-secuencia, empatía por valencia, propuesta de F5 e invitar-dudas. Apareció un
fallo nuevo en **cualificación (F2)**: el setter recorría la lista de 5 situaciones como un
guion — (1) forzaba a elegir/rankear "qué pesa más" entre hinchazón y espejo, repetido; (2)
re-preguntaba "qué te falta para empezar" cuando ella ya había dicho "quiero una guía".

Es el efecto colateral del bloque A de la ronda 1: el "MÍN 2 preguntas por situación clave" se
convirtió en formulario. Aplicado en F2:
- Las 5 situaciones son **checklist, NO guion**.
- Prohibido "qué pesa más" / "si tuvieras que elegir" / listar opciones.
- Prioridad solo como "a qué le das más importancia", **máx 1 vez** (a veces ni eso).
- La solución percibida **se salta** si ya la dio.
- Profundidad = impacto emocional, **no** número de preguntas (ser directo cuando el objetivo ya
  está claro).
- Quitado el "OVERRIDE ~8 mensajes".
- Nuevo exemplar `acepta_todo_sin_forzar_F2`.

La pregunta de dudas pre-enlace **se confirma y se queda** (era petición suya, cluster D).

## Aprendizajes

**De FORMATO (directiva Iván):** los bloques coach son producción que ven otros profesionales →
quedan LIMPIOS y terminados, cero placeholders/pendientes/decisiones/BORRADOR dentro del
`<coach_block>`. Ver [[feedback_coach_blocks_sin_pendientes]]. El bloque de Nani se reescribió
limpio por esto.

**De AVATAR, pendiente de destilar al cerrar** (no antes, Nani no está validado en producción):
el 4º registro "hombre experto no-afectivo, conexión por autoridad sobre el cuerpo femenino" →
candidato a nota P en
`prompts/coach-engineering/avatares/mujeres-perdida-peso-nutricion/principios.md`.

## Abierto

- **Re-smoke de Iván** tras la ronda 3.
- **Alta del tenant `nani`** antes del seed, y confirmar `tenant_slug` / `trainer` reales antes de
  correr `build-coach-v5-seed.mjs`.
- **Duración de la llamada**: el copy dice "10-15 min" pero el slug del Calendly del fallback es
  `calendly.com/nanicoach99/30min` (`nani.md:293` vs `:302`); en la ronda 1 ya se apuntó la duda
  `/30min` vs ~1 h. Reconciliar con Nani antes de cargar.
- **Fix del motor** del cluster E ([[project_motor_bug_captured_lead_name]]) — necesita deploy.
- Confirmar con Nani el "¿cuántos kilos?" (lo usa a veces; la regla no-báscula es solo para la
  apertura), el tratamiento tú/"señorita" y la bienvenida definitiva.
- Seguimientos en audio → sistema de followups, no el bloque. Más DMs reales para el test de
  indistinguibilidad.

Relacionado: [[project_coach_authoring_kb]], [[reference_coach_authoring_system]],
[[feedback_coach_authoring_baseline]], [[feedback_coach_blocks_sin_pendientes]].
