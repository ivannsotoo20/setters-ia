---
name: project_luis_royan_coach_menopausia
description: "Coach academia (Automatía) del nicho MENOPAUSIA — entrenador Luis Royán, programa Método ETM. Avatar NUEVO (el 4º, no cubierto por la KB). Estado 2026-07-31: 5 rondas de feedback, dice que va a PEOR; causa nº1 = se desplegó una copia truncada del bloque. Parche Fase A aplicado, v3 pendiente. Recall si vuelve Luis Royán o cualquier coach de menopausia."
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

## §TRAMPA DE DESPLIEGUE — el bloque se pega SIEMPRE desde el repo (2026-07-31)

**Lo que estaba corriendo en Automatía era una copia truncada.** `Downloads/coach_block__luis_v2.md`
(779 líneas) es el fichero del repo **menos las primeras 589 palabras**: el `## CRITICO`
anti-repetición, el `## MARCO RECTOR` ("no interrogatorio", "profundiza EN ese hilo") y la
`REGLA DURA` de la frontera del permiso. Es el 3% del bloque, pero es el 3% de apertura y es la capa
que gobierna al resto — y contiene literalmente la regla de la que se quejó Luis el 30-jul
(*"muy repetitivo en las preguntas"*, *"muy pesado indagando"*). v1, el bloque que a él le gustaba
más, sí las llevaba.

**Regla dura para todos los coaches de academia: el bloque se copia SIEMPRE desde
`prompts/coach-engineering/academia/<coach>.md`, nunca desde una copia suelta de `Downloads/`.**

## §CRONOLOGÍA REAL DEL FEEDBACK — son CINCO rondas, no dos (corregido 2026-07-31)

El PDF `Downloads/feedabck - luis royan gonzalez.docx.pdf` (26 páginas, la mitad pantallazos)
contiene cinco tandas fechadas, y las **cuatro primeras juzgan el MISMO bloque**:

| Ronda | Fecha | Ítems | Bloque probado |
|---|---|---|---|
| 1 | 22-07 | 8 | v1 |
| 2 | 25-07 | 6 | v1 |
| 3 | 25-07 (2º bloque) | 8 | v1 |
| 4 | 27-07 | 4 | v1 |
| 5 | **30-07** | 3 | **v2** (primera y única prueba de v2) |

`coach_block_luis.md` (22-jul) == `coach_block_luis_v1.md`, byte a byte.

**El corpus de voz de Luis vive HOY en ese PDF.** `Downloads/luis_coach.rtf` ya no está en disco
(verificado 2026-07-31). El PDF contiene ~15 mensajes escritos por él: es más material de voz del
que pedía el cuestionario original. En 4 de las 5 rondas reescribe **la misma explicación
fisiológica** (22-jul FB4 · 25-jul FB3 · 25-jul(2) FB4 · 27-jul FB1) y sus cuatro versiones ya han
convergido → esa explicación se puede fijar como canónica en sus palabras. Su voz real contradice el
bloque en cuatro puntos: abre casi todos los mensajes con un beat ("Te entiendo", "Perfecto",
"Estupendo!") contra el tope CR8; usa 😊 en casi todos; usa el nombre mucho más de 2-3 veces; y sus
mensajes de explicar/validar son de 90-180 palabras contra el tope de "1-3 líneas".

## §DESBLOQUEO — 2026-07-28/29: llegó la voz y el bloque está escrito

⚠️ Documentado a posteriori el 30-jul (reconstruido del bloque, no de un informe de sesión).

Fuentes que desbloquearon la Fase 3: `Downloads/luis_coach.rtf` (28-jul, ya no existe) + el feedback
`Downloads/feedabck - luis royan gonzalez.docx.pdf`. El bloque vive versionado en
[`prompts/coach-engineering/academia/luis-royan.md`](../../prompts/coach-engineering/academia/luis-royan.md)
y **absorbió de golpe las cuatro primeras rondas** (lo que la nota original llamaba "2 rondas").

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

## §RONDA 5 (30-jul) y PARCHE (2026-07-31)

Luis dice que ve las conversaciones **peor que antes**. Cuatro causas, por peso: (1) el despliegue
truncado de arriba; (2) **le quitamos cuatro movimientos y solo le añadimos prohibiciones** — de v1 a
v2: +73% de palabras, "PROHIBIDO" ×2,3, ⛔ ×10, ⚠️ ×4,5, y a la vez fuera el recorrido médico, el
paso de abrir la puerta, el reconocimiento profesional y las opciones. Sin jugadas el modelo orbita
la última palabra de la lead (cinco turnos sobre "la grasa" el 30-jul); (3) v2 **bolteó los pasos de
permiso de Luis (5a/5b/5c) encima del motor de descubrimiento de v1** sin quitar nada, así que ahora
interroga *y* pide permiso, y el camino a la llamada es más largo; (4) el déficit de input de origen.

**Lección general (candidata a doctrina §30): cuando quitas una prohibición hay que devolver una
jugada.** Cada prohibición retira un movimiento; si no lo sustituyes, la conversación se estrecha.

**Parche aplicado (Fase A)** sobre `academia/luis-royan.md`:
- **Candado de género** en `coach_identity_role`. Bug real: el setter escribió *"Encantad**a** de
  tenerte por aquí"*. Luis no lo marcó y es lo más grave del documento.
- El exemplar `objetivo_ya_declarado_en_la_bienvenida_F1` **contradecía su propia regla** (repreguntaba
  lo ya dicho en la bienvenida). Los exemplars enseñan el patrón (§8), así que ganaba el exemplar:
  era la causa exacta del FB1 del 30-jul. Reescrito para entrar por TIEMPO o DÍA A DÍA.
- **"tú" huérfano** retirado de las aperturas sin contraste (solo se queda donde hay un segundo sujeto).
- **HUECO del canal de claridad restaurado, desmedicalizado**: por defecto en afirmación ("y es de lo
  que menos se explica en esta etapa"), y UNA vez en pregunta ("y esto te lo ha llegado a explicar
  alguien?") si ella acaba de verbalizar confusión. Se pregunta si se lo han EXPLICADO, nunca QUIÉN →
  no viola el gate no-médico. Recupera el paso 2 de DN-03 de Rubén que la ronda 2 había borrado.
- **Regla de momento de la pregunta de atribución**: nunca contestando a una pregunta directa de ella,
  nunca en el mismo turno que una dosis de claridad, una sola vez.
- **RESCATE DEL MONOSÍLABO**: vuelve el binario de Luis ("el ejercicio o la comida?"), pero nunca como
  apertura — solo tras una abierta y una profundización que devuelvan monosílabos, una vez.

⚠️ **Los dos overrides de nicho (hueco desmedicalizado + binario recolocado) hay que enseñárselos a
Rubén**, igual que el override de §19 de Beatriz: DN-01 prohíbe el binario y DN-02/DN-03 dan por
supuesto el recorrido médico.

**Fase B (v3) aplicada 2026-07-31.** Reestructuración, cero reglas perdidas (auditadas una a una):
- **`<coach_precheck priority="highest">` con R1-R8**, definidas UNA vez y referenciadas por ID en el
  resto del bloque. Antes cada prohibición estaba re-enunciada 5-7 veces (el colectivo en 7 sitios, el
  gate no-médico en 7 — y v2 dedicaba 38 líneas al médico, más que v1, con el médico ya prohibido).
- **`<coach_conversacion_ejemplo>`: UNA conversación dorada** de 14 turnos con la etiqueta de movimiento
  en cada uno. Sustituye a los exemplars sueltos como pieza principal de enseñanza, porque el fallo de
  este coach ocurre ENTRE turnos y ningún ejemplo de una línea puede enseñar "no orbites la misma
  palabra cinco veces". Cierra con las 5 cosas que demuestra, incluida la regla de output **ninguna
  palabra suya en más de 2 preguntas**.
- **`<coach_movimientos>` M1-M6** (profundizar · recorrido temporal · barrido lateral · claridad ·
  impacto · atribución) + **regla binaria: el mismo TIPO de movimiento no se usa dos turnos seguidos**.
  Es el antídoto directo del "muy pesado indagando": la cura no es prohibir repetir, es tener de dónde
  elegir.
- **`<coach_tone_beats>`**: banco de 10 aperturas rotando. Luis abre casi todos sus mensajes con un beat
  ("Te entiendo", "Perfecto", "Estupendo!") y el tope CR8 se lo estaba suprimiendo; permitirlo sin banco
  produce la muletilla repetida, que es el tell nº1. Banco + no repetir en ventana de 3 resuelve las dos.
- **Longitud por FUNCIÓN** en vez del "1-3 líneas" global: preguntar/proponer 1-2 líneas; validar/explicar
  hasta ~100 palabras. Sale de sus propias reescrituras: llama "larga" a una explicación nuestra de 85
  palabras y la sustituye por una de 100, y "muy venta" a un mensaje de 110 que reemplaza por 245. Lo que
  él llama largo no es longitud, es densidad de intención de venta.
- **Cadencia de emojis cerrada** con la evidencia de su escritura (cierra el `[PENDIENTE]` de v2 sin
  preguntarle) · **preámbulo dentro del XML** como `<coach_marco_rector priority="highest">`, para que no
  se pueda volver a perder al copiar-pegar · tronco común del handler de precio (estaba 4 veces).

**Resultado medido**: 21.389 → **16.974 palabras**. Densidad de prohibiciones 1 cada 265 palabras →
1 cada 339 (−28%). ⚠️ **El objetivo del plan era ≤14.000 y no se alcanzó**: la estimación se hizo antes
de saber que la Fase A añadiría ~2.300 palabras necesarias (candado de género, rescate, hueco, regla de
momento, migración entera del mecanismo de parada). Bajar de 17k exigía recortar reglas, no duplicación.

**Decisión NO aplicada, pendiente de compuerta**: el matiz del colectivo (prohibido como FUENTE de
autoridad, permitido como DESCRIPCIÓN dentro de una explicación — Luis lo usa así en 3 de sus propias
reescrituras). R2 se mantiene absoluto porque revierte algo que él pidió expresamente: se le pregunta
antes de tocarlo.

**Pendiente de proceso ★**: en 26 páginas de feedback **no hay ni un tachado ni un 👉**, cuando el
propio protocolo del documento los exige. Hemos aplicado ~20 ítems, rechazado ~4 y matizado ~4, y
desde su silla todo se ve igual — por eso re-pide cosas y concluye que va a peor. **El feedback vuelve
SIEMPRE marcado ítem a ítem.** Aplica a todos los loops de coach.

**Ítems suyos que NO se aplican, y hay que decírselo con el motivo**: *"¿qué has probado hasta ahora?"*
(rompe el gate no-método y su propia frase rectora) · *"¿qué te haría ilusión conseguir en 2-3 meses?"*
(objetivo + proyección, prohibidos por DN-02) · el binario *"¿invertir en algo que no funcione o seguir
igual?"* (cierre disfrazado de pregunta, y llega cuando ella se está encogiendo).

**Bug de motor, no de prompt**: el 25-jul el setter repitió un mensaje literal tras un handoff Tipo D
("se queda en bucle"). El handoff no pausa la IA en Automatía. Ningún cambio de prompt lo arregla.

Mensaje redactado para Luis + análisis ítem a ítem: `~/.claude/plans/c-users-sotob-downloads-feedabck-luis-r-expressive-pixel.md`.

**Abierto**: la **cadencia exacta de emojis**. El tope del diseño (3-4 en toda la conversación)
resultó incumplible — solo los literales de fase gastan 7-9 — así que se ajustó al alza porque
Luis usa emoji en casi cada mensaje que escribe de su puño y letra, pero queda pendiente
confirmarlo con él (pregunta 5 del informe de la ronda 2). Sin smoke documentado y **sin destilar
todavía** el avatar nuevo a `prompts/coach-engineering/avatares/menopausia/`.

Al cerrar → destilar: avatar nuevo `prompts/coach-engineering/avatares/menopausia/` + enmienda de
doctrina (recorrido médico ≠ autopsia del método; claridad como canal separado, hoy solo implícita en
Chema). Baseline de autoría: [[feedback_coach_authoring_baseline]], [[project_coach_authoring_kb]].
