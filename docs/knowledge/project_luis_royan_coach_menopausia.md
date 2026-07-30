---
name: project_luis_royan_coach_menopausia
description: "Coach academia (Automatía) del nicho MENOPAUSIA — entrenador Luis Royán, programa Método ETM. Avatar NUEVO (el 4º, no cubierto por la KB). Estado 2026-07-29: DESBLOQUEADO — llegó su voz, el bloque está escrito y lleva 2 rondas de feedback. Recall si vuelve Luis Royán o cualquier coach de menopausia."
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

**Estuvo BLOQUEADO en Fase 3 hasta el 2026-07-28** (resuelto — ver §DESBLOQUEO abajo), esperando de Luis: (1) su voz — @ Instagram + 3-5 stories + 2-3 frases reales
de DM (su formulario NO pide material de voz, a diferencia del de Chema; solo tengo **una frase** suya,
y es la B6 que retiramos); (2) **las 3-4 explicaciones que "le cambian la cara"** — es el contenido del
canal de claridad y no se puede inventar (terreno clínico); (3) los 2 enlaces de LM; (4) canal/origen;
(5) protocolo de terceros (hija/marido); (6) las 2 verdades de E2 no derivables (miedo a fallar,
dinero) — las otras 4 se derivaron de C2/C3/C4 y van a validar.

## §DESBLOQUEO — 2026-07-28/29: llegó la voz y el bloque está escrito

⚠️ Documentado a posteriori el 30-jul (reconstruido del bloque, no de un informe de sesión).

Fuentes que desbloquearon la Fase 3: `Downloads/luis_coach.rtf` (28-jul) + el feedback
`Downloads/feedabck - luis royan gonzalez.docx.pdf` (28-jul). El bloque vive versionado en
[`prompts/coach-engineering/academia/luis-royan.md`](../../prompts/coach-engineering/academia/luis-royan.md)
(~796 líneas) y **lleva ya 2 rondas de feedback aplicadas**.

**La corrección que tumba una decisión del diseño.** El diseño de julio daba por hecho que Luis,
siendo hombre, validaría por **reconocimiento profesional** — literalmente *"esto me lo cuentan a
diario las mujeres con las que trabajo"*. La ronda 2 **retiró esa frase y todas sus hermanas**
("no eres la única", "lo veo constantemente", "me lo cuentan"): comparan a la lead con otras
mujeres y **la protagonista es ella**. Hoy hay una regla binaria de **cero colectivo de otras
mujeres** — si un mensaje mete un grupo de mujeres como sujeto o como fuente, se reescribe en
impersonal. Lo único permitido en 1ª persona es su equipo ("lo vemos entre mi nutricionista y yo").

En su lugar, **dos canales de validación con desempate binario**:
- **Canal 1 — normalización por la ETAPA**, solo para el cambio físico (peso, energía, descanso,
  sofocos, hinchazón, fuerza). Banco de **4 moldes** (frecuencia / encaje / la etapa como sujeto /
  temporal) que se rotan **de molde, no de sinónimo**; el molde 1 no se usa más de dos veces en
  toda la conversación.
- **Canal 2 — reconocimiento de lo que pesa**, cuando ella verbaliza carga ("llevo un año fatal",
  "no puedo más").
- **Desempate**: si hay carga, manda el canal 2 aunque el mismo mensaje traiga también un cambio
  físico. El mensaje mixto es el caso más frecuente de este nicho, así que la regla se resuelve
  **antes** de escribir.

**La otra regla dura del bloque: la frontera es el PERMISO, no la propuesta.** En ningún mensaje
anterior al "sí" de la lead al permiso de F5 se escribe "videollamada", "llamada", "sesión",
"valoración", "Zoom", "el programa" ni "Método ETM" — **tampoco al responder una objeción**.
Está implementado como **3 zonas**: zona 1 (F0→F4) no nombra nada; zona 2 (tras su sí, durante
5b) puede contar **cómo lo enfocaría él** — el porqué, los tres pilares, el acompañamiento —
pero siguen prohibidos el nombre del método, el precio, la duración, el formato y cualquier pauta
personalizada; el cómo operativo se reserva para la llamada. Si una objeción llega antes, se
reencuadra y se reconduce al descubrimiento **sin nombrar la llamada**.

Confirmado en el bloque, tal como se diseñó: el setter **ES Luis en 1ª persona** → handoff
invisible, con el D4 reformulado ("¿eres una IA?" → protocolo anti-IA; "quiero hablar con una
persona" → handoff Tipo D, sin negar nada); apertura por cambios; gate no-método **y** gate
no-médico; el nombre de la lead **nunca se pregunta**.

**Abierto**: la **cadencia exacta de emojis**. El tope del diseño (3-4 en toda la conversación)
resultó incumplible — solo los literales de fase gastan 7-9 — así que se ajustó al alza porque
Luis usa emoji en casi cada mensaje que escribe de su puño y letra, pero queda pendiente
confirmarlo con él (pregunta 5 del informe de la ronda 2). Sin smoke documentado y **sin destilar
todavía** el avatar nuevo a `prompts/coach-engineering/avatares/menopausia/`.

Al cerrar → destilar: avatar nuevo `prompts/coach-engineering/avatares/menopausia/` + enmienda de
doctrina (recorrido médico ≠ autopsia del método; claridad como canal separado, hoy solo implícita en
Chema). Baseline de autoría: [[feedback_coach_authoring_baseline]], [[project_coach_authoring_kb]].
