---
name: project_pepe_coach_feedback
description: "Loop del bloque COACH Pepe Jiménez (academia/Automatía, HYROX y rendimiento híbrido — el primer avatar de OBJETIVO puro). Estado tras la ronda 3 (2026-08-01): 2 recursos gratuitos reales (comunidad de WhatsApp como consuelo de todo cierre sin cita + rutina de movilidad), duración 6 meses, parada migrada a manual_attention + skip_reply. Bloqueado: la cifra del 'desde X' del precio y la decisión sobre 'Carlos'. Recall si vuelve feedback de Pepe o entra cualquier coach de rendimiento/competición."
metadata:
  node_type: memory
  type: project
---

Pepe Jiménez = coach de la academia (Automatía, no el SaaS Fyzon). Dietista + entrenador de **HYROX y rendimiento híbrido**; hombres y mujeres de 20-40 que quieren iniciarse o bajar tiempos. Bloque: [`prompts/coach-engineering/academia/pepe.md`](../../prompts/coach-engineering/academia/pepe.md), formato `<coach_block>` con headers `##` (mismo loop que [[project_alfonso_coach_feedback]] / [[project_roberto_coach_feedback]] / [[project_frodo_coach_feedback]]). Despliega Iván a mano en Automatía.

🚨 **Pepe existe también en el SaaS, y esa versión arrastra los dos fallos P0 de abajo**
(descubierto 2026-07-30). [`prompts/source/coach-v5/pepe-jimenez.md`](../../prompts/source/coach-v5/pepe-jimenez.md)
es el port a `coach_v5` del **2026-07-20**, anterior a la ronda 1: dice *"una videollamada tú y
yo"* en 4 sitios (cuando la llamada la atiende su equipo de admisiones) y no lleva la regla de
precio. Y **`schema/v1/seeds/012-coach-v5-pepe-jimenez.sql` está compilado de esa versión** — le
he puesto un aviso en cabecera, pero la deuda real es portar las rondas 1 y 2 al `.md` del SaaS y
regenerar el seed antes de dar de alta el tenant `equipo-pj`. Verificado por grep. Mapa completo:
[README de academia](../../prompts/coach-engineering/academia/README.md).

**Es el primer avatar de OBJETIVO puro del corpus.** No es un avatar de dolor: el driver es el resultado (bajar de la hora, competir, físico híbrido) y el dolor (tibias, rodillas) es un obstáculo hacia la meta, no una herida. Eso cambia dónde está el canal de conexión — ver §RECONOCIMIENTO abajo.

## Ronda 1 — 2026-07-25 (feedback doc 24/07/26: Pepe + informe de su equipo)

Fuente: `Downloads/FEEDBACK - PEPE JIMENEZ.docx.pdf` (5 capturas de conversación real + informe del equipo). Baseline: el bloque desplegado en Automatía a 24/07, que hasta esta ronda no estaba versionado en ningún sitio.

**Los dos fallos que rompían la confianza (P0):**

1. **La llamada NO la atiende Pepe, la atiende su equipo de admisiones.** El bloque decía literalmente "una videollamada tú y yo" y el setter contestó a la pregunta directa del lead que la llamada la hacían "tú y yo directamente". Su equipo lo marcó como riesgo de marca ("puede sentirse engañado cuando descubra que quien le atiende es el equipo"). Vivía en **6 sitios** — identity_role, fase 5, literal F5, exemplar, special_protocols y, el que no era obvio, el **cierre post-agenda de F6** ("prepárate para *contarme*"). Ahora hay REGLA DURA de cabecera + respuesta honesta literal a "¿la llamada es contigo?" (que NO es handoff: se responde y se sigue).
2. **El precio no varía según la persona.** La IA se inventó una lógica de precio a medida ("no es lo mismo alguien que empieza que alguien que ya compite", "no es un paquete cerrado igual para todos"). Falso: hay precios cerrados y **lo único que cambia es el método de pago**. Decisión: las cifras NO entran al prompt (evita la fuga); solo el hecho + el protocolo.

**Conversión (P1):** F5 se reescribió con VALOR (pre-frame de encaje "creo que encajarías bien en el EQUIPO PJ" + beneficio anclado al objetivo del lead **en sus palabras**) y se retiró "sin compromiso / si no es para ti no pasa nada / es gratis" — Pepe: *"si añadimos eso la gente no le va a dar mucho valor"*. Ritmo: gate de descubrimiento de 5 casillas antes de F5, Fast-Track restringido a señal explícita, tope de F2 subido de 3-4 a 5-7 preguntas y tope de 2 propuestas de llamada (llegaba a proponerla **en 6 mensajes** con un lead que dijo estar estancado). Anti-repetición: mandó el cierre post-agenda **dos veces palabra por palabra** — Pepe: *"si hacemos eso sabrá seguro que es una IA"*.

## §RECONOCIMIENTO — el hallazgo transferible de esta ronda

El "no suena a Pepe" del informe tenía un caso concreto detrás. Lead: *"hice 1h02 en dobles, quiero bajarlo de la hora"*. La IA: *"Vamos, 1h02 en dobles y quieres bajar de la hora, ese es un objetivo muy concreto"* — **eco puro** (doctrina §2/§11.1), que Pepe describió como "muy robótica" sin saber que tenía nombre. Su versión: *"Muy toop!! 1h02 es que ya tienes buena base y creando una buena estrategia nutricional y de entrenamiento lo bajamos de la hora seguro 😬"*.

**En un avatar de objetivo, la conexión no se construye empatizando con un dolor: se construye reconociendo lo que el lead YA ha conseguido y proyectando lo que falta.** Movimiento de 3 tiempos: reconocer el logro → leerlo como profesional ("ya tienes buena base") → proyectar en tu terreno (nutrición + planificación). Es la variante de este avatar de la validación, y es también la respuesta operativa a "nutrir la conversación antes de pedir el paso".

Frontera importante: **reconocer ≠ educar** (§21). Se reconoce lo logrado y se proyecta; no se corrige el método ni se le dice qué hace mal. Y la proyección es una lectura de confianza puntual, no una promesa repetida ni un compromiso de plazo (choca de frente con el C3 "no se garantizan cifras" — se resolvió acotándola, no borrándola, porque el literal es suyo).

Candidato a §30 de la [doctrina universal](../../prompts/coach-engineering/doctrina-universal.md) si se confirma con el siguiente coach de rendimiento.

## Decisiones tomadas (Iván, 2026-07-25)

- **§26 vs. Pepe.** Pepe pidió que la objeción de precio nombre la llamada, con matiz fino de artículo: *"una llamada"* si aún no se ha propuesto, *"la llamada"* si ya. Choca con §26 (no nombrarla antes de F5). Compromiso aplicado: **primer toque de precio reconduce sin nombrarla; el segundo cede a su literal con "una llamada"**, marcado en el bloque como excepción única y acotada. Cualquier otra objeción pre-F5 sigue §26 a rajatabla.
- **"lo bajamos de la hora seguro"** se mantiene tal cual (es suyo), acotado a una lectura de confianza no repetible.
- El equipo de admisiones **no se nombra con nombre propio** (existe un closer, Gonzalo Aupi; no se dice).
- Tope de **3 burbujas por turno** (la F5 salía en 4; su versión son 2).

## Ronda 1.1 — 2026-07-25, tras el smoke test de Iván en Automatía

Conversación de prueba completa (12:38–12:50) cubriendo los tests T1-T9. **Lo que entró bien:** el equipo de admisiones (sin un solo "tú y yo" en toda la conversación, y respondiendo honesto a la pregunta directa sin cortar), el precio ("no va por persona, lo que cambia es el método de pago"), el F5 literal con el objetivo interpolado, el ritmo (~15 mensajes hasta la propuesta, frente a los 6 del feedback), la duración con dos respuestas distintas, y **el reconocimiento, que generalizó solo**: tres reconocimientos distintos, ninguno copiado del exemplar.

**Ocho arreglos aplicados** tras el test. Cinco salen de fallos reales de la conversación y **tres son culpa de mi propia redacción de la ronda 1**:

1. **La misma pregunta 4 veces** ("ya has competido en algún HYROX o estás empezando?" en 4 turnos seguidos, cambiando solo el preámbulo). Mi regla decía "mensaje idéntico prohibido" y el modelo no repetía el mensaje, repetía el **núcleo de la pregunta**. Ahora la dimensión 5 de `coach_tone_variety` cubre el núcleo, y `_core` punto 2 añade el protocolo de **pregunta esquivada** (un segundo intento por otro ángulo; a la tercera se para y se nombra).
2. **No filtraba al curioso** (petición de Iván): 3 preguntas de precio + 2 de duración respondidas educadamente y vuelta al guion, sin devolverle nunca la pelota. El protocolo tenía 2 toques y luego saltaba a descualificar; faltaba el del medio. **Toque 3 = cualificar la intención** ("estás pensando en entrar de verdad o es más por curiosidad?"), una sola vez, y la respuesta decide seguir o cerrar. La duración remite al mismo movimiento.
3. **Re-preguntó tras "todo lo que dices"** — mi regla nombraba solo "ambos / los dos" y el modelo no generalizó. Ampliada a todos los englobantes.
4. **La pregunta con menú de 3 opciones cerradas la indujo mi propio texto** ("anclar en algo real del HYROX: las estaciones, los ritmos, la comida"). Reescrito: anclar es nombrar UN escenario y dejarla abierta, nunca listar opciones.
5. **Educó tres veces** ("la carrera es lo que más diferencia marca…", "ese sería el primer paso, marcar una fecha"). Frontera binaria nueva en el voiceprint: **hablar de ÉL sí, explicar el TEMA no** — con las tres frases reales como ❌. Es la tensión viva de este coach: Pepe pide autoridad y el modelo se pasa a explicar mecánica; decisión de Iván fue mantener la versión estricta, revisable si a Pepe le gustan esas frases.
6. **Tic nuevo "Pero dime / Pero cuéntame / Pero oye"** (6 veces), inventado como bisagra de "respondo objeción → vuelvo al guion". Acotado a 1 por conversación en vez de prohibido, porque el "Pero oye, dos años arrastrando eso…" era de los mejores mensajes.
7. **Leyó "no tengo mucho tiempo porque trabajo mucho" como objeción de agenda** y contestó hablando del calendario, en F2. Antes de F5 eso es un dato de su vida (y un perfil que cualifica), no logística.
8. **Nombró la llamada en F2** — pero el lead la había nombrado primero. Caso nuevo: cuando la introduce el lead, se le sigue con naturalidad; §26 prohíbe que la introduzcas TÚ.

## Ronda 1.2 — 2026-07-25, segundo smoke (4 conversaciones)

Probadas 4 conversaciones (curioso del precio / el que sí quiere entrar / el "un poco de todo" / recorrido completo). **El toque 3 funciona clavado** — los tres literales salieron en orden y la pregunta de intención apareció donde tocaba. **El englobante ya no provoca re-pregunta.** Y la cuarta conversación es el nuevo estándar del coach: sin repeticiones, encadenada, tres reconocimientos distintos, un puente que integra nutrición + frustración + competiciones, y dos cosas generadas por el modelo que no están en el prompt (*"Jajaj aceptable es que hay margen ahí 😅"*, espejando la risa del lead).

**El hallazgo de método de esta ronda.** La repetición de la pregunta no se arregló con la regla de la ronda 1.1, y el patrón lo explica todo:

| Conversación | Objeciones de precio | Repeticiones de la pregunta |
|---|---|---|
| A | 3 | **3** |
| B | 2 | **2** |
| C | 0 | 0 |
| D | 0 | 0 |

La repetición **solo aparece cuando hay objeción**: el modelo responde con el literal, tiene que "reconducir al descubrimiento", la conversación no ha avanzado y la única pregunta pendiente es la misma. Mi instrucción decía reconducir con *"[pregunta anclada a su objetivo o a su bloqueo]"* — pero en un lead que solo ha preguntado el precio todavía no hay objetivo ni bloqueo.

> **La lección: donde se da un movimiento POSITIVO con exemplars, el modelo generaliza; donde se da una PROHIBICIÓN, falla.** El reconocimiento (movimiento de 3 tiempos + exemplars) generalizó a marcas que no estaban en el prompt. La regla "no repitas la pregunta" perdió contra la instrucción operativa que le decía qué hacer. Prueba: en la conversación D usó literalmente el exemplar nuevo *"y en carrera, dónde notas que se te va más el tiempo?"* — se lo di como ejemplo, no como prohibición.

Por eso el arreglo es una **escalera de reconducción** (banco ordenado de ángulos, un peldaño por objeción) en vez de otra prohibición. Cambios aplicados:

1. **Escalera de reconducción** en el preámbulo de `<coach_objections>` (aplica a cualquier objeción, no solo precio), referenciada desde `_core` punto 2 y desde el toque 1 del precio.
2. **"es un objetivo muy concreto" vetado en el lexicón.** Reapareció en la conversación B: es la frase exacta que Pepe marcó como robótica, y el contraste solo vetaba la versión larga. Eco disfrazado de halago.
3. **Tope de opciones dentro de una pregunta: máximo 2, nunca 3**, y ninguna en la del bloqueo central. El menú de 3 se había desplazado a otras preguntas ("salís a correr, tienes alguna base o es algo que llevas poco tiempo?"). Las de 2 funcionan y se conservan.
4. **Dos restos de educar** ("la carrera es lo que más echa para atrás…", "ahí puede estar una parte clave") como ❌ nuevos. La frontera de la 1.1 funcionó — ya no salen párrafos didácticos —, solo faltaba cubrir la versión corta.

**Sin verificar todavía:** el cierre del toque 3 cuando el lead responde "es curiosidad" (la conversación A se cortó justo ahí).

## Ronda 1.3 — 2026-07-25, dos correcciones de voz de Iván

1. **Las preguntas no empiezan por "Y".** Encadenar "Y en carrera…", "Y aparte de eso…", "Y cómo te está afectando…" turno tras turno convierte la conversación en un interrogatorio con conector delante. Excepción: el Puente de F4, donde "Y lo que quieres es…" encadena el resumen y no es una pregunta.
   ⚠️ **El "Y" estaba SEMBRADO en 7 sitios del propio prompt**, cuatro de ellos escritos por mí en las rondas 1.1 y 1.2 (el exemplar del anclaje, el ejemplo del englobante, los peldaños 2 y 3 de la escalera). Es el caso Frodo del *"buen objetivo tío"* otra vez: **revisar siempre si el bloque siembra el patrón antes de escribir la regla**, porque la regla sola no gana contra la siembra. Limpiadas las 7.
2. **Máximo 2 turnos seguidos cuya única sustancia sea una pregunta.** Al tercero el mensaje aporta algo antes de preguntar — reconocimiento, observación, complicidad — o no pregunta. Tres seguidas y el lead deja de contarte cosas para contestar por cumplir. Añadidos dos exemplars: el del tercer turno que aporta antes de preguntar, y *"Jajaj aceptable es que hay margen ahí 😅"* — que **generó el propio modelo** en el segundo smoke espejando la risa del lead, y que se siembra para consolidarlo.

## Ronda 2 — 2026-07-28 (feedback 27/07 de Pepe + comentarios de su equipo)

17 cambios aplicados en 4 fases. **Tres de ellos contradicen la ronda 1 o la doctrina universal**, y esa es la noticia de esta ronda:

**1. Pepe pide que la IA CORRIJA al lead — §21 no aplica a este avatar.** Caso: lead dice "corro 2 veces por semana por mi barrio 20-30 min", la IA contesta "dos días por semana ya es una base, no partes de cero" y Pepe marca: *"la persona lo está haciendo mal y la IA valida pero no corrige"*, con su literal: *"Vale ahí ya tenemos un ancla que nos frena, lo ideal es hacer una progresión metiendo días de series, easy runs y/o long runs…"*. Es exactamente lo contrario de la frontera "hablar de él sí, explicar el tema no" que instalamos en la ronda 1.1 — y responde a la pregunta que quedó abierta entonces.
> **Doctrina de este avatar: en un coach de RENDIMIENTO con autoridad técnica, el aporte de criterio ES el producto de la conversación, no una fuga de valor.** §21 (no educar, Rubén) se diseñó sobre avatares de dolor, donde corregir rompe la conexión; aquí la corrección técnica *construye* la conexión porque es lo que el lead vino a buscar. Queda como **excepción documentada de avatar**, con guardarraíles: ancla + dirección genérica, nunca pauta personalizada (sin números, días ni gramos), máx 1 por mensaje, cerrando en pregunta, nunca sobre su cuerpo (CR4) y nunca en tono de reproche.

**2. La fórmula de precio de la ronda 1 no se entiende.** "El precio no va por persona, lo que cambia es el método de pago" — Pepe: *"no está muy bien formulado, no se entiende bien a qué se refiere"*. La versión larga que él aprobó ("el precio es el mismo para todo el mundo, no cambia según tu nivel… lo único que varía es si pagas de una vez o lo fraccionas") pasa a ser la de todos los toques. Lección: **una regla comprimida a una frase se entiende en el prompt pero no en el chat.**

**3. "Perfectamente alcanzable" genera falsas expectativas** — matiza el "lo bajamos de la hora seguro" que él mismo aprobó en la ronda 1. Ahora: se proyecta MARGEN DE MEJORA, nunca la marca concreta en un plazo concreto.

Resto de cambios: no preguntar la fecha de una competición oficial del circuito (es embajador de HYROX, queda como desinformado) sino el día en que compite él; test **anti-invención de biografía** (el setter se inventó que Pepe compitió en Australia porque el lead lo mencionó — hermano del test anti-invención de contenido de [[project_frodo_coach_feedback]]); prohibido *"la llamada no es para contratarte nada"* (es mentira y se nota); validar solo con el dato delante ("eso ya es una marca seria" antes de saber su tiempo); duda de viabilidad → punto de partida en vez de aplaudir la ambición; fin de "depende de tu caso" como comodín (lo genérico se responde: la movilidad son 2-3 días/semana); **bóveda de recursos gratuitos** para leads fríos (links `[PENDIENTE]`); **vía de lead frío recién llegado** donde la llamada NO es el destino (*"¿hasta qué punto interesa llevar a llamada a alguien que acaba de seguirnos, en 10 mensajes?"*); consejo técnico pre-F5 sin escurrirse con "eso lo vemos en la llamada"; puente en 2 burbujas para que no suene a acta; concordancia en 2ª persona; y matiz de la regla del "Y" (prohibido abrir MENSAJE, natural dentro de un mensaje que ya reaccionó).

**Correcciones de Iván sobre la ronda 2 (28/07):** un solo literal de precio, el de Pepe (fuera la fórmula comprimida y mis variantes — seguía sembrada en dos exemplars pese a la prohibición, caso Frodo otra vez); **la duración NO se dice** por chat, ni cifras ni rangos, pese a que su equipo los pedía; el **puente se mantiene** como está (si Pepe quiere otro recap, que proponga uno concreto); y **WhatsApp resuelto como handoff SILENCIOSO** — el lead pide la info por WhatsApp o dice que no puede llamar → la IA **no manda ningún mensaje**, se apaga (Tipo C) y se notifica a Pepe para que lo retome él. Anunciar el traspaso rompería el marco: el lead cree que habla con Pepe, y quien retoma es Pepe.

**Ronda 2.1 — 28/07, tras el smoke de la ronda 2.** Los curiosos del precio y el resto de la conversación quedan validados por Iván ("me ha gustado cómo ha trabajado la conversación, no hace falta tocar nada"). Dos cambios:

1. **NADA de suplementación ni de recomendaciones médicas por chat, ni genéricas.** El setter soltó "cafeína antes de entrenar y carbohidratos de rápida absorción en carrera" cuando el lead insistió con "algo genérico me puedes decir". **El fallo lo indujo mi propia redacción de la ronda 2**: escribí que ante una petición de consejo técnico "la salida es dar criterio general", sin distinguir entre entrenamiento e ingesta. Ahora son dos caminos opuestos: entrenamiento/organización → se da criterio; suplementación/dieta/medicación/lesiones → no se da nada y **se explica el porqué** (no sabes cómo le repercute a esa persona; es responsabilidad, no evasiva de venta). Reforzado en `coach_identity_role`, en los guardarraíles del voiceprint, en el preámbulo de objeciones, en el lexicón (nombres de sustancias vetados) y con un exemplar de la negativa.
   > **La frontera de este avatar queda: se corrige CÓMO entrena, nunca lo que se mete en el cuerpo.**
2. **Banco de correcciones** en `coach_objections_avatar`. La corrección con criterio funcionó ("vale, ahí ya tenemos un ancla que nos frena" — validada por Iván), así que se le da más munición: 4 prácticas mal planteadas típicas del avatar con la frase de Pepe en cada una. Sin números, sin pauta y sin tocar ingesta. Quedan `[PENDIENTE — criterio de Pepe]` las transiciones, la técnica de estaciones concretas y el caso del box de CrossFit que cree que ya prepara HYROX.

**Bloqueado esperando a Pepe:** los 4 links de la bóveda (comunidad, guía de nutrición, vídeo de ejercicios, rutina de movilidad); si existe o no comunidad gratuita (el setter dijo que no y Pepe apunta que sí, que falta el link); **la contradicción del precio** — el feedback 1 dice "2 precios, solo cambia el método de pago" y un comentario del equipo dice "según lo que se quiera tiene un precio y otro" (¿hay más de un producto?); si se admite pasar a WhatsApp cuando el lead no puede hacer llamadas; y la duración del programa, que sigue pendiente desde la ronda 1.

## Ronda 3 — 2026-08-01 (Pepe responde a los 4 puntos abiertos + 2 capturas)

Cierra casi todo lo que quedaba "bloqueado esperando a Pepe" desde la ronda 2.1. Lo que contestó, punto por punto:

**1. Los enlaces. Solo existen DOS, no cuatro.**
- Comunidad gratuita de HYROX (grupo de WhatsApp): `https://chat.whatsapp.com/E8x6IaCCBI93wgLiotuD11?mode=gi_t`. Su instrucción va más allá de "tener el link": *"sería top que se la mandara prácticamente a todos, en especial los que estén más fríos y que no se vayan a cerrar, como al menos ya que no agenda que se meta en el grupo"*. Así que la comunidad deja de ser un recurso de la bóveda y pasa a ser **el consuelo estructural de toda conversación que se cierra sin cita**: regla única en `coach_secondary_links` + puntero desde el preámbulo de `<coach_wclose>` + motivo por motivo. Excepción: menor de edad, que cierra sin enlace.
- Rutina de movilidad: `https://youtu.be/seN76Fg721g`.
- **La guía de nutrición y los vídeos de ejercicios NO EXISTEN** ("no tenemos LM activos con ello"). No basta con borrar las filas: el bloque de la ronda 2 obligaba a no dejar al lead sin nada, así que ahora hay prohibición explícita de nombrarlos o prometerlos, con la comunidad como salida.

**2 y 3. Confirmados sin cambios.** El apagado silencioso ante "cuéntamelo por WhatsApp" ("Perfecto") y el formato del puente ("Está bien"). En el bloque desaparece la nota de decisión abierta del puente: ya no es "lo mantenemos aunque su equipo lo vea artificial", es un formato validado.

**4a. Duración: 6 meses de asesoramiento, y SÍ se dice.** Revierte la decisión de Iván del 28/07 ("la duración no se dice por chat"), que se tomó justo porque Pepe no había contestado. Ya no orbita: es un dato genérico como los 2-3 días de la rutina, así que entra en `_core` punto 7 y sale de la excepción a §26 del precio (que ahora solo cubre PRECIO).

**4b. El precio queda a medias — y es el único bloqueo vivo.** Confirma lo de la ronda 1 (2 precios, solo cambia el método de pago) pero abre algo nuevo: con la financiera de Hotmart podrán fraccionar **hasta en 12 cuotas**, y quiere que la IA dé un **"desde X"** para desactivar la pregunta del precio — *"Podrás acceder al EQUIPO PJ desde x"*. En la captura dice que **aún no tiene la cifra** ("hotmart se está actualizando… en cuanto lo tenga lo pongo"). Decisión: **no se toca el precio esta ronda**. La cifra no se inventa y un hueco marcado dentro del bloque va contra [[feedback_coach_blocks_sin_pendientes]]. Cuando llegue, el cambio es acotado y de una sola pieza: el toque 1 de `coach_objections_price` pasa de "no doy cifras" a dar el "desde X/mes" + el literal del método de pago. **Ojo doctrinal:** hoy el bloque prohíbe cifras por chat en binario; ese "desde" es una excepción de Pepe, no un permiso general, y la financiera no está viva todavía (nada de prometer 12 cuotas hasta que lo esté).

**Lo que traen las capturas y no estaba en el texto.** Pepe propone una bienvenida nueva que **ofrece** la rutina en vez de adjuntarla (*"te gustaría que te la mandara??"*) y pregunta si la IA sabría mandar el enlace. Eso rompe el supuesto de F0, que daba por hecho que lo primero que recibe la IA es la respuesta a "qué te ha hecho seguirme": con la bienvenida nueva lo primero es un "sí" pelado. F0 pasa a describir **dos formas de bienvenida** (presentación / regalo) y F1 deja de asumir el motivo por el que le sigue. El "Y" del método: se sembró exemplar de entrega (enlace + pregunta ligera), no una prohibición.

🚩 **Decisión pendiente de Iván — "Carlos".** Esa misma bienvenida dice *"Activo a Carlos que es mi asistente virtual para que te la mande si la quieres"*. Choca de frente con el diseño entero del coach: **el setter ES Pepe** (`coach_identity_role`), el anti-IA responde *"jajaj que va, soy Pepe"* y el apagado silencioso del WhatsApp se justifica en que "quien retoma ES Pepe, así que no hay nada que anunciar". Si entra Carlos, la autoridad del bloque (el menisco, los 1000 acompañados, el embajador) deja de ser de quien escribe. Recomendación dada a Iván: que Pepe quite esa línea de la bienvenida. No se ha tocado nada del bloque por esto.

**Dos cosas más que entraron aprovechando la ronda:**

1. **Migración a `manual_attention` + `skip_reply`** ([[feedback_coach_parada_manual_attention]]). Pepe estaba en la lista de pendientes y su punto 2 es justo un trigger de parada: aprobar el criterio no sirve de nada si el mecanismo escrito (`handoff_to_human`, Tipo A/B/C/D) no lo consume Automatía. Migrados los 17 puntos de parada del bloque, con el enunciado canónico único en `coach_structural_modifications_handoff` y motivos en snake_case (`prefiere_whatsapp`, `cita_agendada`, `deteccion_ia`, `fallback_calendar`, `atleta_elite_derivar_humano`, `lead_frio_seguimiento`, y los cinco de `coach_wclose`). Efecto colateral bueno: el cierre post-agenda ya no puede duplicarse (era el fallo que Pepe marcó en la ronda 1) porque la IA queda apagada; la regla de "micro-respuesta a los residuales" se sustituye por silencio.
2. **Limpieza de pendientes y andamiaje SaaS** ([[feedback_coach_blocks_sin_pendientes]], que el bloque incumplía desde la ronda 2): fuera los 4 `[PENDIENTE — Pepe]`, el `[PENDIENTE — criterio de Pepe]` de las estaciones (reescrito como regla final de no improvisar criterio), el "Borradores. Modificables" de `coach_wclose`, las dos referencias a `trainer_preferences` y el `{{tracked_calendar_url}}` de F6 — que además **se contradecía con el literal**, donde el Calendly va hardcodeado. En Automatía ese placeholder no lo interpola nadie.

**Dos incoherencias arrastradas, corregidas al escribir la batería de verificación:**

1. `coach_identity_role` y `coach_identity_notia` remitían al **trigger 4** para responder "la llamada es contigo?", cuando ese literal vive en el **trigger 5** (el 4 es el apagado por WhatsApp). Venía de la ronda 2, cuando se insertó el trigger nuevo sin renumerar los punteros. En el peor caso el setter leía la instrucción de apagarse mudo justo donde tenía que responder y seguir.
2. **El precio se contradecía consigo mismo:** el encabezado decía *"protocolo de 2 toques — la segunda respuesta NUNCA repite la primera"* y tres líneas más abajo *"LITERAL ÚNICO… siempre esta explicación, sin versiones propias"*. El encabezado era resto de antes de tu corrección del 28/07 (un solo literal, el de Pepe). Resuelto a favor de tu decisión: **mismo literal en los dos toques, lo que cambia es el peldaño de la escalera** con el que reconduces, y la dimensión 6 de `coach_tone_variety` lleva ahora la excepción explícita. Sin esto, el modelo tenía licencia para reescribir el literal en el segundo toque — que es exactamente lo que Pepe prohibió.

**A vigilar en el smoke** (no es un fallo, es un roce de diseño): el literal de precio acaba en "te parece?" y detrás va la reconducción, así que ese turno lleva dos interrogantes y roza el "una sola pregunta por turno". Si suena a formulario, lo que se toca es el literal — y eso es decisión de Pepe.

## Dónde vive cada cambio dentro del bloque

Primera versión de esta ronda puso 4 "REGLAS DURAS" antes de `<coach_identity>`. **Iván lo rechazó**: el feedback nuevo se traduce a la sección canónica que le toca, no se antepone como capa de conceptos — si no, se salta el protocolo del esquema y el prompt pierde la referencia de dónde vive cada cosa. Destilado a [`formato-saas-coach-v5.md`](../../prompts/coach-engineering/formato-saas-coach-v5.md) §2. Reparto final:

| Cambio | Sección |
|---|---|
| La llamada la atiende el equipo de admisiones (+ prohibiciones binarias) | `coach_identity_role`, con puntero desde `_core` |
| Respuesta a "la llamada es contigo?" | `coach_structural_modifications_handoff` trigger 4 |
| Movimiento de reconocimiento (3 tiempos, anti-eco) | `coach_tone_voiceprint` |
| Reconocimiento como obligación de flujo | `coach_structural_modifications_phases` F2 + casilla 5 de F5 |
| Mensaje idéntico / fórmula repetida prohibidos | `coach_tone_variety` dimensiones 5 y 6 |
| Memoria del hilo (no re-preguntar) + "a ver si te he pillado bien" 1 vez | `coach_structural_modifications_core` |
| Gate de 5 casillas, tope de 2 propuestas, fast-track restringido, F2 a 5-7 preguntas | `coach_structural_modifications_phases` |
| El precio no varía por persona + protocolo de 2 toques | `coach_objections_price` |
| Objeción de horarios | `coach_objections_logistica` (sub-sección nueva) |
| Duración del programa | `coach_program_info` |

El fichero empieza en `<coach_block>` y termina en `</coach_block>`, sin changelog embebido — igual que el resto de coaches de academia, para que sea copy-paste limpio a Automatía. El historial de la ronda es este documento.

## Abierto

- 🔴 **La cifra del "desde X" del precio** (ronda 3, punto 4b). Es lo único que bloquea cerrar la ronda. En cuanto Pepe la mande: toque 1 de `coach_objections_price` + comprobar que la financiera de Hotmart está viva antes de mencionar las 12 cuotas.
- 🔴 **Decisión sobre "Carlos"** en la bienvenida nueva (ronda 3). Hasta que Iván conteste a Pepe, el bloque sigue asumiendo que el setter es Pepe.
- **Corpus de voz real.** El voiceprint está construido sobre el formulario de alta, no sobre cómo escribe. El "no transmite la autoridad de Pepe" del informe no se cierra del todo sin 10-15 mensajes suyos de DM. De esta ronda salieron sus primeros tokens verificados: "Muy toop!!", "minutillos", "Échale un vistazo", el "!!" mucho más frecuente de lo que el bloque permitía y 😊 (que no estaba en su banco).
- **Bug fuera del prompt:** la IA envió *"Sin respuesta."* cuando el lead sí había respondido, y siguió como si nada. Es del pipeline de Automatía (generator/splitter emitiendo un placeholder), no del coach. Sin diagnosticar.
- ~~`{{tracked_calendar_url}}` y `trainer_preferences` en un bloque de academia~~ → resueltos en la ronda 3: eliminados. El Calendly del EQUIPO PJ va literal.
- **Smoke de la ronda 3 sin hacer.** Lo que hay que ver en Automatía: (a) que con la bienvenida del regalo la IA manda el YouTube en su primer turno y sigue conversando en vez de callarse; (b) que la comunidad sale en el último mensaje de un cierre sin cita y NO se repite si ya se mandó antes; (c) que responde "6 meses" sin mandarlo a la llamada; (d) que tras el cierre post-agenda no escribe ni una burbuja más.
