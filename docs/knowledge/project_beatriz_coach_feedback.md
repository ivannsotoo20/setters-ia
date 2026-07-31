---
name: project_beatriz_coach_feedback
description: "Loop del bloque COACH Beatriz Juan (academia/Automatía, madres postparto que han perdido la conexión con su cuerpo). Ronda 1 aplicada 2026-07-28: se le DEVUELVE su bloque de método (qué has probado / qué haces ahora / disponibilidad) que la doctrina §19 le había quitado, se eliminan los casos de éxito, compromiso 0-10 → importancia 0-10, y los apelativos afectivos pasan de prohibidos a permitidos. Recall si vuelve feedback de Beatriz o de cualquier coach de postparto/maternidad."
metadata:
  node_type: memory
  type: project
---

Beatriz Juan = coach de la **academia** (Automatía + n8n, no el SaaS Fyzon). Avatar: madres
de 30-45 que han perdido la conexión con su cuerpo tras la maternidad — culpa por dedicarse
tiempo, agotamiento de postparto, no reconocerse en el espejo. Canal: Instagram, outbound +
inbound. Bloque: [`prompts/coach-engineering/academia/beatriz-juan.md`](../../prompts/coach-engineering/academia/beatriz-juan.md),
formato `<coach_block>` con headers `##` (mismo loop que [[project_alfonso_coach_feedback]] /
[[project_pepe_coach_feedback]]). Despliega Iván a mano en Automatía.

⚠️ **Beatriz existe también en el SaaS y esa versión va por detrás** (descubierto 2026-07-30).
[`prompts/source/coach-v5/beatriz-juan.md`](../../prompts/source/coach-v5/beatriz-juan.md) es el
port a formato `coach_v5` hecho el **2026-07-20** (`sprint: import-cloudchat-beatriz`,
`status: draft`, `tenant_slug` sin asignar) — es decir, **anterior a la ronda 1**. No lleva el
bloque de método que la ronda le devolvió (0 apariciones ahí, 6 en el de academia). Si se seedea
tal cual, se despliega la Beatriz que Rubén ya había corregido. Mapa de los tres coaches que
viven en los dos sistemas: [README de academia](../../prompts/coach-engineering/academia/README.md).

**Ojo con el nombre del fichero de origen.** El bloque llegó como `Downloads/victor_beatriz_coach.rtf`
y el documento de feedback como *"Feedback Beatriz Juan Puñales"*. **Víctor es la pareja de
Beatriz** (confirmado por Iván 2026-07-28) — de ahí el nombre del fichero. La coach y la voz del
bloque son solo Beatriz, en primera persona. Si algún día entra Víctor como coach, es otro
fichero y otro bloque: no mezclar voces.

## Ronda 1 — 2026-07-28 (feedback doc 28/07/26)

Fuente: `Downloads/Feedback Beatriz Juan Puñales.docx.pdf` — 13 páginas, 8 capturas de **una
conversación real completa** (19:08–19:19 con "Laura", lead de dos meses de postparto y en
lactancia) anotadas parte por parte. Baseline: el bloque tal cual estaba desplegado a 28/07,
que hasta esta ronda no estaba versionado en ningún sitio (llegó por RTF).

Beatriz aprueba explícitamente las partes 1, 2 y 3 ("lo hace muy bien, ni veo nada para
cambiar"). Los 8 cambios salen de las partes 4 a 8.

### El cambio de fondo: le habíamos quitado su método y lo ha reclamado

El grande (ella lo titula *"AQUÍ VIENE EL CAMBIO GRANDE"*) es que antes de la visualización
quiere un bloque de preguntas sobre **qué ha intentado antes, qué está haciendo ahora con la
alimentación y la actividad, y qué disponibilidad tiene para entrenar** — con micro-feedback
suyo por el medio ("soy partidaria de una alimentación flexible", "el ejercicio después de ser
mamá es importante a nivel hormonal").

Eso choca de frente con **cuatro puntos de la doctrina universal a la vez**: §11.8 y §11.13
(preguntar "qué has probado" / "qué estás haciendo ahora" son modos de falla), §19 (autopsia
del método prohibida, solo se profundiza en el impacto en presente), §21 (no educar ni opinar
sobre lo que el lead hace mal) y §22 (los criterios de cualificación son una pregunta, no un
tema). Es exactamente el "gate no-método" que a **Frodo** se le quitó el 2026-07-13 porque se
lo marcó Rubén.

**Y aun así se aplica.** El dato que decide es que el bloque anterior lo decía por escrito:
*"eso era la antigua Fase 3 de historial, se elimina como pregunta de pasado"*. O sea, **no
está pidiendo algo nuevo: está reclamando su propio proceso, que nuestra reconciliación
doctrinal le había borrado.** Además lo que pide no es la falla que describe la doctrina:
- No pide autopsia ("por qué no te funcionó"), pide **inventario** ("qué has intentado hacer").
- Su feedback no corrige a la lead, **posiciona su criterio** — que en un avatar cuyo dolor
  literal es *"y también el no saber qué hacer"* es justo lo que construye autoridad y la
  separa del Herbalife y las restrictivas.
- La pregunta de disponibilidad es literalmente la pregunta única que §22 SÍ autoriza.

Se aplicó como **desviación consciente marcada en el bloque** (mismo patrón que la desviación
de embarazo/menor de edad que ya tenía) con **cinco blindajes**: inventario y no autopsia ·
micro-autoridad y no corrección (1 línea, máx 3 en el bloque) · tope duro de 4 preguntas (2
alimentación + 2 ejercicio) · cero diagnóstico y cero métricas (CR4 intacto) · §26 intacto (no
se nombra la videollamada ni el programa dentro del bloque).

**Esto es lo que hay que enseñarle a Rubén antes de desplegar**, porque visto desde fuera parece
una regresión de lo que se corrigió en Frodo. La lectura fina: la prohibición de la doctrina
apunta a la autopsia culpabilizadora y a educar; el inventario + disponibilidad + criterio propio
es otra cosa. Si Rubén lo compra, esto es candidato a **matizar §19** (distinguir *inventario* de
*autopsia*) en vez de mantenerla como prohibición absoluta.

### Los 8 cambios aplicados

| # | Qué pidió Beatriz | Veredicto | Cómo quedó |
|---|---|---|---|
| 1 | Partes 1-3: "lo hace muy bien" | — | Sin tocar |
| 2 | Parte 4: hizo **4 preguntas de "cómo te sientes"**, ahorrarse al menos una si ya hay contexto | Aplicar | Tope binario de **3** preguntas de estado emocional en toda la conversación + orden de sacrificio (cae primero la P3 de F1) + gate: si ya verbalizó 2 elementos emocionales, se omite la siguiente |
| 3 | Parte 5: *"nada de caso de éxito en ningún caso, eliminar totalmente"* | Aplicar | Barrido en **6 sitios**: structural, massage F2, `coach_secondary_links`, `coach_qualification_criteria`, objeción de mala experiencia previa y special_protocols |
| 4 | Parte 6: bloque de método antes de la visualización | Aplicar **blindado** | Nueva **Fase 3-A** con 4 ramas (solo alimentación / solo ejercicio / todo de golpe / no ha probado nada) + los 5 blindajes de arriba |
| 5 | Parte 6: apoyo con autoridad tras "sería increíble" | Aplicar | Literal suyo en 3-B: *"la verdad que sería un gran cambio para ti en todos los sentidos, y como has visto en mi perfil se puede conseguir"* |
| 6 | Parte 6: **quitar la escala de COMPROMISO**, poner escala de **IMPORTANCIA** | Aplicar | Fase 3-C: *"entonces ahora mismo para ti, del 0 al 10 cómo de importante es este cambio para ti??"* + escalera re-mapeada |
| 7 | Parte 7: el Puente, *"más corto, que vaya más al grano"* | Aplicar | Puente de 3 líneas + `me equivoco??`. Fuera "hasta ahora" y "de todo lo que me has contado" |
| 8 | Parte 8: nueva propuesta de videollamada + *"de mañana o de tarde?"* y parar | Aplicar | F5 reescrita con sus literales; la pregunta de franja es un **override acotado de CR5/CR6** |
| 9 | Extra: *"Beatriz utiliza palabras como CORAZÓN, CARIÑO, GUAPA"* | Aplicar (**invierte** la regla actual) | El bloque las tenía **PROHIBIDAS** por escrito. Ahora son banco permitido con topes binarios |

### El detalle que más cambia el bloque: los apelativos

El bloque anterior decía literalmente *"PROHIBIDOS 'cielo', 'amor', 'cariño', 'guapa', 'reina'
(esto separa a Beatriz de otras coaches del avatar)"* — y resulta que Beatriz los usa. La
diferenciación estaba mal inferida. Doctrina §9 (segundo eje) ya avisaba de esto: el registro
afectivo vs profesional **se diseña por el perfil real de la profesional, no se deduce del
avatar**. Es el mismo error de raíz que §11.9 (heredar el registro de otro coach).

Ahora: banco `corazón / cariño / guapa`, máx 1 por mensaje, nunca dos mensajes seguidos, **solo
en mensajes de apoyo — nunca en el mismo mensaje que una pregunta de datos** (ahí suena a
técnica de venta), y no de apertura: se gana cuando la lead ya se ha abierto. Emoji y apelativo
no van juntos. **El banco está cerrado en esos tres** (Iván, 2026-07-28): los puntos
suspensivos del feedback no autorizan a inventar "cielo" ni "reina", y el bloque los veta
explícitamente en el lexicon.

### Hallazgos colaterales de las capturas

- **El mensaje de bienvenida real** (que el bloque tenía como `[PENDIENTE]`) aparece en la
  primera captura: *"Hola [NOMBRE] que tal? soy Beatriz, quería darte la bienvenida
  personalmente / Por curiosidad cuéntame, que te llevo a seguirme, buscas bajar de peso,
  tonificar...?"*. Ya está en `coach_phase_massage_fase0`.
- Literal nuevo para el corpus de voz: *"qué bien!! y enhorabuena por tu bebé 🤗"*.
- La conversación real confirma que el `tema_central` (la culpa) se destapó con la pregunta de
  dos opciones cerradas — que §11.6 desaconseja. Se mantiene como excepción documentada porque
  es la que funcionó.

## Ronda 1.1 — 2026-07-28, tras el primer smoke de Iván en Automatía

Dos conversaciones de prueba (recorrido completo + test aislado del bloque de método). **Lo que
entró bien:** el bloque de método completo y encadenado (inventario → micro-autoridad →
ejercicio → disponibilidad → "con eso es más que suficiente"), cero casos de éxito, la escala de
importancia, el apoyo con autoridad ("como has visto en mi perfil"), y el apelativo usado donde
tocaba ("te entiendo cariño, no reconocerte y encima no saber por dónde empezar es agotador..").

**Cuatro fallos, y el patrón que los une.** Tres de los cuatro son la misma familia: **el modelo
trata los literales como un guion que recita y emite las burbujas en el orden en que están
escritas en el bloque**, no en el orden en que se dicen.

1. **Turno que muere en una afirmación.** Tras el "9" de la escala, el setter cerró con *"me
   encantaría poder ayudarte"* y se quedó esperando. No es una pregunta: la lead no tiene qué
   contestar. En el smoke Iván respondió "genial" por cortesía, pero lo normal es que no
   conteste y ahí se pierde el lead. → Regla binaria nueva en el voiceprint: **todo turno
   termina en pregunta**, salvo `coach_wclose` y el corte de handoff. Y el reconocimiento de la
   escala va pegado al Puente en el MISMO turno.
2. **El Puente salió troceado y en desorden**: tres burbujas, con *"a ver si te he entendido
   bien:"* la ÚLTIMA, así que la lead leyó "me equivoco??" antes que el resumen. → Regla:
   **una sola burbuja, orden inviolable** de las 4 partes.
3. **La validación salió DESPUÉS de la pregunta**, dos veces (*"cuánto tiempo llevas siendo
   mamá??"* antes de *"qué bien!! y enhorabuena por tu bebé 🤗"*, y la pregunta de inventario
   antes del *"te entiendo cariño…"*). **Culpa de mi redacción**: en `fase1` escribí la pregunta
   como opción principal y el reconocimiento como un "sumar antes" al final de la lista, y el
   modelo emitió en el orden en que lo leyó. → Reescrito como dos pasos numerados con el
   reconocimiento primero, + regla binaria de orden dentro del turno.
4. **El literal de la rama D disparado contra una lead que sí había probado cosas.** Había
   listado dietas, batidos y andar; al decir después "nada, no he tenido tiempo", el setter le
   soltó *"claro, después de ser mamá lo primero que desaparece es el tiempo para ti"* —
   contradictorio y con olor a plantilla. Además ese hilo **nunca llegó a preguntar la
   disponibilidad**, que es el dato por el que existe el bloque. → Rama D acotada a "no ha
   nombrado ningún intento", aviso de que los literales son referencia de tono y no guion, y
   **la disponibilidad pasa a ser condición de salida del bloque**.

Aprendizaje de método transferible: **en un bloque con muchos literales, el orden en que están
escritos en el prompt se convierte en el orden en que salen.** Si un literal va antes que otro
en la conversación, tiene que ir antes en el fichero — no basta con describirlo.

## La duda de Beatriz (no es prompt, es sistema)

Literal suyo: *"Y AQUÍ YA SE PARA EL SETTER Y ENTRO YO PARA TERMINAR. **LA DUDA ES CÓMO ME
AVISA CUANDO LLEGUE AQUÍ PARA YO INTERVENIR**"*. Es una pregunta de infraestructura de
Automatía, no de prompt: la contesta Iván. Lo que sí se hizo en el bloque es dejar la causa
identificable — `handoff_cause = "acepta_videollamada"` — para que su aviso pueda distinguir
"ha aceptado la llamada" de un handoff por descualificación.

Decisión de diseño asociada: el handoff se dispara **al enviar** la pregunta de mañana/tarde,
no al recibir la respuesta. Así la IA queda pausada y es Beatriz quien lee la contestación; si
la lead responde antes de que ella entre, el setter no contesta. Es la lectura literal de
*"aquí ya se para el setter"* y evita que la IA improvise una negociación de horario.

## Casos de éxito retirados (por si se recuperan)

Se eliminaron del bloque los 6 casos con matching por keywords. Se registran aquí y **no se
reactivan sin que Beatriz lo pida**:

| Caso | Keywords de la lead | Narrativa |
|---|---|---|
| Noelia | "Herbalife", "batidos", "probé de todo", "es culpa mía" | No es culpa suya, era el método |
| Rosario | "años en esto", "dietas restrictivas", "quiero comer normal" | Permiso de comer sin culpa |
| Soraya | "me abandoné siendo mamá", "invisible", "sin energía", "solo soy mamá" | Cuidarse no es egoísmo |
| Maira | "no como hidratos", "restricción pero nada baja", "estoy rota" | El cuerpo necesita adaptación |
| Gresly | barriga postparto persistente, entrena en casa | Barriga de embarazada resuelta desde casa |
| Aida | vergüenza al exponer el cuerpo, falta de confianza | Recuperó confianza bajando varias tallas |

(Las URLs de los 6 reels de Instagram están en el RTF original `Downloads/victor_beatriz_coach.rtf`.)

## Abierto

- **Confirmar con Rubén** el override del bloque de método antes de desplegar (ver arriba).
- **Mensaje anti-IA** (`coach_identity_notia`). Es lo que responde el setter cuando la lead
  pregunta "¿eres un bot?". **Pendiente heredado, no de esta ronda**: ya venía así en el RTF.
  El bloque lleva un borrador mío ("soy Beatriz de verdad, estoy leyendo tu caso con calma al
  otro lado 🤗") esperando el literal real de Beatriz. Importa porque es el momento de máximo
  riesgo de la conversación: si la frase no suena a ella, confirma la sospecha de la lead.

**Cerrado con Iván el 2026-07-28:** Víctor es la pareja (no un segundo coach) · el banco de
apelativos son solo "corazón", "cariño" y "guapa", cerrado · las ramas 5-7 y 0-4 de la escala
de importancia (Beatriz solo dio el literal del tramo alto; las otras dos se redactaron en esta
ronda y las valida Iván) · el mensaje anti-IA se queda con el borrador provisional de momento,
y se le pregunta a Beatriz por su literal real.
- **Smoke** en Automatía tras desplegar, con foco en: que el bloque de método no se alargue por
  encima de las 4 preguntas, que no se cuele ningún caso de éxito, y que los apelativos no
  aparezcan pegados a preguntas de datos.
