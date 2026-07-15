---
name: project_luis_royan_coach_menopausia
description: "Coach academia (Automatía) del nicho MENOPAUSIA — entrenador Luis Royán, programa Método ETM. Avatar NUEVO (el 4º, no cubierto por la KB). Estado 2026-07-15: diseño cerrado, BLOQUEADO esperando material de voz de Luis. Recall si vuelve Luis Royán o cualquier coach de menopausia."
metadata: 
  node_type: memory
  type: project
  originSessionId: 78a4e02d-8165-4eab-84f8-4bdf8189c376
---

Entrenador nuevo **Luis Royán** (licenciado CAFD + nutrición, 10 años con mujeres en
perimenopausia/menopausia, equipo: 2 coaches + nutricionista farmacéutica PNI + nutricionista;
programa **Método ETM**). Coach de **academia/Automatía** (XML `<coach_block>`, lo despliega Iván),
NO es `coach_v5` del SaaS. Hermano de [[project_alfonso_coach_feedback]],
[[project_roberto_coach_feedback]], [[project_frodo_coach_feedback]], [[project_chema_coach_feedback_loop]].

**Hallazgo mayor — el documento de nichos de Rubén EXISTE:** `Downloads/DIRECTIVAS_OPERATIVAS_POR_NICHO_v1.md`
= 7 nichos × 6 directivas (DN-01 apertura, DN-02 exploración, DN-03 orientación emocional, DN-04
proponer la llamada, DN-05 cualificación, DN-06 cambio-vs-mantenimiento). **Menopausia es el §7** y el
doc lo llama *"el nicho con la orientación emocional más diferenciada"*. Su fuente original:
`Downloads/Analisis_Nicho_Menopausia_Auditoria_17Feb.md` (feedback literal de Rubén a **Aida**, otra
entrenadora de menopausia). Ninguno de los dos está versionado ni en el repo ni en second_brain.

**Menopausia es un AVATAR NUEVO** (el 4º; la KB solo cubre hombres-pérdida-peso,
mujeres-pérdida-peso-nutrición, adultos-ocupados). No es variante del de mujeres: en pérdida de peso
ella sabe qué quiere y no sabe cómo; **en menopausia ni entiende por qué le pasa**. Flujo B del README.

**Precedente arquitectónico = Chema** (dolor crónico, también nicho de PROBLEMA). De él se hereda: el
override explícito del eje objetivo-céntrico ("si no lo anulas, el modelo lo va a buscar igual"), la
claridad como canal separado, el "no es que estén mal, es que…" para no contradecir al médico.

**Decisiones cerradas (2026-07-15, Iván):**
1. Destino **academia/Automatía** (XML full, sin frontmatter, Calendly `calendly.com/royantraining` hardcodeado, Zoom).
2. **El setter ES Luis en 1ª persona** → handoff invisible (§11.10). Su D4 ("handoff si pide hablar con Luis") hay que reformularlo: "¿eres IA?" → protocolo anti-IA; "quiero hablar con una persona" → Tipo D. El equipo se nombra en 1ª persona plural ("mi nutricionista"), nunca "el equipo de Luis".
3. **Apertura por CAMBIOS**, se retira su B6 ("¿qué te cuesta más, el ejercicio o la comida?") — el propio doc de Rubén la marca prohibida para conciencia baja.
4. **El permiso se pide SIEMPRE** en el protocolo de luz (5 pasos de Rubén; descartado el patrón Chema de 2 pasos). Consecuencia resuelta: la dosis pasa de 1 frase a un ciclo de 2-3 turnos → la cuota se reformuló de "1 cada 3-4 msgs" a **máx 2-3 ciclos por conversación** (regla binaria, §7); ciclo completo la 1ª vez, permiso ligero las siguientes.
5. **Se espera al material de voz antes de escribir** (los exemplars enseñan el patrón, §8 — unos provisionales contaminarían el bloque).

**Los 4 choques doctrina-universal vs doctrina-de-nicho y su resolución** (detalle en el diseño):
§21 "no educar" vs "la autoridad se genera dando claridad" → claridad = canal separado, mecanismo no
corrección · gate no-método vs "qué ayuda ha buscado" → **recorrido MÉDICO permitido, autopsia del
método prohibida** (candidato a enmienda de doctrina §19/§11.13) · validación con tope vs "invalidadas
por el sistema médico" → tope CR8 se mantiene, sube la claridad no el eco · **Luis es HOMBRE hablando
a mujeres 40-60** (eje sin precedente: no puede usar la validación mujer-a-mujer de María/Julia/Sandra
ni tiene caso propio → valida por RECONOCIMIENTO PROFESIONAL: "esto me lo cuentan a diario las mujeres
con las que trabajo").

**Punteros:**
- Diseño (10 decisiones, qué/por qué/fuente): `Downloads/diseno-avatar-menopausia-luis-royan.md`
- Preguntas para Luis: `Downloads/preguntas-para-luis-royan.md`
- Formulario relleno: `AppData/Local/Temp/Documentación Avatar c9607123d5c2834bba7981a8d11bc5b1.md`
- Plan: `~/.claude/plans/c-users-sotob-appdata-local-temp-docume-virtual-brooks.md`

**BLOQUEADO en Fase 3** esperando de Luis: (1) su voz — @ Instagram + 3-5 stories + 2-3 frases reales
de DM (su formulario NO pide material de voz, a diferencia del de Chema; solo tengo **una frase** suya,
y es la B6 que retiramos); (2) **las 3-4 explicaciones que "le cambian la cara"** — es el contenido del
canal de claridad y no se puede inventar (terreno clínico); (3) los 2 enlaces de LM; (4) canal/origen;
(5) protocolo de terceros (hija/marido); (6) las 2 verdades de E2 no derivables (miedo a fallar,
dinero) — las otras 4 se derivaron de C2/C3/C4 y van a validar.

Al cerrar → destilar: avatar nuevo `prompts/coach-engineering/avatares/menopausia/` + enmienda de
doctrina (recorrido médico ≠ autopsia del método; claridad como canal separado, hoy solo implícita en
Chema). Baseline de autoría: [[feedback_coach_authoring_baseline]], [[project_coach_authoring_kb]].
