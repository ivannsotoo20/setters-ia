---
name: project_pepe_coach_feedback
description: "Loop del bloque COACH Pepe Jiménez (academia/Automatía, HYROX y rendimiento híbrido — el primer avatar de OBJETIVO puro). Estado tras la ronda 1 (2026-07-25): la llamada la atiende su equipo de admisiones (no él), el precio no varía por persona, F5 con valor, anti-repetición literal y canal de autoridad por RECONOCIMIENTO en vez de eco. Recall si vuelve feedback de Pepe o entra cualquier coach de rendimiento/competición."
metadata:
  node_type: memory
  type: project
---

Pepe Jiménez = coach de la academia (Automatía, no el SaaS Fyzon). Dietista + entrenador de **HYROX y rendimiento híbrido**; hombres y mujeres de 20-40 que quieren iniciarse o bajar tiempos. Bloque: [`prompts/coach-engineering/academia/pepe.md`](../../prompts/coach-engineering/academia/pepe.md), formato `<coach_block>` con headers `##` (mismo loop que [[project_alfonso_coach_feedback]] / [[project_roberto_coach_feedback]] / [[project_frodo_coach_feedback]]). Despliega Iván a mano en Automatía.

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

- **[PENDIENTE DATO DE PEPE]** rango de duración del acompañamiento y qué incluye el mínimo. Su equipo lo pidió expresamente ("dar al menos un rango orientativo para no dar sensación de evasiva total"). Mientras tanto, `coach_program_duration` tiene dos respuestas provisionales que no se repiten entre sí.
- **Corpus de voz real.** El voiceprint está construido sobre el formulario de alta, no sobre cómo escribe. El "no transmite la autoridad de Pepe" del informe no se cierra del todo sin 10-15 mensajes suyos de DM. De esta ronda salieron sus primeros tokens verificados: "Muy toop!!", "minutillos", "Échale un vistazo", el "!!" mucho más frecuente de lo que el bloque permitía y 😊 (que no estaba en su banco).
- **Bug fuera del prompt:** la IA envió *"Sin respuesta."* cuando el lead sí había respondido, y siguió como si nada. Es del pipeline de Automatía (generator/splitter emitiendo un placeholder), no del coach. Sin diagnosticar.
- Verificar en Automatía si `{{tracked_calendar_url}}` y las referencias a `trainer_preferences` que arrastra el bloque se interpolan de verdad — venían del formato SaaS y en Automatía puede que no signifiquen nada (el Calendly del EQUIPO PJ está hardcodeado en el literal de F6, así que funciona igual).
