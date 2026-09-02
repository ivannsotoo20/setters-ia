---
name: project_pepe_coach_feedback
description: "Loop del bloque COACH Pepe Jiménez (academia/Automatía, HYROX y rendimiento híbrido — el primer avatar de OBJETIVO puro). Estado tras la ronda 6 (2026-08-13): la ESCALERA DEL 'VOY SOLO' (el 'lo intento por mi cuenta' deja de cerrar la conversación y pasa a trabajarse subiendo el nivel de consciencia) + cierre post-agenda literal único donde el que gestiona con el equipo es la IA, no el lead. Antes, ronda 4.1: precio 'desde 110€/mes', bienvenida en 3 mensajes, guion largo prohibido, 'el ancla' retirado. Hallazgos transferibles: las reglas que viven solo en la doctrina universal NO llegan al prompt, y las copias de Downloads se regeneran, nunca se editan a mano. Recall si vuelve feedback de Pepe o entra cualquier coach de rendimiento/competición."
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

🚩 **Decisión abierta — "Carlos" y el AVISO DE IA. No es un tema de Pepe: es de plataforma.**

Esa misma bienvenida dice *"Activo a Carlos que es mi asistente virtual para que te la mande si la quieres"*, y choca de frente con el diseño del coach: **el setter ES Pepe** (`coach_identity_role`), el anti-IA responde *"jajaj que va, soy Pepe"* y el apagado mudo del WhatsApp se justifica en que "quien retoma ES Pepe, así que no hay nada que anunciar".

Mi primera lectura fue que Pepe se salía del guion y había que pedirle que quitara la línea. **Era la lectura equivocada.** El 01-08, un smoke en el simulador devolvió *"Buenas! Soy el asistente virtual de Pepe Jiménez 🧡"* — frase que no está en el bloque (que la prohíbe en tres sitios) y con un corazón, que el banco de emojis veta. Iván localizó el origen: **un toggle de Automatía, "AVISO DE IA"**, que al activarse:

1. hace que **el primer mensaje anuncie que es un asistente virtual**, con nombre propio (el preview de la plataforma es *"Hola! Soy Ana, la asistente virtual de Programa X"*), con el término configurable entre "asistente virtual" / "IA" / "setter virtual";
2. y, si el lead pregunta si habla con una persona, **manda la conversación a atención manual sin que la IA conteste**.

Consecuencias, y no son de Pepe sino de **los 10 bloques de academia**:

- Con el toggle ON, **`coach_identity_notia` es código muerto en todos**: el toggle intercepta la pregunta antes de que el coach pueda responder su literal ("jajaj que va, soy Pepe", "soy Cristina", "Soy Miguel", y el "NO eres una asistente virtual ni una IA, eres 100% Alex" de Alex).
- La autoridad en primera persona del bloque de Pepe (el menisco, "yo también me estanqué", los 1000 acompañados) queda montada encima de una presentación que dice que es un asistente. Es lo más caro de perder: costó dos rondas construirlo (§RECONOCIMIENTO).
- El apagado mudo del WhatsApp deja de tener sentido: si el lead sabe que habla con un asistente, el traspaso hay que anunciarlo.
- **El "Carlos" de Pepe encaja con el toggle**, no contra él: es el nombre propio que la opción pide.

**Estado: congelado por Iván (01-08). Nada tocado — ni bloque, ni config, ni mensaje a Pepe.** Se decide en reunión el lunes 03-08. La decisión real es de plataforma (toggle ON u OFF, y para todos), no un parche en el bloque de Pepe. Para esa reunión conviene tener leído el aviso plegado *"Antes de desactivarlo, lee esto"*, que probablemente sea el motivo de cumplimiento por el que existe la opción.

**Dos cosas más que entraron aprovechando la ronda:**

1. **Migración a `manual_attention` + `skip_reply`** ([[feedback_coach_parada_manual_attention]]). Pepe estaba en la lista de pendientes y su punto 2 es justo un trigger de parada: aprobar el criterio no sirve de nada si el mecanismo escrito (`handoff_to_human`, Tipo A/B/C/D) no lo consume Automatía. Migrados los 17 puntos de parada del bloque, con el enunciado canónico único en `coach_structural_modifications_handoff` y motivos en snake_case (`prefiere_whatsapp`, `cita_agendada`, `deteccion_ia`, `fallback_calendar`, `atleta_elite_derivar_humano`, `lead_frio_seguimiento`, y los cinco de `coach_wclose`). Efecto colateral bueno: el cierre post-agenda ya no puede duplicarse (era el fallo que Pepe marcó en la ronda 1) porque la IA queda apagada; la regla de "micro-respuesta a los residuales" se sustituye por silencio.
2. **Limpieza de pendientes y andamiaje SaaS** ([[feedback_coach_blocks_sin_pendientes]], que el bloque incumplía desde la ronda 2): fuera los 4 `[PENDIENTE — Pepe]`, el `[PENDIENTE — criterio de Pepe]` de las estaciones (reescrito como regla final de no improvisar criterio), el "Borradores. Modificables" de `coach_wclose`, las dos referencias a `trainer_preferences` y el `{{tracked_calendar_url}}` de F6 — que además **se contradecía con el literal**, donde el Calendly va hardcodeado. En Automatía ese placeholder no lo interpola nadie.

**Dos incoherencias arrastradas, corregidas al escribir la batería de verificación:**

1. `coach_identity_role` y `coach_identity_notia` remitían al **trigger 4** para responder "la llamada es contigo?", cuando ese literal vive en el **trigger 5** (el 4 es el apagado por WhatsApp). Venía de la ronda 2, cuando se insertó el trigger nuevo sin renumerar los punteros. En el peor caso el setter leía la instrucción de apagarse mudo justo donde tenía que responder y seguir.
2. **El precio se contradecía consigo mismo:** el encabezado decía *"protocolo de 2 toques — la segunda respuesta NUNCA repite la primera"* y tres líneas más abajo *"LITERAL ÚNICO… siempre esta explicación, sin versiones propias"*. El encabezado era resto de antes de tu corrección del 28/07 (un solo literal, el de Pepe). Resuelto a favor de tu decisión: **mismo literal en los dos toques, lo que cambia es el peldaño de la escalera** con el que reconduces, y la dimensión 6 de `coach_tone_variety` lleva ahora la excepción explícita. Sin esto, el modelo tenía licencia para reescribir el literal en el segundo toque — que es exactamente lo que Pepe prohibió.

**A vigilar en el smoke** (no es un fallo, es un roce de diseño): el literal de precio acaba en "te parece?" y detrás va la reconducción, así que ese turno lleva dos interrogantes y roza el "una sola pregunta por turno". Si suena a formulario, lo que se toca es el literal — y eso es decisión de Pepe.

## Ronda 4 — 2026-08-03 (Pepe: precio con cifra + la entrega del LM "no se parece a mí")

Ronda corta y de alto valor: **desbloquea el 🔴 del precio** que llevaba abierto desde la ronda 3 y corrige el primer mensaje que ve el lead.

**1. El precio ya tiene cifra: "desde 110€ al mes".** Su instrucción es de matiz, no de volantazo: *"quiero que siga igual, que trate de evitarlo, pero que si la persona insiste diga que puede unirse al EQUIPO PJ desde 110€ al mes"*. Y añade que el fraccionado a 12 meses *"no hace falta que lo diga"*.

Dónde entra fue la única decisión fina. La ronda 3 había anticipado "toque 1", pero su frase separa los dos movimientos con claridad — *evitar* es el toque 1, *insistir* es el toque 2 — así que el protocolo pasa de **2 toques + cualificación** a **3 movimientos distintos**: evitar (literal 27/07) → dar el "desde" (literal nuevo) → cualificar la intención (sin cambios). Efecto colateral bueno: el toque 2 ya no repite al 1, así que **desaparece la excepción a la regla de no repetir fórmula** que tuvimos que escribir en la ronda 3, y con ella el roce de los dos interrogantes en el mismo turno (el literal nuevo cierra sin pregunta a propósito, y la pregunta del turno es el peldaño de la ESCALERA).

> 🚩 **La cuenta no cuadra, y es un riesgo de marca del mismo tipo que el "tú y yo" de la ronda 1.** El bloque dice **6 meses** de acompañamiento y lo dice con generosidad. Un lead que oye *"desde 110€ al mes"* en esa conversación multiplica: 110 × 6 = **660€**. El real, fraccionado a 12, son **1320€**. Ese desfase estalla en la llamada.
> Decisión de Iván: **no se ofrece, pero si pregunta no se miente.** Regla nueva en `coach_objections_price` para "y eso cuántos meses?" / "entonces son 660?": no se confirma la cuenta, no se da el total, y **tampoco se escurre** con un "eso lo vemos en la llamada" pelado — se dice lo que sí es verdad y se sabe (*"el fraccionado va por su lado, no va atado a los 6 meses"*). Pendiente de contrastar con Pepe qué quiere exactamente ahí.

Y como se abre la puerta a UNA cifra, hay que cerrar el resto con llave: veto binario de totales, importes de pago único, número de cuotas, porcentajes y descuentos, más la regla de no estimar. Las cifras viejas (1197€, 1400€, 4×350€) nunca estuvieron escritas en el bloque, pero ahora que existe una cifra legítima el modelo tiene una excusa para inventar vecinas.

**2. La entrega del lead magnet era seca — y el molde seco lo escribí yo.** Pepe: *"el mensaje es muy seco y no se parece a mí"*, y la captura confirma que salió exactamente el molde de la ronda 3 (*"Toma, aquí la tienes: [link] / Échale un vistazo…"*). Su versión: **"Grande!! Te dejo por aquí el link : [link] 😜😜"**.

Lo que enseña, más allá del literal: **el lead acaba de decir que sí a un regalo, y lo que toca primero es alegrarse con él, no entregar un archivo.** El molde anterior era funcionalmente correcto y emocionalmente plano. Regla nueva: la celebración va SIEMPRE delante del enlace, nunca el link a pelo. La segunda burbuja (pregunta de F1) se mantiene obligatoria — Pepe critica el tono, no la pregunta, y sin ella el lead contesta "gracias" y la conversación muere.

Tres tokens de voz verificados nuevos, y **dos rompían reglas duras del bloque**:

| Token | Choque | Resolución |
|---|---|---|
| "Grande!!" | ninguno | al lexicón y al Modo C de openers, acotado a *cuando hay algo que celebrar* (de arranque neutro sería piloto automático) |
| "Te dejo por aquí el link" | ninguno | al lexicón; sustituye a "Toma, aquí la tienes" |
| **"😜😜"** | 😜 no estaba en el banco **y** son DOS emojis contra el *"máximo 1 por mensaje"* | 😜 entra en humor; el **doblado** se instala como recurso propio |

El doblado se resolvió por el precedente exacto del `!!`, que también era suyo y también rompía la norma: **recurso propio acotado por frecuencia**, no excepción de un literal. Reglas calcadas — solo en celebración/energía, máx 1 de cada 3 mensajes, nunca dos seguidos, nunca triple, y prohibido en Puente, propuesta, cierres, correcciones y la negativa de suplementación. El riesgo que se está gestionando es el caso Frodo ([[feedback_coach_tic_repeticion_metodo]]): dejar `😜😜` suelto en el corpus sin acotar es sembrar el tic.

**3. El anti-IA cambia de doctrina — y esto NO es de Pepe, es de plataforma.** Cierra el segundo 🔴 de la ronda 3. Acuerdo de la reunión del 03-08: **ya no se puede responder que quien escribe es el profesional.** Si el lead pregunta si habla con una IA, la respuesta honesta es que habla con un asistente virtual — y como esa respuesta la da el toggle de Automatía, el bloque hace lo único que le queda: **callar y derivar**.

`coach_identity_notia` pasa de literal de desmentido (*"jajaj que va, soy Pepe 😁"*) a **apagado mudo** + `manual_attention` + `skip_reply` (motivo: `deteccion_ia`), con prohibición binaria de negar la IA en cualquier variante. Es el mismo mecanismo que el trigger 4 (WhatsApp), y por la misma razón: lo que se prohíbe es mentir, no la voz.

Dos ajustes de coherencia que arrastraba: `coach_identity_role` decía *"El setter ES Pepe: el lead cree que habla contigo, **y así es**"* — esa cola es la semilla del desmentido, así que se reescribe separando **voz** (que no se toca: sigue siendo Pepe en primera persona, el menisco, los 1000 acompañados) de **identidad afirmada** (que desaparece). Y el trigger 4 justificaba el apagado mudo en *"el lead cree que habla con Pepe"*; ahora se justifica en lo que es verdad de por sí: quien retoma es Pepe, así que no hay traspaso que anunciar.

⚠️ **Esto afecta a los 10 bloques de academia, no solo a Pepe.** El `coach_identity_notia` de Alfonso, Roberto, Frodo, Chema, Beatriz, Miguel, Alex, Andrea y Luis Royán sigue diciendo alguna variante de "que va, soy X" — y el de Alex es literalmente *"NO eres una asistente virtual ni una IA, eres 100% Alex"*. Con el acuerdo del 03-08 todos son instrucciones de mentir. **Pepe es el primero migrado; los otros 9 están pendientes** y no se han tocado en esta ronda.

### Ronda 4.1 — mismo día, segunda tanda de Pepe (3 feedbacks + la bienvenida definitiva)

**0. La bienvenida se cierra en TRES mensajes, no dos.** Pepe manda la estructura final y hay que respetarla al pie:

> 1) "Grande!! Te dejo por aquí el link 😜😜"
> 2) "https://youtu.be/seN76Fg721g"
> 3) "Échale un ojo porque seguro que te viene muy bien!! 😬 Y ya por curiosidad, has competido alguna vez en HYROX o estás metiéndote en el mundillo ahora??"

El cambio de fondo respecto a lo aplicado horas antes: **el enlace va SOLO en su burbuja**, no pegado al "Grande!!". Y el mensaje 3 rompe dos normas del bloque a la vez — lleva el emoji **en medio** (no al final) y cierra con **doble interrogación**. Ninguna de las dos se corrige: quedó anotado en el bloque como excepción de formato explícita, porque si no el modelo las "arregla" hacia la norma.

**Los signos dobles suben de excepción a norma** (Iván, 03/08: *"no es nada malo, es lo que más suelo utilizar"*). La regla vieja del "!!" era un techo (*"hasta 1 de cada 2 mensajes"*); la nueva es un default en dos tiempos: **si el mensaje cierra con signo, va doble** ("!!" o "??") y eso es la gran mayoría, con algún simple suelto para que no suene mecánico — **pero no todos los mensajes llevan signo**. Correcciones, observaciones, el Puente y los mensajes serios cierran sin nada. Sin esa segunda mitad el recurso se satura y deja de significar energía.

**1. El cierre del recap salía SIEMPRE idéntico.** La captura lo enseña crudo: *"Voy bien o me dejo algo?"* dos veces en la misma conversación (18:16 y 18:24). Pepe: *"se nota mucho que es IA"*. El literal estaba escrito como único en tres sitios del bloque, así que el modelo hacía lo correcto según el prompt.

Mi primer arreglo fue un banco rotativo de cierres aplicable a cualquier recap. **Iván lo corrigió, y el suyo es mejor:** el problema no era el cierre repetido, era que **hubiera dos resúmenes**. Regla final: **UN SOLO RESUMEN en toda la conversación, el Puente de F4**, prohibido recapitular o pedir confirmación antes. El banco de 4 cierres se queda, pero para variar **entre** conversaciones, no dentro de una — el cierre se usa una vez porque el resumen es uno.

Lección de método: cuando un literal se repite, mirar si el problema es el literal o **la estructura que lo invoca dos veces**. Rotar el literal habría escondido el mini-recap en vez de quitarlo.

**2. El guion largo (—) en mitad de mensaje: PROHIBIDO BINARIO.** Su frase, en mayúsculas: *"ESTO ES UN RASGO DE QUE ES IA, DEBE ESTAR COMPLETAMENTE ELIMINADO DE CUALQUIER MENSAJE"*. Caso real: *"Oye, que hoy no hayas ido no lo cambia todo — lo que me acabas de decir sí lo cambia"*.

Verificado antes de escribir la regla, por el precedente del "Y" (que estaba sembrado en 7 sitios del propio prompt): **el corpus de voz está limpio** — 0 guiones en exemplars, literales citados y moldes de fase, y no solo en Pepe: **en los 10 coaches de academia**. Los **91 guiones del fichero viven todos en prosa instruccional mía**, que el modelo lee como instrucción y no como muestra de voz. Se deja así de momento; si el guion reaparece en el smoke, la siguiente pasada es limpiar la prosa.

> 🔑 **La causa real es de arquitectura, y es el hallazgo transferible de esta ronda.** La [doctrina universal](../../prompts/coach-engineering/doctrina-universal.md) **ya prohibía el guion largo** (*"PROHIBIDO el guion largo '—' y el guion como inciso → usar paréntesis o comas"*). Pero la doctrina es **KB de autoría**: vive en el repo para que yo escriba bien los bloques, y **no se despliega a Automatía** — allí solo va el `<coach_block>`. La regla estaba escrita donde el modelo nunca la lee.
>
> Consecuencia: **cualquier regla de voz que viva SOLO en la doctrina universal es inejecutable en producción.** Si tiene que gobernar lo que el setter escribe, tiene que estar dentro del bloque de cada coach. Pepe es el primero que la lleva; los otros 9 van a seguir produciendo guiones hasta que se propague. Conviene auditar qué más de la doctrina está en esa situación.

Y con el guion se va **la estructura que lo sostenía**: "no X, Y sí" / "eso no lo cambia todo, esto sí". Es la hermana con guion del "no se trata de X sino de Y" que ya estaba vetado en el lexicón — quitar el guion sin quitar la construcción no habría arreglado nada. Su versión natural, sembrada como ✅: *"Bueno pienso que al final hay días y días, con que vayas uno de estos y empieces ya vas por buen camino"* — no contrapone nada, quita hierro y empuja hacia delante.

**3. Dos cosas en un solo mensaje: anular al lead y el tic del "ancla".** Caso real: *"Ahí está el ancla. En HYROX la carrera es la mitad del crono y si no la trabajas de forma estructurada el tiempo no baja, **da igual la fuerza que tengas**"* — dicho a un lead que acababa de contar que en fuerza va bien.

> **Doctrina nueva de este avatar: corregir no es anular.** Pepe: *"no puede decirle eso porque no es verdad y porque queda muy cortante"*. La corrección con criterio de la ronda 2 dice qué FALTA; lo que no puede hacer es tachar lo que el lead ya tiene. Su versión: *"Ahí está la clave!! Piensa que en HYROX el 50% de la carrera es correr, si no la llevas bien al final la fuerza no va a permitirte recortar mucho tiempo"* — la fuerza sigue en pie, solo deja de ser suficiente. Vetadas en el lexicón las fórmulas de anulación ("da igual X", "eso no te sirve de nada").

Y **"el ancla" se retira** (*"lo pone en varios mensajes, no es muy yo"*). Sustitutos suyos: **"Ahí está la clave!!"** y **"Ahí está el punto!!"**. Aplicado [[feedback_coach_tic_repeticion_metodo]] — se reescribieron los 5 literales que lo contenían (voiceprint, exemplar, contraste y dos del banco de correcciones) en vez de añadir un cupo, y las instrucciones que decían "se le nombra el ancla" pasan a "se le señala el punto que le frena". Ojo al matiz: **"anclar" como técnica interna se queda** (anclar la pregunta en algo que dijo el lead, §19) — esa palabra nunca sale por chat, el tic era el sustantivo "el ancla" dentro del mensaje.

⚠️ Riesgo asumido y anotado en el bloque: sustituir un tic por dos fórmulas fijas puede generar el tic siguiente. Regla explícita de alternarlas y de que hay correcciones que entran sin fórmula ninguna.

**Aviso de higiene:** el fichero que Iván trajo a esta sesión (`Downloads/coach_block_pepe_jimenez.md`) estaba **desincronizado del repo**: le faltaba el fix del precio del commit `220aed9` y tenía el `coach_identity_notia` borrado a mano. Se aplicó sobre el repo (canónico) y se sincronizaron las dos copias de `Downloads/` a la misma versión, con backup `.pre-2026-08-03.bak.md`. Regla que confirma: **el bloque canónico es el del repo**; las copias de Downloads son artefactos de despliegue y se regeneran, nunca se editan a mano.

## Ronda 5 — 2026-08-03 (la humanización de las preguntas: el cuello de botella era yo)

Dos feedbacks del equipo de Pepe (Héctor, #87, 21h) que apuntan al mismo sitio: **"la IA no personaliza ni se centra en el dolor real, se queda en la superficie"** y **"hace más de 1 pregunta a la vez"**. El caso que lo retrata: lead dice *"me encantaría competir más en serio, pero lo dejamos para septiembre, empezar ya con el verano se complica"* → la IA contesta *"Genial! Y qué día exactamente tienes en mente para septiembre?"*. Tres cosas servidas en bandeja (una decisión, una razón, una motivación nueva) y va a por el dato de calendario.

**La auditoría, y es incómoda: 17 de las 23 preguntas de descubrimiento del bloque eran DE CATÁLOGO.** El test que las descubre es de una línea: *¿se la podrías mandar igual a otro lead distinto?* "A qué tiempo te gustaría llegar?", "qué es lo que más se te está atascando?", "cuántos días puedes sacar a la semana?" — todas existen antes de la conversación. No era una regla que faltaba: **eran mis ejemplos**, y el modelo los copiaba porque están escritos como frases cerradas y autosuficientes. (Se salvan las tres de F1: ahí el lead aún no ha dicho nada y no hay material que anclar.)

**Iván reescribió las 23 a mano** y me pidió cambiar el marco mental *"a partir de ahora para todos los entrenadores"*. El hallazgo al comparar las suyas con las mías: **el salto no está en el anclaje — eso ya lo tenía — está en lo que va DELANTE de la pregunta.**

Los ocho movimientos, destilados a [`doctrina-universal.md`](../../prompts/coach-engineering/doctrina-universal.md) §32 y aplicados dentro del bloque:

| # | Movimiento | Mío (❌) | Suyo (✅) |
|---|---|---|---|
| 1 | La reacción **valora**, no constata | "Tres meses ya dan para cogerle el punto" | *"Tres meses ya está de locos como para cogerlo el punto top!!"* |
| 2 | Ponerte a su lado con algo tuyo | (nada) | *"A todos nos ha pasado ehh, yo el primero jajajajaj"* |
| 3 | Tu criterio ANTES de preguntar | "1h30 lleva ahí un tiempo" | *"Hora y media es un objetivo abordable que podemos bajar 100%"* |
| 4 | Opinar del mundo, con humor y detalle real | (nada) | *"septiembre es cuando empieza todo cristo, no hay más que ver los gimnasios como el Fitness Park jajajajajaj"* |
| 5 | Cerrar la referencia | "Hasta dónde te gustaría llevarlo??" | *"…llegar con el box??"* |
| 6 | Anunciar el giro | (cambio seco) | *"Aunque una cosa que quiero preguntarte:"* |
| 7 | Cuestionar su premisa | preguntaba por la barrera | *"crees que empezar en ese momento cambia algo?? No crees que llegarás más preparado desde el día 1??"* |
| 8 | La palabra del oficio | "dónde te gustaría verte" | *"qué objetivo tienes para la próxima??"* |

El **movimiento 4 es el que más me faltaba**: una observación real del mundo con nombre propio (el Fitness Park en septiembre) hace más por humanizar que tres frases de empatía, y es justo lo que un modelo no produce solo.

**Tres reglas mías que sus ejemplos corrigen:**

1. **"Eso de…" prohibido.** Era un tic mío: lo usaba en 4 de mis 23 propuestas. Alternativa suya: *"Que [lo suyo], es porque…"*.
2. **Dos interrogantes SÍ valen — si el segundo ACOTA el primero.** Esto resuelve la contradicción aparente con el feedback 2 de Héctor: lo que él marcó eran dos preguntas sobre **temas distintos** (*"cuánto llevas y cómo lo llevas"*), que obligan a elegir. Las de Iván son la misma cosa con ayuda para contestar (*"A qué te refieres con qué no sabes organizarte?? En cuánto al entrenamiento o es otra cosa?"*). La regla deja de contar signos y pasa a contar **cuántas cosas distintas tiene que responder el lead**.
3. **El "Y" vale detrás de conexión.** *"…yo el primero jajajajaj  Y desde cuándo te viene pasando??"*. Lo que mata es el "Y" a pelo abriendo burbuja.

> ⚠️ **Y el aviso que se me adelantó Iván antes de que metiera la pata:** anclar tiende a producir "Y", y sus tres ejemplos de referencia empiezan por "Y". Si copiaba el molde sin más, cambiaba un interrogatorio por otro. De ahí el **banco de 8 formas de arranque** en `coach_tone_openers`, con la regla de no repetir forma en mensajes seguidos. Es la lección de la ronda 1.2 otra vez: **una prohibición sin alternativa no se cumple.**

**Vocabulario nuevo verificado:** *de locos, brutal, a tope, top!!, pff, ahí pica, todo cristo, abordable, margen de mejora, 100%, objetivo/objetivos*, la risa larga (`jajajajaj`), los puntos suspensivos de empatía, y 😉 al banco de emojis (con la regla de que el emoji cae mejor en el momento de broma o cercanía que de relleno).

**Reparto en el bloque:** los 8 movimientos + la prohibición de "Eso de" en `coach_tone_voiceprint`; el banco de arranques en `coach_tone_openers`; el vocabulario en `coach_tone_lexicon`; **19 exemplars suyos tal cual** agrupados por momento en `coach_tone_exemplars`, más un antipatrón explícito del caso de septiembre; seis pares ❌/✅ nuevos en `coach_tone_contrast` (los ❌ son frases mías reales); dato-vs-decisión en F2 punto 3; y el cuestionamiento de premisa en `coach_objections_avatar`.

⚠️ **El vocabulario de energía NO es propagable.** "De locos / brutal / todo cristo" es de Pepe. Al llevar §32 a los otros nueve coaches hay que sacarle a cada entrenador el suyo, de cómo escribe él. Lo que se propaga son los ocho movimientos, el test de catálogo y el banco de arranques.

## Ronda 6 — 2026-08-13 (Héctor #87, feedback del 12/08: no soltar al lead + cierre post-agenda)

Dos peticiones del equipo de Pepe, las dos sobre **el final de la conversación**: una sobre cómo se despide de quien agenda, y otra sobre a quién se está dejando marchar sin pelear.

**1. El cierre post-agenda: el sujeto de la acción pasa a ser la IA.** El molde anterior tenía tres variantes y las tres le pedían al lead que repitiera su historia al equipo (*"cuéntales todo lo que me has contado a mí"*, *"prepárate para contarles bien tu situación"*). Héctor lo lee como el momento en que se rompe la continuidad: el lead siente que pasa de un sistema a otro en vez de seguir una sola conversación. Literal nuevo, **único** (mueren las tres variantes):

> 1) "Perfecto mil gracias!! Voy a gestionarlo ya con el equipo para que tengas la mejor valoración y experiencia posible en la videollamada"
> 2) "Un placer haber hablado contigo ;)"

Dos ajustes que van pegados al literal y no son cosméticos: **decir el día YA es confirmar** (antes el disparador era solo una confirmación explícita de reserva, así que ante un "lo he cogido para el martes" la IA volvía a pedir confirmación), y **el ";)" es suyo y no se "corrige"** a 😉 ni a ningún emoji del banco — misma excepción de formato que la entrega de la rutina en F0, y por la misma razón: sin marcarla, el modelo normaliza hacia su propia norma. Tras las dos burbujas → `manual_attention` + `skip_reply` (motivo: `cita_agendada`).

**2. "Voy a intentarlo por mi cuenta" deja de ser un cierre y pasa a ser una objeción.** Es el cambio de fondo de la ronda. La captura lo enseña entero: el lead dice *"de momento voy a intentarlo yo solo, pero si no me veo capaz no dudaré en contactarte"* y la IA contesta *"Genial, pues así me gusta!! Sigue dándole caña"* + el grupo gratuito. Adiós lead. El bloque hacía lo correcto según §22 del Core (la señal "yo puedo solo" no cualifica y se respeta), y **§22 es justo lo que había que sobrescribir aquí**.

> **El marco que pidió Iván: no convencer, SUBIR EL NIVEL DE CONSCIENCIA.** No se rebate y no se presiona. Se le pregunta qué entiende ÉL por ir por su cuenta, se le pone delante su propio historial, y cuando es él quien verbaliza que lleva tiempo sin apenas resultados, ahí se le devuelve la lectura y **una pregunta de reflexión**: *"si ya me has dicho que llevas tanto tiempo así y apenas has visto cambios, crees que seguir igual te va a acercar a tu objetivo en estos meses??"*. La conclusión la saca él.

`coach_objections_solo`, escalera de tres peldaños y **un peldaño por turno** (la regla de una-cosa-por-mensaje del voiceprint obliga a repartirlo):

| Peldaño | Qué se pregunta | Por qué |
|---|---|---|
| 1 | Cómo lo está planteando por su cuenta | "por mi cuenta" puede ser cualquier cosa y no se da por hecho |
| 2 | Su objetivo (solo si no lo dio) → cuánto lleva así → qué ha cambiado en ese tiempo | son los tres datos que hacen falta para que el peldaño 3 sea un espejo y no una opinión |
| 3 | La lectura ("lo que solemos ver en gente que va por su cuenta…" + qué haríais vosotros) y la pregunta de reflexión | es donde sube el nivel de consciencia, con SU tiempo y SU objetivo |

Las dos piezas que Iván añadió sobre mi primera versión y que son las que le dan el punto:

1. **El peldaño 2 pregunta también por el OBJETIVO**, no solo por el tiempo y los cambios. Sin objetivo verbalizado, la pregunta de reflexión no tiene a qué apuntar ("acercar a **qué**").
2. **La lectura del peldaño 3 tiene dos mitades, no una.** La mía se quedaba en el diagnóstico (*"se entrena mucho pero sin progresión detrás el crono no baja"*); falta la segunda, que es la que posiciona: *"y lo que hacemos nosotros al final es enseñarte cómo llegar a tu objetivo de una forma mucho más eficiente"*. Diagnosticar sin decir qué haces tú deja al lead con el problema y sin puerta.

Guardarraíles que se escribieron con ella, porque el movimiento es de los que se pasan de frenada:
- **Condición dura del peldaño 3:** solo con sus DOS datos delante (tiempo + falta de cambios). Sin ellos no es un espejo, es un reproche inventado. Misma familia que "validar solo con el dato delante" de la ronda 2.
- **Si dice que va bien y está contento, no se le discute su realidad** → eso es el caso de F3 y se cierra cálido.
- **"Aun así prefiero seguir solo" se respeta A LA PRIMERA.** La escalera se recorre UNA vez y no se reabre. Lo que se corrigió es soltarlo **antes** de preguntar, no la libertad del lead de decir que no.
- **La llamada no se nombra dentro de la escalera** (sigue siendo F5), y nada de resultados ni plazos como argumento.
- **Frontera nueva con el LEAD FRÍO**, que tenía riesgo real de colisión: el frío llega sin nada y se le nutre y punto; el del "voy solo" YA te ha contado algo suyo y por eso se trabaja. **La frontera es si te ha dado material propio, no si suena a "no".**

Reparto: `_core` punto 9 (override de §22), F3 compromiso, la ⚠️ del lead frío en `_phases`, la compuerta en `coach_wclose_not_now`, la línea de "no descualifica" en `coach_qualification_doesnt`, y la sección `coach_objections_solo` completa.

🩹 **Y un fallo de higiene encontrado de paso, este sí P0.** La copia de `Downloads/coach_block_pepe.md` que se estaba pegando en Automatía tenía una línea corrompida en `coach_structural_modifications_handoff`: decía **"⛔ PROHIBIDO `manual_attention`"** donde el repo dice `handoff_to_human`. Es decir, el bloque prohibía el criterio que sus ~17 triggers de parada mandan emitir. Contradicción directa contra sí mismo en el mecanismo de apagado: en el peor caso ninguna conversación se aparca (ni la detección de IA, ni el "cuéntamelo por WhatsApp", ni el cierre post-agenda). El repo estaba sano; la corrupción vivía solo en esa copia y entró editando el fichero de `Downloads` a mano en algún momento entre el 05 y el 13 de agosto. Arreglado regenerando las dos copias de `Downloads` desde el repo.

> **Confirma la regla de higiene de la ronda 4.1, y ahora con daño medible: el canónico es el del repo y las copias de `Downloads` se REGENERAN, nunca se editan a mano.** Un typo en una copia de despliegue no se ve al leerla por encima y no lo detecta nadie hasta que falla en producción.

## Dónde vive cada cambio dentro del bloque

Primera versión de esta ronda puso 4 "REGLAS DURAS" antes de `<coach_identity>`. **Iván lo rechazó**: el feedback nuevo se traduce a la sección canónica que le toca, no se antepone como capa de conceptos — si no, se salta el protocolo del esquema y el prompt pierde la referencia de dónde vive cada cosa. Destilado a [`formato-saas-coach-v5.md`](../../prompts/coach-engineering/formato-saas-coach-v5.md) §2. Reparto final:

| Cambio | Sección |
|---|---|
| La llamada la atiende el equipo de admisiones (+ prohibiciones binarias) | `coach_identity_role`, con puntero desde `_core` |
| Escalera del "voy solo" (+ override de §22) | `coach_objections_solo`, con punteros desde `_core` punto 9, F3, `_phases` (lead frío), `coach_qualification_doesnt` y `coach_wclose_not_now` |
| Cierre post-agenda literal único | `coach_phase_massage_fase6`, con puntero desde F6 en `_phases` |
| Respuesta a "la llamada es contigo?" | `coach_structural_modifications_handoff` trigger 5 (el 4 es el apagado mudo por WhatsApp) |
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

- 🔴 **Smoke de la escalera del "voy solo"** (ronda 6). Es un movimiento nuevo y de los que se pasan de frenada. Qué mirar en Automatía: (a) que reparte los peldaños en turnos y no comprime la escalera en un mensaje; (b) que **no lanza el peldaño 3 sin sus dos datos** (tiempo + falta de cambios) — es el fallo caro, porque sin ellos suena a reproche; (c) que ante "aun así prefiero seguir solo" cierra a la primera y no insiste; (d) que no nombra la llamada dentro de la escalera; (e) que un lead frío recién llegado NO entra en la escalera.
- 🟠 **Vigilar que la lectura del peldaño 3 no se convierta en pitch** (ronda 6). La segunda mitad ("lo que hacemos nosotros al final es enseñarte…") es la primera línea del bloque que posiciona el servicio fuera de F5. Está acotada a una línea y sin detallar el programa (CR3), pero es exactamente el sitio donde el modelo tiende a ampliar.
- 🟠 **Auditar la línea `handoff_to_human` en los otros 9 coaches** (ronda 6). En Pepe la copia de despliegue tenía "PROHIBIDO `manual_attention`" en vez de "PROHIBIDO `handoff_to_human`", contradiciendo sus propios triggers de parada. Merece un grep por los 9 bloques restantes y por sus copias de `Downloads`, por si el mismo dedazo viajó con el copy-paste de la migración.
- 🔴 **Migrar el anti-IA a los otros 9 coaches de academia** (ronda 4). Pepe ya está; Alfonso, Roberto, Frodo, Chema, Beatriz, Miguel, Alex, Andrea y Luis Royán siguen con un literal que niega ser una IA, contra el acuerdo del 03-08. El de Alex (*"NO eres una asistente virtual ni una IA, eres 100% Alex"*) es el más explícito. Patrón a replicar: apagado mudo + `manual_attention` + `skip_reply` (motivo: `deteccion_ia`) + separar voz de identidad afirmada.
- 🔴 **Propagar la prohibición del guion largo a los otros 9 coaches** (ronda 4.1). La doctrina universal ya lo prohíbe, pero la doctrina no se despliega: hoy los 9 bloques restantes no llevan la regla y van a seguir escribiendo "—" en producción. Va en la misma pasada que el anti-IA.
- 🟠 **Auditar qué más de la doctrina universal es inejecutable** (ronda 4.1). El guion salió porque la regla estaba solo en la KB de autoría. Merece un barrido de la doctrina buscando otras reglas de VOZ (no de método) que ningún bloque haya interiorizado.
- 🟠 **Vigilar que "Ahí está la clave!!" no se convierta en el tic siguiente** (ronda 4.1). Sustituye a "el ancla", que cayó justo por repetitivo. Hay regla de alternancia escrita, pero es exactamente el patrón que [[feedback_coach_tic_repeticion_metodo]] avisa que reaparece.
- 🟠 **Contrastar con Pepe la cuenta del "desde 110€"** (ronda 4). El lead que oiga "110€/mes" y "6 meses" calcula 660€ cuando el fraccionado a 12 son 1320€. Hoy el bloque no confirma la cuenta ni da el total, pero conviene que Pepe diga con qué palabras quiere que se responda — o si prefiere que se deje de decir la duración cuando ha salido el precio.
- ~~🔴 La cifra del "desde X" del precio~~ → **resuelto en la ronda 4**: 110€/mes, en el toque 2. La financiera de Hotmart no se menciona (ni las 12 cuotas), así que ya no hace falta verificar que esté viva.
- ~~🔴 El toggle AVISO DE IA~~ → **decidido el 03-08** y aplicado a Pepe en la ronda 4: no se puede negar ser una IA. Pendiente propagarlo (arriba).
- **Corpus de voz real.** El voiceprint está construido sobre el formulario de alta, no sobre cómo escribe. El "no transmite la autoridad de Pepe" del informe no se cierra del todo sin 10-15 mensajes suyos de DM. Tokens verificados hasta ahora: "Muy toop!!", **"Grande!!"**, "minutillos", "Échale un vistazo", **"Te dejo por aquí el link"**, el "!!" mucho más frecuente de lo que el bloque permitía, 😊 (que no estaba en su banco) y el **emoji doblado 😜😜** (ronda 4).
- **Bug fuera del prompt:** la IA envió *"Sin respuesta."* cuando el lead sí había respondido, y siguió como si nada. Es del pipeline de Automatía (generator/splitter emitiendo un placeholder), no del coach. Sin diagnosticar.
- ~~`{{tracked_calendar_url}}` y `trainer_preferences` en un bloque de academia~~ → resueltos en la ronda 3: eliminados. El Calendly del EQUIPO PJ va literal.
- **Smoke de la ronda 3 sin hacer.** Lo que hay que ver en Automatía: (a) que con la bienvenida del regalo la IA manda el YouTube en su primer turno y sigue conversando en vez de callarse; (b) que la comunidad sale en el último mensaje de un cierre sin cita y NO se repite si ya se mandó antes; (c) que responde "6 meses" sin mandarlo a la llamada; (d) que tras el cierre post-agenda no escribe ni una burbuja más.

---

## RONDA 2026-08-24 — feedback del equipo (Héctor) + 129 mensajes revisados por Iván

Fichero autoritativo `Downloads/coach_block_pepe.md` = [`academia/pepe.md`](../../prompts/coach-engineering/academia/pepe.md).
Backup `coach_block_pepe.pre-revision.bak.md`. Hoja de revisión:
[`docs/revision-pepe-mensajes.html`](../revision-pepe-mensajes.html). **1044 → 1084 líneas.**

### El feedback venía redactado por una IA: lo que era real y lo que no

- **REAL — "no asumir el objetivo del lead" (su Feedback 2, el prioritario).** Y la causa estaba escrita
  en el bloque: el tercer mensaje de la entrega de la rutina preguntaba *"has competido alguna vez en
  HYROX o estás metiéndote en el mundillo"*, y ese mensaje va a **todo el mundo**. Era además un literal
  del propio Pepe, así que no se cambió por criterio propio: se cambió con el OK de Iván.
- **REAL — faltan los avatares 2 y 3.** La identidad solo contempla HYROX y rendimiento híbrido.
- **FALSO — "la IA usa la misma apertura para todos".** El bloque ya tenía cuatro carriles de entrada
  (A/B/C/D). Lo que faltaba era cruzar ese eje con el del SOP (de dónde viene el lead), no crearlo.
- **NO ENTRA — dos piezas de su propia documentación vienen marcadas *"Borrador — pendiente de
  validación"*** por quien las escribió: la apertura de CTA-historia y la tabla avatar × nivel de
  consciencia. Iván validó la tabla con dos correcciones (fuera *"comparación con su preparador actual"*,
  que obliga a juzgar a otro profesional, y fuera *"directo al dolor estético"*). La apertura nº4 **no
  entra al prompt**: ese mensaje lo manda una automatización, no la IA.

### La regla de apertura, ahora explícita

Sección nueva al inicio de `coach_phase_massage_fase0`, con prioridad sobre cualquier literal de esa
sección: **en el primer turno la pregunta es ABIERTA y HYROX solo se nombra si lo ha nombrado él.**
Molde `"Y ya por curiosidad, qué fue lo que te trajo por la comunidad?"` (sale del propio SOP del equipo)
+ tres anclajes para cuando ya ha dicho a qué viene (prueba / oposición / cambio físico) + prohibición
explícita de las dos frases que lo asumían. Entregar un recurso **no** autoriza a asumir el avatar.

### Los 129 mensajes

77 aprobados tal cual · **40 reescritos con el texto literal de Iván** · 3 quitados · 6 descartados por
ser mensajes del LEAD y no de la IA (defecto de mi extractor, ver
[[feedback_coach_turno_en_burbujas]]). **Iván aplicó a Pepe el formato de Alfonso a propósito**, para
que el literal multi-burbuja quede como estándar de los once coaches.

**Bug colateral:** el Calendly del bloque (`calendly.com/equipopj`) estaba **en tres sitios** y no era la
URL buena. Corregido a `calendly.com/d/dvrv-nq6-kdt/sesion-de-evaluacion-pj`.

### Dos decisiones de interpretación, marcadas

- El mensaje corregido en la línea 478 era el **❌ de una pareja de contraste**, y la hoja no lo
  etiquetaba como tal. Su texto pasó a ✅ y se borró el ✅ viejo (asumía HYROX). ⚠️ Esa pareja ya no
  enseña *"no abras con ¡ ni ¿"*, y *"Cómo puedo ayudarte con tu preparación?"* queda sembrado como
  ejemplar bueno pese a ser primo del *"¿en qué puedo ayudarte?"* que otros bloques prohíben.
- Al quitar uno de los dos ejemplos de la regla del peldaño repetido la frase quedaba coja: se reescribió
  sin ejemplos.

### Segunda tanda — aplicada entera (1084 → 1123 líneas, 121 KB)

- **Los tres avatares entran en `coach_identity_niche`** con su motor (lógico el 1 y el 2, emocional el 3)
  y la orden de identificarlos preguntando, nunca deduciendo.
- **Dos canales de autoridad con disparador binario:** si trae CIFRA, marca, prueba o fecha →
  RECONOCIMIENTO (avatares 1 y 2); si trae un ADJETIVO sobre sí mismo o su cuerpo → **COMPRENSIÓN**
  (avatar 3). Si trae las dos cosas, manda el adjetivo. La comprensión reconoce **el intento** y no el
  resultado, nombra lo que él dijo sin dramatizar, y desplaza la causa de la persona al plan.
  **CORREGIR CON CRITERIO queda SUSPENDIDO en el avatar 3** hasta después de la propuesta.
- **Tabla de aperturas por origen** con los literales del SOP: un solo esqueleto (*saludo → el porqué de
  que escribas → el placer de conectar → la pregunta abierta*) y solo **dos casillas variables**. La
  apertura de CTA-historia no entra: la manda una automatización.
- **El periodo de conexión, obligatorio y comprobable:** antes de la primera pregunta sobre su objetivo o
  su entreno tiene que haber habido al menos un intercambio que NO sea de fitness.
- **`coach_objections_avatar` abre con "ya estoy con otro preparador"**: se nombra lo tuyo y se pregunta
  si eso lo ha tenido, nunca se juzga al otro.

### La pasada adversarial encontró cuatro juntas rotas

Los tres avatares nuevos chocaban con reglas **binarias y anteriores** que decían que esto es solo HYROX —
y en este bloque la binaria siempre gana al ejemplar. Corregidas las cuatro: el `coach_identity_niche`
(*"quieren iniciarse o mejorar sus tiempos en HYROX"*), el foco invertido de **Fase 2** (*"este avatar es
de OBJETIVO y es ambition-native"*, que no vale para el 3), el **criterio de cualificación 1** (solo
admitía HYROX / físico híbrido) y **`coach_program_is`**.

⚠️ **`coach_program_is` lo he ampliado a los tres avatares** porque si los criterios cualifican al avatar 3
y la definición del programa lo excluye, el setter recibe órdenes contradictorias. Es lo único de esta
tanda que toca la definición de producto y no una regla de conversación: **conviene que lo confirme Pepe.**

---

## RONDA 2026-08-25 — auditoría de cumplimiento y pasada de limpieza

No trae feedback nuevo de Pepe. Es la verificación que pidió Iván antes de poder decirle a Pepe que su
feedback está cumplido: **56 agentes auditando el bloque contra todo el historial** (rondas 1 a la del
24/08), con cada gap sometido a refutación adversarial. Resultado: **62 puntos de cumplimiento verificados
con cita textual, 1 P0 y ~12 P1**. Ninguno era una decisión perdida — todos eran restos del bloque viejo
que la ronda del 24/08 no barrió aguas abajo de la apertura.

### Lo que quedó confirmado cumplido

Todo el feedback de las rondas 1 a 6 vive en el bloque con regla binaria o literal suyo: equipo de
admisiones (7 capas), los 3 toques del precio con sus literales, "desde 110€/mes" como única cifra, guion
largo prohibido con el corpus limpio, "el ancla" retirado, corregir-sin-anular, un solo resumen, gate de 5
casillas, cierre post-agenda con "decir el día ya es confirmar", escalera del "voy solo" completa, apagado
mudo anti-IA, y las ~20 paradas emitiendo `manual_attention` + `skip_reply` con motivo.

**La cualificación mínima también**, y aquí los verificadores adversariales tumbaron los tres gaps que los
auditores habían levantado: la pregunta de disposición es obligatoria en F3 (hard cap del Core §22,
saltable solo si ya verbalizó ganas), el "por qué ahora" es la casilla 2 del gate, el curioso se filtra en
el toque 3 y al lead frío está prohibido proponerle llamada. No con el mecanismo de dos puertas de
[[project_alfonso_coach_feedback]], pero con uno propio equivalente.

### El hallazgo: el Feedback 2 se cumplía en la apertura y se caía en el turno siguiente

El P0 y casi todos los P1 son el mismo fallo repetido: **la regla de apertura abierta del 24/08 se
autolimita a "el primer turno" y a "esta sección" (fase0), y el resto del bloque siguió asumiendo HYROX.**

| Sitio | Qué decía |
|---|---|
| `coach_phase_massage_fase1` (**P0**) | "lanza UNA pregunta ligera hacia su relación con el HYROX", a todo lead |
| ESCALERA DE RECONDUCCIÓN, peldaños 1-2 | asumían HYROX y competición, y se invocan desde el toque 1 del precio |
| 4 literales de `coach_wclose` | HYROX hardcodeado en not_now, lesión activa, sin material y menor de edad |
| `coach_program_info` | "rendimiento en HYROX: mejorar tus tiempos", contra el `program_is` de los tres avatares |
| 2 exemplars de conexión F1 | "que te enganche el mundo HYROX", sin condición |
| F2 pasos 1 y 4 | "ya has competido en HYROX", "anclar en algo REAL del HYROX" |
| Sídney, test anti-invención, ✅ del contraste, ejemplo de signos, ejemplo de variety | HYROX sembrado como modelo de voz |

> **Y es la tercera vez que este loop tropieza con lo mismo** (el "Y" de la ronda 1.3, el "Eso de" de
> ahora): cuando una ronda mete una regla nueva, hay que **barrer el bloque entero buscando lo que la
> contradice**, no solo escribirla en su sección. La ronda del 24/08 sí hizo pasada adversarial, pero
> buscó choques con la DEFINICIÓN de los tres avatares y no con la regla de apertura.

### Las juntas de sincronía que dejó la ronda anterior

- **La entrega de la rutina decía "TRES mensajes" y listaba CUATRO.** Al partir el mensaje 3 para sacar la
  pregunta abierta del Feedback 2 no se actualizó ni la cuenta, ni el "Los tres van tal cual", ni la marca
  de excepción de formato, que seguía describiendo el literal viejo ("el emoji EN MEDIO", "cierra con doble
  interrogación") — propiedades que ya no tenía ninguna burbuja. Con el tope de 3 burbujas vigente, **el
  modelo tenía licencia textual para descartar justo la burbuja 4**, que es la pregunta abierta del
  feedback prioritario de Pepe.
- **"Eso de las molestias en las tibias" seguía sembrado como ejemplo POSITIVO** del MODO A, con "Eso de…"
  prohibido en tres sitios, dos de ellos veinte líneas más abajo.
- **"Se nombra el ANCLA en una frase"** sobrevivía en el guardarraíl de la corrección con criterio.
- **"bienvenido a la comunidad crack"** entró del SOP con "crack" prohibido como apelativo, y el puntero
  remitía al lexicón, que no lo listaba.
- **Puntero que miente:** la excepción del artículo del precio remitía al `_core punto 7` cuando la regla
  vive en el 8. Misma familia que el trigger 4/5 de la ronda 3.
- El ✅ **huérfano** "Cómo puedo ayudarte con tu preparación?" seguía sin pareja ❌ (la ronda 24/08 lo dejó
  anotado y no se cerró), el tope de "~12 palabras" era letra muerta (una docena de literales validados lo
  superaban) y el emoji del Puente vivía en dos redacciones con fuerza distinta.

### Qué se aplicó

**1126 → 1124 líneas, en tres tandas** (la 2 y la 3 salen de las pasadas adversariales, ver abajo). Casi
todo son reescrituras en el sitio; lo que se borró es una prohibición redundante de "Eso de…", el puntero de
apelativos que mentía y la cola duplicada del periodo de conexión.

F1 y F2 anclan en el terreno que ÉL haya nombrado · los peldaños de la escalera llevan sus dos variantes ·
4 literales de wclose neutralizados · `coach_program_info` reescrito a los tres avatares · la rutina
declara CUATRO burbujas y el tope del voiceprint declara sus dos excepciones · la excepción de formato
describe el literal vigente · MODO A con arranques reales · guardarraíl sin "el ancla" · apelativos con
"crack" y su única excepción · puntero al punto 8 · toque 3 con variante neutra para cuando se llega por la
escalera y no por el precio · el aplazamiento sostenido continúa la conversación en vez de quedar en el
aire · el ✅ huérfano recupera su ❌.

### La pasada adversarial se cobró una regresión mía

13 agentes verificando mis propias ediciones: 10 arreglos limpios y dos cosas que arreglar.

1. **Regresión real.** Al hacer binario el "sin emoji" del Puente endurecí de paso *"ninguno en un mensaje
   serio o sensible"*, lo que **prohibía el 🫂 del exemplar validado de la validación por el menisco** y
   dejaba sin uso legal la familia entera de emojis de calidez. Corregido: binario solo en Puente y
   propuesta.
2. **Tres juntas abiertas por mí.** El paso 1 de F2 duplicaba palabra por palabra el ancla de F0 (y
   colocaba una pregunta de punto de partida en el paso de ambición); el ejemplo del MODO A fundía en una
   burbuja un literal que el voiceprint tiene partido en dos; y la cola que añadí al periodo de conexión
   repetía la regla, la justificación y el ejemplo que ya estaban once líneas más arriba.

> **Confirma [[feedback_coach_ronda_verificacion_adversarial]] con daño medido: una ronda introduce
> contradicciones también cuando es una ronda de limpieza.** Sin la pasada adversarial, la corrección del
> emoji habría entrado en producción prohibiendo un exemplar que Pepe validó.

### Lo que NO se tocó, y hay que decirle a Pepe

- **`coach_program_info` y `coach_program_differentiator` ahora describen el producto para los tres
  avatares**, igual que `program_is` en la ronda anterior. Es definición de PRODUCTO, no regla de
  conversación: **lo confirma Pepe.**
- El literal de la cuenta "¿son 660€?" sigue siendo redacción de Iván, **sin validar por Pepe**.
- El **exemplar del hermano** (*"Ostras de locos y que tal le va?? Tu hermano ha influido en algo…"*) lleva
  dos preguntas de temas distintos contra la regla de una-cosa-por-mensaje. Validado por Iván el 03/08 y
  sembrado en tres sitios: **no se toca sin que él lo decida.**
- El **aplazamiento sostenido** ("empiezo en septiembre" que mantiene) ahora continúa la conversación por
  defecto. Es la lectura conservadora, pero **el criterio es de Pepe**: puede que le valga agendar hoy una
  llamada para empezar en septiembre.
- El literal del CTA (*"Aquí mi versión no robótica, por cierto"*) implica que quien escribe es una
  persona, y roza el acuerdo anti-IA del 03/08 ([[feedback_coach_no_negar_ia]]). Es literal de su SOP.
- **El cumplimiento verificado es TEXTUAL.** Sigue abierto el smoke en Automatía de la escalera del "voy
  solo" (ronda 6), y ahora también el de la apertura por avatar.

### Tres pasadas adversariales, y cada una encontró algo de la anterior

La limpieza necesitó **tres tandas**, y las dos últimas salen de verificar mis propias ediciones:

| Tanda | Qué la disparó |
|---|---|
| 1 | Los gaps de la auditoría (1 P0 + ~12 P1) |
| 2 | La regresión del emoji + tres juntas que abrí yo (F2 duplicaba el ancla de F0, el MODO A fundía dos burbujas, el periodo de conexión se repetía) |
| 3 | Una mis-cita del literal de Pepe (le quité "objetivo", la palabra que el movimiento 8 ordena), dos siembras de HYROX que sobrevivían en el voiceprint, y el bloque ✅ del "Y" que no contenía ningún "Y" |

> **La lección de método: al endurecer una regla hay que barrer lo que pasa a contradecir.** En la tanda 3
> cambié el cupo contable del "Y" (*"si ya hay dos, el siguiente se reescribe"*, inejecutable porque el setter
> no lleva contador entre turnos) por una binaria con excepciones declaradas — y eso convirtió en infracción
> un literal que antes era tolerable (`coach_objections_avatar` abría burbuja con "Y por curiosidad"). El
> cambio era bueno; el daño estuvo en no barrer detrás.

### Contradicciones vivas que quedan (ninguna P0, ninguna de la limpieza)

Son costuras del avatar 3 y del 2 **aguas abajo de la conversación**, en sitios que la ronda del 24/08 no tocó
porque no son reglas de conversación:

- **P1 — `coach_identity_niche` se contradice consigo mismo:** declara *"Es un avatar de OBJETIVO… no de dolor"*
  seis líneas antes de definir el AVATAR 3 de **motor emocional**. Vive en identidad, que es lo primero que lee
  el modelo. F2 sí está acotado ("los avatares 1 y 2 son de OBJETIVO"), así que la identidad contradice a la fase.
- **P1 — la casilla 5 del gate de F5 exige RECONOCIMIENTO**, que el bloque define como canal exclusivo de los
  avatares 1 y 2. Con un avatar 3 la casilla queda insatisfacible, o satisfecha fingiendo el logro que el canal
  de COMPRENSIÓN prohíbe fingir.
- **P1 — los descualificadores 4 y 5 siguen midiendo con vara de HYROX** (material de box, "no encaje físico
  para la exigencia de HYROX") mientras el criterio 1 de cualificación admite a los tres. El literal que se
  envía ya es neutro, así que el fallo no se ve por chat: **se ve en la decisión.**
- **Observación — `coach_program_differentiator`** sigue en clave de competición ("la carga de hidratos para
  competir") después de que `_info` y `_is` se reescribieran a tres avatares.
- **Observación — la comunidad gratuita de HYROX es obligatoria en todo cierre sin cita**, así que al lead de
  oposición y al de cambio físico se les despide con un grupo de HYROX. Se decidió en la ronda 3, cuando solo
  había un avatar: **conviene que Pepe confirme si lo sigue queriendo así.**
- **Observación — `coach_phase_massage_fase0` declara "Origen: inbound"** dos líneas después de describir la
  apertura outbound que entró el 24/08.

🚨 **Deuda ajena al bloque, del mismo P0 de la ronda 1:** [`prompts/source/coach-v5/pepe-jimenez.md`](../../prompts/source/coach-v5/pepe-jimenez.md)
(la copia del SaaS) sigue con 4 ocurrencias de *"tú y yo"*, sin la regla de precio y sin el equipo de admisiones.
Si ese tenant se activa, resucita el fallo más caro del loop.

---

## RONDA 2026-08-27 — el carril del avatar (Loom + Manual de Teoría)

Feedback nuevo de Pepe: **se pierden leads porque la IA tira siempre por HYROX** y encierra ahí la conversación
antes de saber a qué viene la persona. Cuatro casos reales en su Loom, dos buenos y dos perdidos:

| Caso | Qué pasó |
|---|---|
| **Andrés** | Abre pidiendo precio y en qué consiste. La IA: *"tienes experiencia en HYROX?? buscas iniciarte o mejorar tiempos??"*. Él: *"tu asesoramiento es sobre HYROX o también running, gimnasio y nutrición?"*. Venía a otra cosa. **Perdido.** |
| **Cleofás** | CTA. Vive en Noruega, entrena mucho, no encuentra el punto con la comida, pasa hambre, quiere bajar grasa. Nunca nombra HYROX. La IA: *"tienes alguna competición o meta HYROX?"*. **Perdido.** |
| **Patry** | *"después de muchos años necesito preparar una oposición"* → se tiró por oposición. **Agendó.** |
| **Alba** | CTA, pregunta abierta, habla de fuerzas armadas y de estar estancada en nutrición y deporte. **Coherente.** |

### El diagnóstico: no era de tono, era que faltaba un ESTADO

El bloque escribía el fork *"si él ya nombró su terreno / si no"* en **cuatro sitios** (fase0, fase1, F2 punto 1,
peldaños de la escalera). Ninguno decía qué hacer cuando **no sabes quién tienes delante**, ninguno prohibía
soltar el terreno una vez detectado, y la única regla dura se autolimitaba a *"en el PRIMER TURNO"*.

> Por eso Cleofás se cayó **tres mensajes después** de una apertura correcta: la regla ya había caducado.

### Lo que entra: `_core` punto 10, EL CARRIL DEL AVATAR

Va al `_core` porque es la sección que "prevalece sobre cualquier fase", y consolida los cuatro sitios en uno:

- **Se arranca siempre sin identificar, y no caduca con los turnos.**
- **Mientras dure**: se conecta, se reacciona, se entrega el recurso y se pregunta abierto. HYROX,
  competiciones, tiempos, marcas, estaciones y el box **no se nombran**; no se entra al foco invertido de F2;
  no se propone llamada. (Exentos: el nombre del grupo gratuito y el literal de descualificación por material.)
- **La pregunta de carril, LITERAL de Iván**, si en los dos o tres primeros mensajes no ha dado carril y una
  sola vez: *"Simplemente por curiosidad, tu objetivo está relacionado con el HYROX, preparar unas oposiciones
  o es más un cambio físico que quieres hacer?"* Si ya lo dijo, **no se hace**.
- **En cuanto lo diga, ahí te quedas**, con tabla de tres filas y la regla dura: *del carril que él NO ha puesto
  no sale ni una pregunta*.
- **Desempate por PROMINENCIA**: manda el bloqueo en presente, **salvo que la prueba sea a lo que viene**. Quien
  dice "necesito preparar una oposición" va por oposición aunque le falle la comida (Patry); quien la cuelga de
  otra cosa ("y de paso hacerme un HYROX") es un extra y manda el bloqueo (Alba, y el caso del Loom a 7:03).

**Las tres opciones dentro de la interrogación** chocaban con la binaria de "máximo 2, NUNCA 3". Se declara como
excepción única y acotada en el voiceprint: no son partes de un mismo problema entre las que elegir, son tres
mundos y se le pide que diga a cuál viene. **Iván descartó la alternativa** de sacar los mundos a una burbuja
declarativa: una sola pregunta lo abarca todo.

Alrededor, 11 cambios más: la apertura pierde "el primer turno" y recoge por nombre las seis redacciones del
Loom; el **"sí" a la rutina cuenta como cero información** (el carril B es "el punto más importante" según Pepe);
la casilla 5 del gate de F5 se abre a COMPRENSIÓN (con avatar 3 era insatisfacible); el lexicón separa el
vocabulario universal del de competición; el objetivo de la propuesta sale de su carril; y el peldaño 1 de la
escalera deja de ser la puerta por la que se colaba HYROX a Andrés.

### Tres pasadas adversariales, y las tres encontraron algo

| Pasada | Qué encontró |
|---|---|
| 1ª | **2 P0**: el banco de correcciones soltaba *"en HYROX el 50% de la carrera es correr"* y *"tienes acceso a un box?"* sin gate, y un exemplar de F1 preguntaba por el box al perfil exacto de Cleofás. Más 8 P1. |
| 2ª | El literal del 50% vivía en **cuatro sitios** y solo se gateó uno. Y una **regresión propia**: al condicionar el lexicón se bloqueó "el box" y "físico híbrido", que un literal obligatorio de descualificación necesita. |
| 3ª | **Otro P0 propio**: el desempate recién escrito ("salvo que tenga una prueba POR DELANTE") se tragaba el caso que el Loom nombra como avatar 3. El discriminador no es si la prueba ha pasado, es si viene **a** eso. |

> **La lección, y ya es la quinta vez en este loop:** al meter una regla nueva hay que barrer lo que pasa a
> contradecir. Aquí además con una vuelta de tuerca — **dos de los tres hallazgos graves se introdujeron
> arreglando el anterior.** Sin las tres pasadas, el bloque habría salido mandando a Patry al carril equivocado.

**1125 → 1150 líneas (+25).** No cumple el "igual o más corto": el bloque no tenía mecanismo de identificación
y eso son líneas nuevas de verdad. Lo que sí hace es consolidar cuatro redacciones del mismo fork en una.

### Lo que queda abierto

- 🔴 **El corpus de voz es monocarril.** De ~46 exemplars, ~15 sitúan al lead en carrera/box/competición, **cero
  en oposición** y prácticamente ninguno en cambio físico. El único Puente de F4 y la única propuesta de F5 son
  de HYROX. Las reglas compensan, pero **los exemplars enseñan el patrón**: mientras el material que el modelo
  imita sea de un solo avatar, tirará de ahí. Hay que escribir 2-3 por terreno **y que los firme Pepe**, como se
  hizo con las 23 preguntas del 03/08.
- 🟠 **El descualificador 4 pide wall balls a los tres avatares** (una lead de cambio físico que entrena en casa
  con mancuernas se cae por no tener SKI-erg). Es definición de producto: **lo decide Pepe.** Igual el criterio 2.
- 🟠 **La comunidad gratuita de HYROX sigue siendo el cierre obligatorio** también para el opositor y el de
  cambio físico. Se decidió cuando solo había un avatar.
- 🟠 **La pregunta de carril nombra el HYROX primero.** Va gateada y es literal de Iván, pero en el Loom (3:16)
  Pepe pedía la pregunta abierta pelada, *"y que él sea el que se abra"*. Conviene que lo sepa.
- ⚪ **El eje LEAD A/B/C del Manual NO entra**, y no por longitud: el manual dice que quien pregunta precio en el
  primer mensaje es Lead A y que al Lead A se le va directo — **Andrés preguntó precio en el primer mensaje**.
  Aplicarlo literal lo habría clasificado como el lead al que acelerar, que es justo lo que le cerró en HYROX. El
  ritmo ya está resuelto con otros nombres: Lead C = lead frío, Lead A = Fast-Track, Lead B = el caso por defecto.
