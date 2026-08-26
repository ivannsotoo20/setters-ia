---
name: project_frodo_coach_feedback
description: "Loop del bloque COACH Frodo (academia/Automatía, hombres recomposición corporal); estado tras la ronda 2026-08-25 (la cadena de Rubén: contexto ANTES del bloqueo, recorrido y curiosidad como pasos fijos, importancia+urgencia e intención como los dos criterios mínimos, y cerrada la puerta trasera que dejaba aplazar una casilla a la llamada). Archivo autoritativo: prompts/coach-engineering/academia/frodo.md. Recall si vuelve feedback de Frodo."
metadata: 
  node_type: memory
  type: project
  originSessionId: ce919e07-d1b4-49a3-8444-79c65dd1b808
---

Frodo = coach academia/Automatía (hombres +30, recomposición corporal: perder barriga, cuerpo atlético, salud/energía; de Canarias, **sin emojis, todo minúsculas, no abre ¿/¡**), formato full-XML `<coach_block>`. NO es coach_v5 del SaaS Fyzon; Iván lo despliega en Automatía. Mismo loop que [[project_alfonso_coach_feedback]] / [[project_roberto_coach_feedback]] / [[project_chema_coach_feedback_loop]]. Archivo: `C:\Users\sotob\Downloads\coach_block_frodo.md`. Backup = `coach_block_frodo.pre-2026-07-13.bak.md`.

**Ronda 2026-07-13** (aplicar la doctrina destilada de la ronda academia — ver [[project_coach_authoring_kb]] §26–§29/§11.15). Frodo tenía el fallo EXACTO que Rubén le marcó en la reunión del 13-jul: **lleno de preguntas de PROCESO** ("vienes entrenando?", "qué estás haciendo ahora?", "qué llevas haciendo?", "le estás dando caña al entreno?") sembradas en léxico, exemplars, F1 y F2. Cambios (+17/−14):
- **Quitadas todas las preguntas de proceso** → freno/objetivo en PRESENTE y simple (gate no-método, doctrina §19). Añadido un `⛔ GATE NO-MÉTODO` explícito en el massage de F2.
- **Regla de simplicidad (feedback Iván 13-jul, NUEVO):** con hombres, preguntas simples y directas que NO obliguen a releer — una idea por pregunta, sin subordinadas. Ejemplo de Iván: ❌ *"qué dirías que es lo que más te está frenando ahora para conseguirlo?"* → ✅ *"cuál es el mayor bloqueo que te estás encontrando ahora mismo?"*. Añadida al voiceprint de Frodo **Y destilada a la KB** (`avatares/hombres-perdida-peso/principios.md` P2 + `patrones-comunes.md §7`).
- **Pregunta muerta** ("qué cosas notarías diferentes en tu día a día") → proyección emocional "cómo te sentirías el día que lo consigas" (§11.15).
- **Curiosidad F2** (máx 2, no asumir la actividad — el caso "montaña" de la reunión era de Frodo) (§20).
- **Anti-videollamada** (§26): gateado "lo vemos en la llamada" a F5 en el léxico.
- **Calendly se MANTIENE** (Iván lo confirmó explícitamente; NO se cambió su agendamiento al método Andrea, a diferencia de Roberto 3.0). Sin tocar: el F1 "cuánto mides y cuánto pesas" (Iván lo dejó a criterio y no lo pidió cambiar).

**Ronda 2026-07-15 — feedback de Víctor ("conversación de la IA sin sentido", prioridad Alta).** ⚠️ **CAMBIO DE ARCHIVO AUTORITATIVO**: `Downloads/coach_block_frodoo.md` (doble "o"; era copia byte-idéntica de `coach_block_frodo.md`, Iván eligió trabajar sobre ella). Backup `.pre-2026-07-15.bak.md`. Conversación real (lead Jose, 52 años): tras dar "tengo 52 años mido 174 y peso 83" la IA soltó *"buen objetivo tío, con esos datos hay bastante margen para trabajar bien"*, y al responder el lead *"Es personal"* le cerró la conversación. Cambios (+44 líneas, 32.415 → 38.231 bytes):

- **Bug 1 root cause = SIEMBRA, no alucinación.** *"buen objetivo tío"* estaba sembrada **4 veces** (lexicon desnudo + openers + exemplars + fase1) = la frase más repetida del bloque; agravante: peso/altura vivían pegados al *"aterrizaje del objetivo"* (L153/L277), así que datos sueltos activaron el frame "objetivo". **Es el caso "Vale tío" de Alfonso otra vez** → confirma el aprendizaje de método (revisar SIEMPRE si el bloque siembra antes de escribir la regla).
- **`⚠️ TEST BINARIO ANTI-INVENCIÓN DE CONTENIDO`** (nuevo, en voiceprint): atribuir OBJETIVO/INTENCIÓN/DECISIÓN/COMPROMISO exige palabra literal del lead. Datos (edad/peso/altura/profesión) NO son objetivo. Es el hermano del test anti-invención EMOCIONAL de Alfonso 2.0, que no cubría contenido. Lexicon condicionado + condicionales reforzados en exemplars/fase1 + ejemplo nuevo del caso real en openers sub-tipo B.
- **`⚠️ NO VALORES SU CUERPO NI SUS DATOS (CR4)`** (nuevo, voiceprint): los datos físicos se recogen como contexto y NO se juzgan. Prohibido *"hay bastante margen"*, *"con eso se puede hacer mucho"*. A 174/83 eso es decirle que está gordo sin que lo pregunte.
- **Bug 2 root cause = HUECO: §24 no existe en NINGÚN sitio.** Verificado por grep: ni en `core_block.GENERAL.txt`, ni `core_block_v6.md`, ni `core_block_roberto.md`, ni en Frodo. La DIRECCIÓN §19–§25 se destiló a la KB y a los coaches del repo, pero **al CORE de la academia nunca se aplicó** (congelado hasta validar Roberto). Además la IA violó 2 reglas escritas: el propio bloque decía *"nunca cerrar antes de 2-3 intercambios reales"* (hubo 1) y el CORE L605 manda *"reconducir primero; si el lead REITERA, entonces cierre"*.
- **`<coach_lead_reservado priority="high">`** (nuevo, en structural_modifications): límite ≠ retirada. Acusar recibo + reconducir por otra vía en el MISMO mensaje, nunca re-preguntar lo negado, nunca cerrar. + pregunta súper abierta si da poca info 4-5 turnos; el silencio cualifica.
- **`## REGLA DURA — GATE DE CIERRE`** al principio del bloque (donde Alfonso 2.0 tiene su MARCO RECTOR): 3 checks binarios antes de cualquier wclose. **La regla existía pero vivía en `coach_qualification_doesnt`** — una sección de CRITERIOS que el modelo consulta para decidir si alguien cualifica, no al construir el turno. Aprendizaje de método: *una regla en la sección equivocada no se cumple*.
- **wcloses marcados `Mensaje LITERAL`** + prohibido parafrasear/mezclar: el cierre que envió no era ninguno de los dos, era una **mezcla improvisada** con su molde. Solo fase6 tenía la marca "(LITERAL)".
- **DESCARTADO por Iván**: reescribir los ❌ verbatim que siembran (el gate no-método SÍ funcionó; tocarlo podría debilitarlo).

**Hallazgo universal de esta ronda (§1 en estado puro, pendiente de destilar con OK de Iván):** *"darle caña"* aparecía en **un solo sitio de todo el bloque — dentro de una prohibición** (L296, gate no-método: "le estás dando caña al entreno?") y el modelo lo usó en el cierre. Igual, el ❌ del voiceprint (*"qué dirías que es lo que más te está frenando ahora para conseguirlo?"*) produjo casi la frase prohibida. **Escribir la frase mala ENTERA la siembra** — sobre todo cuando es una frase natural y útil (≠ un error obvio como los pares ❌/✅ de Alfonso, que sí funcionan). Candidatos a KB: refuerzo §1, modo de falla §11.16 (invención de CONTENIDO), §24 al CORE academia (congelado), y "los literales sin marcar se parafrasean" a formato.

**Observación fuera del prompt:** la bienvenida de esa conversación (*"Muy buenas! 😊 qué tal Jose! Gracias por seguirme!!"* + *"el menú de Jose Luis"*) va etiquetada **Manual** y lleva emoji, mayúsculas y doble exclamación — las 3 prohibidas en absoluto por el voiceprint de Frodo. No es bug del bloque (lo mandó un humano), pero el lead recibió una voz y luego otra.

**PENDIENTE**: Iván testea en Automatía. Sin destilar a la KB todavía.

**Ronda 2026-07-29** (⚠️ documentada a posteriori el 30-jul, reconstruida del diff — a diferencia de Alfonso, Beatriz y Luis, **no queda fichero de feedback en `Downloads/`** para esta ronda). El bloque pasa de 65 k a ~65 k con +253/−… líneas netas de cambio; el tema de fondo es **dirección + dejar de interrogar**. Lo que entró:

- **`## REGLA DURA — SEÑAL DE COMPRA`** (nueva, en cabecera, prevalece sobre el descubrimiento). Define en cerrado qué ES señal de compra — pide el siguiente paso ("cómo seguimos", "qué tengo que hacer"), pregunta por ti / el programa / el precio, o se apunta — y **qué NO lo es**: *"no sé por dónde empezar"* es un lead perdido pidiendo ayuda, justo lo contrario; tampoco "me interesa" / "suena bien" sueltos, ni darte datos, ni validar tu contenido. Cuando sí la hay, **prohibido sacar otra pregunta de descubrimiento**. Binario: con objetivo + bloqueo ya en mano → **puente F4 en ese mismo turno**; si falta uno → UNA sola pregunta corta y el puente al turno siguiente, nunca dos. El puente no se salta ni se fusiona con F5, y señal de compra **no** es permiso para cerrar (el gate de cierre de la ronda anterior sigue intacto).
  - **Excepción del primer mensaje**: si la señal llega en el primer turno de la IA, manda la regla de F1 — saludar y conectar cálido, recoger con ganas lo que pide, y UNA pregunta abierta y ligera. Nunca un audit de objetivo pelado ni el puente en el turno 1.
- **Guerra a la "y" de pegamento** (`coach_tone_variety`, reglas 7-9). Ninguna pregunta arranca con "y" ("y dime", "y qué", "y cómo"): la regla 4 solo miraba la primera palabra y la "y" se colaba en la segunda parte tras la validación (*"bien tío, y estás contento…"*). Tope duro: **como mucho 1 mensaje en toda la conversación** puede empezar por "y". La "y" interna dentro de la frase sí vale. Y no se puede cambiar por otro conector fijo ("vale", "oye", "bueno", "entonces", "mira", "dime una cosa", "cuéntame") puesto en cada turno — **es el mismo tell con otra palabra**: máx 1 conector de enganche por ventana de 3 mensajes. De F2 en adelante, tras validar se va DIRECTO a la pregunta; el hilo lo da retomar una palabra del lead, no un conector pegado. Además: el molde `[validación] + y + pregunta` cuenta como la MISMA apertura aunque cambie la validación, y **"tío" baja a máx 1 cada 3 mensajes** (antes era libre "con criterio").
- **`<coach_preguntas_clave>`** (nuevo): banco de las 6 preguntas que mejor funcionan con este avatar (falta/bloqueo · por qué ahora · importancia · coste de no actuar · valor de la guía · encaje), con **tope duro de 2 en TODA la conversación**. No es una checklist que se recorre: son 6 opciones para elegir las dos que encajan. Reglas binarias para que no degenere en formulario: ninguna en F1; máx 1 por mensaje y nunca dos seguidas (el lead tiene que haber **desarrollado** en medio — "sí", "claro", "bastante" no es desarrollar); si ya te contestó el fondo de una, se tacha. Y **pares que miden lo mismo**, de los que solo se usa uno: la 1 ES la pregunta del bloqueo de F2; la 2, la 3 y el "motivo AHORA" de F3 son la misma; la 5 ES la lente "puedo solo" y la objeción "ya sé lo que tengo que hacer"; la 5 y la 6 comparten molde hipotético y juntas suenan a doble cierre de guion. Si salta señal de compra, se acabó el banco — **la 6 también**.
- **`<coach_direccion>`** (nuevo): "con un hombre la conexión no se genera validando más, se genera DIRIGIENDO". Cuatro reglas: (1) **anclar en el bloqueo central** — es una brújula, no un problema a resolver por chat: se profundiza en cómo le afecta HOY, desde cuándo lo arrastra o qué le supondría resolverlo, **nunca** en la autopsia del método; (2) **cada pregunta nace de la anterior semánticamente** — encadenar es coger su palabra y colgar la pregunta ahí, no pegar un conector delante para simular que enlazas (§25); (3) **leer la temperatura**; (4) **interpretar antes de preguntar**, media frase, nunca un párrafo (con hombres el camino es corto, P2).
- **F1 pasa a ser conexión PURA**: los 2-3 primeros mensajes **no van de objetivos**. Prohibido preguntar objetivos, resultados, cifras o peso/altura ahí, *aunque el lead esté pidiendo ayuda*. El objetivo llega después (final de F1 o F2) y muchas veces lo suelta él solo. **F2 se reescribe como descubrimiento encadenado** (objetivo → porqué + curiosidad del mismo hilo → bloqueo y anclar), con ritmo en vez de cap rígido y con cortocircuito por señal de compra.
- **Limpieza de literales que sembraban el tell**: fuera los "ahora mismo" redundantes de los exemplars, *"buen objetivo tío, quitarse la barriga es algo muy abordable!! y dime…"* → *"te leo tío, lo de la barriga se lleva mejor de lo que parece!! qué te ha llevado a ponerte con esto ahora?"*, y el manejo de *"es personal"* pasa a acusar recibo con punto y reconducir, sin enganchar con "y". Coherente con el aprendizaje de método del loop: **la regla no basta si el bloque sigue sembrando la frase**.

**PENDIENTE de esta ronda**: sin smoke documentado y sin destilar a la KB. El banco de preguntas con tope duro y la separación conector-vs-encadenado-semántico son candidatos claros a doctrina universal (§25 en estado puro).

---

**Ronda 2026-08-03 — "no cualifica y no hace mis preguntas" (vía Jose).** Las dos quejas del entrenador
eran **la misma queja**, y la causa estaba escrita en el bloque por la ronda anterior. Las 6 preguntas que
Frodo entregó en su documento vivían en `<coach_preguntas_clave>` bajo un **`⛔ TOPE DURO: MÁXIMO 2
preguntas de este banco en TODA la conversación`**, más cuatro capas de exclusión encima (ninguna en F1,
nunca dos seguidas, cuatro "pares que miden lo mismo" que se tachaban entre sí, y "si salta señal de compra
se acabó el banco"). Sus preguntas estaban en el prompt y el prompt estaba escrito para que casi nunca se
hicieran. **Es [`doctrina §31`](../../prompts/coach-engineering/doctrina-universal.md) en estado puro**
(escrita el 31-jul a raíz del feedback #64 de Alfonso): *el criterio de descubrimiento es un SUELO
vinculante con fuente única, no un techo*. Frodo era el caso extremo — **solo techo, y ningún suelo**: ni
una línea decía "si te falta X, prohibido proponer".

Método: se analizaron los 6 coaches de la academia que sí cualifican (Roberto — el que Iván marcó como
referencia —, Alfonso, Miguel, Beatriz, Pepe, Andrea) + la doctrina del avatar masculino, buscando el
patrón común. Salieron 12; los cinco que gobiernan esta ronda:

1. **El suelo es un test de presencia sobre el transcript, no un conteo** (7 de 7). La evidencia la escribió
   el lead y el lead está entero en el contexto: verificar es RELEER, no recordar. Por eso un suelo es
   ejecutable y un cupo global no.
2. **Los elementos se asignan a una fase, nunca a un banco global** (7 de 7; ninguna de las 6 referencias
   tenía una sección tipo `<coach_preguntas_clave>`). El runtime inyecta la fase activa cada turno, así que
   una regla escrita dentro de su fase se re-lee cada turno; un banco global se lee una vez y se diluye.
3. **Los techos son locales y nunca gobiernan la cualificación** (7 de 7 tienen techos; 0 de 7 los ponían
   sobre las preguntas del entrenador). **La asimetría que lo explica todo**: los seis coaches tienen cuotas
   globales igual de inejecutables que la de Frodo — pero sobre TICS DE ESTILO (emojis, "tío", muletillas).
   Cuando falla una cuota de voz sale un emoji de más; cuando falla una de cualificación se vacía el embudo.
   Frodo era el único que puso su cuota sobre la palanca estructural. Y el modo de fallo es asimétrico hacia
   abajo: ante la duda de si ya gastó el cupo, el modelo calla — pasarse es una infracción visible, quedarse
   corto no.
4. **El anti-interrogatorio se sostiene en la FORMA del turno, no en el número de preguntas** (7 de 7).
   Ninguna referencia baja el número de elementos exigidos para no sonar a formulario: lo que relajan es el
   CÓMO, nunca el CUÁNTO.
5. **Aporte o criterio propio intercalado entre las preguntas** (4 de 7, y era el hueco más grande de Frodo).
   Miguel y Beatriz pueden pedir 4-5 preguntas seguidas *precisamente porque* entre ellas va el criterio del
   entrenador. El banco de Frodo eran 6 preguntas seguidas con cero líneas suyas en medio: por eso sonaba a
   audit hiciera las que hiciera, y por eso la ronda de julio recortó preguntas cuando el problema era la
   ausencia de aporte.

Cambios aplicados (`prompts/coach-engineering/academia/frodo.md`):

- **Fuera el preámbulo.** Las dos `## REGLA DURA` que vivían ANTES de `<coach_identity>` se repartieron en el
  esquema: la de cierre → cabecera de `<coach_wclose>` (donde el modelo la lee justo antes de redactar el
  cierre; **no** a `<coach_qualification_doesnt>`, que es de donde se subió el 15-jul precisamente porque
  allí no se cumplía); la de señal de compra → `<coach_senal_de_compra>`; la excepción del primer mensaje →
  fundida en F1. El fichero abre ya en `<coach_block>` + `<coach_identity>`, como los otros seis.
- **`<coach_preguntas_clave>` borrado → `<coach_discovery_gate priority="highest">`.** Suelo de **5
  elementos** (E1 objetivo aterrizado · E2 lo que le falta · E3 por qué le importa · E4 prioridad ahora ·
  E5 necesidad de guía), cada uno con su par CONSTA / NO cuenta y su molde en la voz de Frodo. **Fuente
  única del suelo**, una sola puerta (el puente F4), estándar de prueba por citas (reutiliza el test
  anti-invención del voiceprint) y las fases como ETIQUETA de dónde se cierra normalmente cada elemento,
  no como puertas de transición (eso creaba deadlocks).
- **Las 6 preguntas del entrenador dejan de ser un banco racionado y pasan a ser los instrumentos del
  suelo**: la 1 es E2, la 2 abre E3, la 3 es E4, la 4 cierra E3, la 5 es E5. La 6 (encaje) se degrada a
  movimiento opcional pre-puente que no cubre casilla — no medía nada, era un trial close emparejado por
  error con la 5. Se levantó el veto "nunca las dos" y se sustituyó por una regla de ritmo ejecutable
  (nunca dos hipotéticas en turnos consecutivos).
- **Señal de compra degradada**: de *"PROHIBIDO sacar otra pregunta de descubrimiento"* a **comprime, nunca
  saltes** (fórmula literal de Alfonso, Miguel, Pepe y Roberto). En un canal donde preguntar el precio es la
  conducta modal, la regla anterior convertía al lead más caliente del embudo en el peor cualificado.
- **Sub-tipo E — APORTE** en `<coach_tone_openers>`: media frase con el criterio de Frodo antes de la
  pregunta, con ventana móvil (1 cada 3 mensajes) y **blindado** contra el gate no-método, CR4, §21 y el
  test anti-invención. Es lo que permite subir el suelo sin que suene a audit. ⚠️ Los tres ejemplos están
  construidos con lo que su propio bloque ya declara que él defiende — **pendiente de que Frodo los valide
  o los reescriba con los suyos**.
- **Contrapesos obligatorios de §31**, los dos: **TOPE GLOBAL de 9 preguntas de F2 al puente** (manda sobre
  TODOS los topes parciales, techo por elemento incluido; Alfonso tiene 8 pero con un suelo de 4, no de 5)
  y **"que te falte una casilla NO descualifica"**, escrito en el gate y en `<coach_qualification_doesnt>`.
- **`<coach_tone_contrast>`** (faltaba, la pide el checklist): 3 pares genérico→Frodo, uno de ellos del
  sub-tipo E.
- **Cuarto estado terminal** para el lead que contesta pero no se abre (el modal de este avatar): ni cierre
  ni bucle de preguntas → **parada en abierto** (`lead_no_se_abre`). Sin él, subir el suelo canjeaba un
  problema de timing por pérdida de pipeline.
- **F3 sube su hard cap de 2 a 3 mensajes** (cierra hasta tres elementos; con dos, el bloque se auto-cerraba
  antes de cualificar) y se borran sus tres supresores (*"eliges como mucho DOS"*, *"si dudas haz una
  menos"*, *"puente aunque te queden opciones sin usar"*).
- **Migración a §30**: todas las paradas emiten ya `manual_attention` + `skip_reply` (motivo snake_case).
  Fuera `handoff_to_human` y los Tipo A/B/C/D. **Antes de esta ronda Frodo tenía CERO paradas ejecutables**
  y F6 aplicaba `manual_attention` solo, que marca pero no calla.
- **`<coach_identity_notia>`**: aplicada la directiva del 03-ago — ya no niega ser una IA
  (*"soy frodo tío, estoy aquí viendo la conversación"*); apagado mudo con `deteccion_ia`.
- **Precio**: la segunda insistencia ya no nombra la llamada antes de F5 (§26). Dos ramas, una antes de F5
  y otra de F5 en adelante, las dos con parada.
- **Equivalencias declaradas** (pieza de Andrea): los tres moldes del bloqueo (*"qué sientes que te falta"*
  / *"cuál es el mayor bloqueo"* / *"qué te frena ahora"*) se declaran LA MISMA pregunta, que es lo que
  hace operativa la cláusula de no-repreguntar. Y E3/E4 rotan de palabra clave para no sonar repetidas.
- **UNA SOLA PREGUNTA POR MENSAJE** al voiceprint, con la excepción declarada del par "cuánto mides y
  cuánto pesas".

**Aritmética real** (§31 la exige, y la primera versión de esta ronda la hizo mal — el 7 se eligió como
número redondo). Contando TODO lo que el lead recibe: 5 elementos + follow-up de E3 + tirón de E4 + tirón
de E5 + proyección de E3 + mides/pesas ≈ **9 en el peor caso**, que es el tope. El lead que se abre cierra
en 5-6, porque la mayoría de elementos se RECOGEN de lo que va contando. Tres correcciones salieron de
verificar esto contra simulaciones, y las tres eran bloqueantes:
1. **El tope (7) era menor que el mínimo obligatorio (8-9)** y su enumeración se dejaba fuera tres
   movimientos que el propio bloque declara obligatorios. Con el 7, ninguno de los tres perfiles de lead
   llegaba al puente. → tope 9 + lista de lo que NO cuenta contra el techo por elemento.
2. **E4 no tenía reparación.** "Bastante" es la respuesta modal de un hombre parco a *"cuánto de importante
   es esto para ti"* — la pregunta estaba diseñada para provocar justo la respuesta que ella misma
   rechazaba, y E3 y E5 sí tenían su follow-up nominado. → tirón de su palabra, una sola vez.
3. **La salida por tope enrutaba al lead ABIERTO por el camino del lead CERRADO** y acababa apagando la IA
   sobre alguien que sí se estaba abriendo. → `SALIDA POR TOPE ALCANZADO` bifurcada: si suelta cosas
   citables, el tope cede ante el suelo; si no, la pregunta súper abierta. La parada `lead_no_se_abre` es
   solo para quien no suelta nada citable, **jamás para el que habla**.
Más: F3 sube a 4 mensajes (no cabía en 3 con "una sola pregunta por mensaje"), se declaró que cualquier
formulación del freno ES E2 (había diez moldes vivos y solo tres declarados equivalentes), y se limpiaron
exemplars que enseñaban lo contrario de la regla (§8): "eso de…" como cabecera del sub-tipo E, un "y qué"
de arranque, dos ejemplos de F1 que preguntaban el objetivo en el turno 1 y el permiso de mides/pesas en
F1 que contradecía tres reglas.

**Método que se repite y conviene tener a mano**: es la **tercera vez** que un trainer reclama lo que la
ronda anti-interrogatorio le había borrado — Beatriz (el bloque de método, 28-jul), Miguel (*"se queda
corto al final"*, el tope estaba escrito en el bloque, 31-jul) y ahora Frodo. Antes de recortar preguntas
por §19, comprobar si lo que sobra es el CUÁNTO o el CÓMO. Casi siempre es el cómo.

### Procedencia de las 6 preguntas, y los tres vetos de Iván (reconstruido 2026-08-03)

Iván aportó el listado original que entregó Frodo, con sus propios ajustes encima. **La conversación en la
que se metieron esos ajustes NO es recuperable**: no hay sesión indexada en el rango 24–29 jul para este
repo, la ronda no tiene commit propio (entró dentro de `ae1cddf`, 30-jul, "versionar Alex, Beatriz y Luis
Royán + rondas de Alfonso y Frodo") y ya constaba en este loop que se documentó a posteriori reconstruida
del diff, sin fichero de feedback en `Downloads/`. Lo que sí es recuperable, y es mejor evidencia, son las
**decisiones**, verificadas por grep contra la versión commiteada:

| En el listado de Frodo/Iván | Qué pasó al bloque |
|---|---|
| "qué sientes que te está faltando ahora mismo?" | entró como canónica 1 |
| "¿Por qué ese objetivo es importante para ti en este momento?" | entró como canónica 2 |
| "¿Es algo importante para ti?" | entró como versión corta de la 3 |
| "¿Por qué motivos has decidido solucionarlo ahora?" | fundida con la 2, no entró literal |
| "qué es lo que te ha hecho decidir que ahora sí…" | entró ACORTADA: *"qué te ha llevado a querer ponerte ahora con esto?"* |
| "Si tuvieras un plan adaptado a ti y alguien que te guiara…" | entró tal cual (canónica 5) |
| "Si dentro de 6 meses siguieras exactamente igual…" | entró (canónica 4) |
| **"¿Cuánto de importante es esto… del 1 al 10 por ejemplo?"** | entró **sin la escala**. `del 1 al 10` = 0 apariciones |
| **"…con el mismo peso o incluso hubieras ganado algún kilo más"** | **fuera**. 0 apariciones |
| **"…estarías dispuesto a comprometerte y hacer lo que sea necesario?"** | entró con el compromiso **quitado** → *"lo verías como indispensable"* |
| **"¿qué es lo que más te motiva a cambiar tu situación?"** | **nunca entró**. 0 apariciones |

**Los tres vetos son doctrina de Iván, no despistes.** La escala numérica está corroborada en otras dos
sesiones: Alfonso 06-jul (*"quité el 'del 1 al 10' de F3, era lo más salesy"*) y Miguel 31-jul (*"la escala
numérica sigue prohibida"*). La variante del peso choca con CR4 (no valorar su cuerpo). El compromiso antes
de haber propuesto nada es venta prematura (§15). Los tres quedan ahora escritos en el bloque como
prohibición acotada, en el elemento que les toca — no como advertencia suelta.

**Lo que se incorporó al cerrar esto** (03-ago, misma ronda):
- **E3 pasa de 2 moldes a 4**, los cuatro declarados equivalentes: lo que gana / lo que le mueve
  (*"qué es lo que más te motiva a cambiar tu situación?"*, la que nunca se usó) / el detonante temporal /
  el motivo AHORA. Rotar entre conversaciones: con un solo molde, todas las conversaciones suenan iguales
  (§8). Y de paso *"qué te ha llevado a querer ponerte ahora con esto"* deja de ser una pregunta huérfana
  fuera del presupuesto: ahora es E3 declarado.
- **E4 recupera su versión corta** (*"es algo importante para ti de verdad?"*), que se había perdido al
  disolver el banco.
- **Los tres vetos, escritos donde tocan**: escala numérica prohibida en E4; la proyección se formula sobre
  cómo se vería o cómo se sentiría, nunca sobre kilos; la de encaje pregunta si lo VERÍA, nunca si se
  COMPROMETE.

**PENDIENTE**: que Iván lo despliegue en Automatía y lo pruebe; validar con Frodo los tres ejemplos de
aporte del sub-tipo E; decidir qué hacer con el literal de F5 (es el único mensaje del bloque con
mayúsculas y frases de 40+ palabras — de momento declarado como excepción, sin tocar).

---

**Ronda 2026-08-13 — "el objetivo se lo pasa por alto y el compromiso no lo pregunta" (feedback #22, vía Sergio Retuerto).** Dos quejas: (1) *"cuando hace la pregunta del objetivo hay mucha gente que no le responde a eso y le dice cualquier otra cosa y la IA lo pasa por alto y pasa a otra pregunta… ha agendado llamada y no sabemos ni qué objetivo tiene"*; (2) *"la pregunta de qué compromiso tiene del 1 al 10 tampoco lo está preguntando"*.

⚠️ **Lo primero de esta ronda no fue un cambio, fue un hallazgo: el fichero que Iván tenía en `Downloads/` iba 10 días por detrás del repo.** `Downloads/coach_block_frodo.md` (66.024 B) era byte-idéntico a `coach_block_frodo.pre-2026-08-05.bak.md` y correspondía al estado **pre-03-ago**: preámbulo de dos `## REGLA DURA` antes de `<coach_identity>`, `<coach_preguntas_clave>` con el `⛔ TOPE DURO: MÁXIMO 2 preguntas en TODA la conversación`, handoff en Tipo A/B/C/D y un `notia` que aún decía *"soy frodo tío"*. **Si eso es lo desplegado en Automatía, las dos quejas las causa esa versión y están ya resueltas en el repo desde el 03-ago**: sin suelo no hay nada que impida agendar sin objetivo, y la pregunta de importancia era la nº 3 de un banco racionado a 2 con cuatro capas de exclusión encima. La ronda se aplicó sobre `academia/frodo.md` (fuente de verdad) y el resultado se copió a `Downloads/coach_block_frodo.md` para desplegar.

**Y la petición de quitar el preámbulo ya estaba hecha**: el fichero abre en `<coach_block>` + `<coach_identity>` desde el 03-ago (gate de cierre → cabecera de `<coach_wclose>`, señal de compra → `<coach_senal_de_compra>`, excepción del primer mensaje → fundida en F1).

Lo que sí faltaba, y es el fallo nuevo que Frodo señala:

- **`⛔ PREGUNTADO NO ES CONTESTADO`** (nuevo, cabecera de `<coach_discovery_gate>`). El bloque tenía tres reglas empujando a NO volver sobre una pregunta (*no se repregunta lo ya contestado*, *anti-bucle*, *E1 se aterriza UNA vez*) y **ninguna que distinguiera preguntado-y-contestado de preguntado-y-esquivado**. El modelo colapsaba los dos casos en "ya está" y avanzaba. Ahora: comprobación de una línea + recuperación en 2 pasos (recoges lo suyo → vuelves ACOTANDO, con la segunda rama abierta para no romper el gate de menú cerrado) + 4 moldes tipificados por tipo de evasión (circunstancia · pregunta de vuelta · genérico · su historia).
- **Las tres fronteras del mecanismo**, porque sin ellas la ronda se convierte en machaque (el feedback contrario, que ya costó una ronda): **recuperar ≠ repreguntar** · **recuperar es cambiar el ÁNGULO, no el arranque** (de Pepe/Gonzalo) · **negar ≠ esquivar** (de Alfonso/Gonzalo: *"no sé"* es una RESPUESTA, se acepta a la primera — y **cierra el intento, no la casilla**).
- **E1 blindado**: `⛔ E1 NO SE APLAZA NUNCA A LA LLAMADA` + se le retira la salida por tope (que decía literalmente *"tiendes el puente con lo que SÍ consta y esa casilla se cierra en la llamada"* — o sea, agendar sin objetivo, autorizado por escrito). Y **cuarto estado terminal nuevo**: `sin_objetivo_claro`, para el lead que HABLA pero nunca aterriza — hueco que no resuelve ningún coach de la flota, porque `lead_no_se_abre` está vedado "jamás para el que habla" y sin esta salida E1-sin-salida creaba deadlock.
- **E1 con equivalencias declaradas** (las tenían E2 y E3, no E1) — el bloque usaba 4 formulaciones de E1 sin marcar, así que el modelo no podía saber si ya la había preguntado.

**Los tres bugs de E4 (la queja del "compromiso"), dos preexistentes y uno introducido en esta misma ronda:**
1. **`"cómo empezamos"` contaba dos veces**: estaba en la lista de "E4 CONSTA sin preguntarlo" **y** en `<coach_senal_de_compra>`. Es el **bucle auto-cumplido de §31.4** en estado puro — *el lead más caliente del embudo era exactamente el que nunca recibía la pregunta de compromiso*. Retirado: **pedir avanzar es interés, no prioridad**; dispara la compresión, no cubre la casilla. E4 nombrada aparte en "lo que NO anulas nunca".
2. **El tirón de E4 preguntaba por el problema, no por la prioridad** (*"qué es lo que más te pesa de eso ahora mismo?"* — territorio E3, y casi idéntico al follow-up de E3, que además viola su propia regla de no repetir palabra clave). Sustituido por el molde de Beatriz Juan: *"qué hace que ahora mismo no sea del todo prioridad para ti?"*.
3. **`CUÁNDO: después de la proyección de E3`** — escrito por mí al principio de esta ronda, y mal: la proyección de E3 **solo existe si E3 quedó abierto**, así que en la conversación BUENA el ancla de E4 no se disparaba nunca. Corregido a *"en F3, en cuanto E3 esté cerrado — con proyección o sin ella"*.

**El "del 1 al 10" NO entra** (cuarta vez que se sostiene el veto: Alfonso 06-jul, Frodo 29-jul, Miguel 31-jul, ahora). Lo que se le devuelve a Frodo es el elemento funcionando: E4 con `⛔ NO SE OMITE POR ECONOMÍA`, un molde nuevo de rotación (*"hasta qué punto es prioridad para ti ahora?"*), momento fijado y tirón que apunta a la prioridad.

**Humanización — §32 metida dentro del bloque** (la doctrina no se despliega a Automatía, [[feedback_coach_doctrina_no_llega_al_prompt]]): TEST DE CATÁLOGO + **Sub-tipo F "algo tuyo"** (su autoridad es haber vivido el rebote, y era el canal sin usar) + variante *observación del mundo* dentro del sub-tipo E, en su registro seco (sin risas escritas) + cinco reglas cortas con sus pares ❌→✅ pegados (valorar≠constatar · cerrar la referencia · anunciar el giro · cuestionar la premisa con §32.1 dato-vs-decisión · decir "objetivo") + **§32.2** como segunda excepción declarada a "una sola pregunta por mensaje", atada al mismo test que ya pasa el molde de E1 (la segunda rama queda abierta).

**Método — la minería como herramienta de auditoría.** Se minaron en paralelo los 8 coaches de referencia buscando mecanismos de reconducción, humanización y prioridad-sin-escala. **El 80% ya estaba en Frodo**; el valor no fueron las importaciones, sino que **la comparación hizo visibles dos bugs internos suyos** (los E4 1 y 2 de arriba) y uno recién introducido. Descartados con argumento: la mejor pregunta de prioridad del corpus (Alfonso) es una binaria de dos puertas y Frodo **ya gastó su única excepción** al menú cerrado en la lente "puedo solo"; el peldaño *"cómo lo estás planteando"* de la escalera "voy solo" rompe su gate no-método; un gate de salida de fase crearía un segundo umbral contra §31.2.

**Tamaño**: 85.634 → 97.207 B. **No cumple la directiva de encoger** ([[feedback_coach_marco_no_prohibiciones]]): ~3,3 KB son la escalera `<coach_objections_solo>` que entró en paralelo ese mismo día, y ~8 KB son de esta ronda contra ~2,5 KB recortados (dedupe de F1/F2/F3 massage contra el gate, `<coach_direccion>` reglas 2-4, `<coach_tone_contrast>` reducido a un par según la forma canónica de Pepe). Deuda declarada: quedan ~4 KB de ejemplos duplicados entre `<coach_tone_openers>` y `<coach_tone_exemplars>` que son recortables, pero son VOZ y necesitan el ojo de Iván.

⚠️ **Ese mismo 13-ago otra sesión estaba editando en paralelo los coaches de la academia** (pepe → alfonso → roberto → frodo → gonzalo), propagando la escalera del "voy solo". En Frodo entró `<coach_objections_solo>` (dos peldaños, sin el de método, correcto) + los enganches en `<coach_qualification_lentes>`, `<coach_qualification_doesnt>` y `<coach_objections_avatar>`. **No se tocó** desde esta ronda. Lleva sellos de fecha "(12/08)" que son meta-comentario y el [[feedback_coach_marco_no_prohibiciones]] §5 los quita.

**PENDIENTE**: (a) **confirmar qué versión está desplegada en Automatía** — si es la de `Downloads/` pre-03-ago, media queja de Frodo se cae solo con desplegar; (b) desplegar y medir; (c) validar con Frodo los ejemplos de aporte del sub-tipo E y los del nuevo sub-tipo F (son de mi cosecha, construidos con lo que su bloque ya declara que él defiende); (d) decidir si el veto del 1 al 10 se le explica a Frodo o se le enseña una transcripción con E4 ya preguntada.

---

## Ronda 2026-08-25 — LA CADENA DE RUBÉN, la fase de contexto y los dos criterios mínimos

**Encargo de Iván**: *"le está llegando gente muy poco cualificada"*. Aplicar a Frodo lo aprendido con
Alfonso en la ronda del ritmo (reunión Rubén 24-ago) — el enrutamiento de la conversación y los criterios
mínimos de cualificación —, priorizando **importancia y urgencia**: que a la llamada solo llegue quien
tiene un cambio que le importa y lo quiere AHORA, y que a quien tiene poca consciencia se le suba.

Fichero autoritativo: [`prompts/coach-engineering/academia/frodo.md`](../../prompts/coach-engineering/academia/frodo.md),
espejado en `Downloads/coach_block_frodo.md`. Backup: `coach_block_frodo.pre-2026-08-25.bak.md`.

### Diagnóstico: por qué se colaba gente sin cualificar

Cinco causas, y cuatro estaban escritas en el bloque:

1. **No existía la fase de CONTEXTO** y el bloqueo se preguntaba sin ella. La cadena era objetivo → porqué
   → bloqueo. Es la queja literal de Rubén sobre Alfonso: *"el freno se pregunta sin contexto delante"*, y
   por eso las frases del setter valen para cualquiera.
2. **Una puerta trasera en el suelo.** `SALIDA POR TOPE ALCANZADO` decía, con todas sus letras, *"tiendes el
   puente con lo que SÍ consta y esa casilla se cierra en la llamada"*. Solo E1 estaba exceptuada — así que
   la necesidad de acompañamiento, **criterio mínimo declarado**, podía aplazarse a la llamada. La casilla
   que decide si hay cliente era la más fácil de saltarse.
3. **La urgencia no era un paso.** El RECORRIDO ("cuánto llevas con esto") vivía como UNA de cinco opciones
   sueltas de F1, no como elemento. Y el "por qué ahora" era 1 de 4 moldes equivalentes del porqué, así que
   podía no salir nunca.
4. **El gate no-método autorizaba justo lo que Rubén prohibió.** F2 decía *"✅ SÍ: vienes entrenando?,
   cuántos días te mueves?"* — la frase que Rubén nombró expresamente como lo que NO hay que preguntar en
   este avatar (el hombre con un método que defiende). Venía de §33, propagada sin el test por avatar.
5. **La licencia de las dos puertas.** El molde del objetivo estaba bendecido dos veces (*"NO es menú
   cerrado, va tal cual"*) y el desambiguador que ACOTA estaba declarado excepción legítima en el
   voiceprint — la misma bendición que en Ángel produjo el tic entero.

### La cadena nueva: 6 elementos en orden, con el contexto delante del bloqueo

| | Elemento | Dónde cierra |
|---|---|---|
| **E1** | objetivo aterrizado | F2 |
| **E1b** | **recorrido** — cuánto lleva con ese objetivo (nuevo, pegado a E1) | F2 |
| **E2** | por qué le importa e impacto en presente (era E3) | F2/F3 |
| **E3** | **contexto — su VIDA, nunca su MÉTODO** (nuevo) | F2 |
| **E4** | bloqueo en presente (era E2), **con su objetivo dentro y abierto por defecto** | F2 |
| **E4b** | **la curiosidad encima del bloqueo, al PORQUÉ nunca al QUÉ** (nuevo) | F2 |
| **E5** | **importancia y urgencia** (era E4) | F3 |
| **E6** | intención de que le ayuden (era E5) | F3 |

Renumeración completa verificada por grep; cero punteros huérfanos. Las dos primeras piezas son adaptables
(si entra contando su día a día, se sigue por ahí); **lo único que no se reordena es que el contexto va
ANTES del bloqueo**.

### Lo que entra, punto por punto

- **`E3 CONTEXTO` con la frontera dura**: se pregunta lo que hay ALREDEDOR de su objetivo (a qué se dedica,
  horarios, viajes, críos, comidas fuera); lo que HACE CON su objetivo (rutina, días de entreno, qué come)
  lo valora Frodo en la llamada, *porque en cuanto se lo preguntas se pone a defenderlo*. Hasta 2 preguntas,
  y la mayoría de las veces cero porque llega solo. El par mides/pesas **entra aquí** y ocupa una de las dos.
- **El bloqueo, como lo pide Rubén**: la pregunta lleva SU OBJETIVO dentro, va ABIERTA por defecto (apuntar
  baja de norma a variante), una categoría amplia ya cierra el paso, y se formula en **lenguaje de progreso**
  (*"dónde ves tú que hay más margen de mejora?"*), no de derrota — marco 1 de
  [[feedback_coach_naturalidad_marcos_ivan]].
- **Las dos puertas, a instrumentos**: retirada la línea que bendecía el molde del objetivo y retirada la
  excepción del desambiguador. Regla nueva, binaria y comprobable mirando el mensaje que se escribe: *si tu
  pregunta ofrece dos respuestas, cortas la que sobra y te quedas con **la que más abre***. `"tienes una
  cifra en mente o cómo te gustaría verte?"` → **`"cómo te gustaría verte tú?"`** (el caso exacto que Iván
  resolvió el 24-ago). Sobreviven dos, las dos declaradas instrumentos: la lente "puedo solo" y el paso 1 de
  expectativa-vs-realidad.
- **E5 = importancia Y urgencia**, con `⛔ NO SE OMITE POR ECONOMÍA` y su momento fijado (en cuanto E2
  cierra). Sigue sin escala numérica: quinta vez que se sostiene el veto.
- **E6 estrena el filtro de intención de Rubén, con las dos palancas**: *"si para quitarte esa barriga
  hubiera que ajustar algunos puntos del entreno y de la alimentación, sin que te suponga un cambio drástico,
  estarías dispuesto a verlo y saber cómo sería?"*. Sustituye a la vieja *"si tuvieras el plan hecho y alguien
  marcándote, te sería más fácil?"*, que preguntaba por la facilidad, no por la disposición. Las tres piezas
  que no se pierden están escritas en el bloque, y **"a verlo y saber cómo sería" ya es la videollamada, así
  que encadena sola con F5**.
- **`LA PREGUNTA HACE PENSAR`** (la pieza que sube la consciencia): *la mayoría llegan con un titular y con
  la idea de que ya se lo saben; lo que les hace verlo es la pregunta que les obliga a mirarlo, nunca una
  explicación tuya*. Y la lente expectativa-vs-realidad deja de ser solo lente: es el ángulo (b) de E2.
- **`⛔ ALTO`** (no lo tenía; lo tienen Alfonso y Ángel): ante impaciencia con las preguntas se deja de
  preguntar y lo que falte se fusiona en la respuesta. Es el contrapeso que §31 exige por subir un suelo.
- **Se cierra la puerta trasera**: *"ninguna casilla se cierra en la llamada: lo que no consta en el chat,
  no consta"*. La `SALIDA POR TOPE` bifurcada desaparece y se sustituye por el router de Alfonso (NO SE ABRE
  → súper abierta → parada `lead_no_se_abre` · NO LO NECESITA → puerta B).
- **Gate en la escalera del "voy solo"**: *hay recorrido que espejar?* Si acaba de decir que no ha empezado,
  no aplica. Es el fallo que salió en el primer test real de Alfonso, importado antes de que pase aquí.
- **La objeción de tiempo deja de negociar horas** (*"aunque sea un par de horas a la semana"*, fuera): se
  reconoce la barrera sin darle la razón y se pregunta por la POSIBILIDAD (marcos 3 y 4 de Iván).

### Aritmética del presupuesto (§31 la exige)

**Techo 9**, el mismo número que antes pese a subir el suelo de 5 a 6 elementos, porque los follow-ups dejan
de contarse aparte: *1) objetivo · 2) recorrido · 3) porqué · 4) contexto · 5) contexto B solo si la primera
no dio nada · 6) bloqueo · 7) curiosidad · 8) importancia · 9) intención*, más UNA reacción-con-pregunta a
algo personal. No se suman, porque son la forma que toma la pregunta de su paso: el follow-up del porqué, la
proyección de E2, los tirones de E5 y E6, mides/pesas, la lente "puedo solo" y la pregunta que reconduce una
objeción. Lo normal es bastante menos: la mitad las contesta sin que se pregunten.

### Poda — la ronda deja el bloque más corto

Directiva [[feedback_coach_marco_no_prohibiciones]] cumplida, y esta vez con un elemento nuevo dentro:

| | antes | después |
|---|---|---|
| Bytes | 99.487 | **99.398** |
| Líneas | 871 | **809** |
| Marcadores de prohibición/alerta | 86 | **74** |
| Topes | 34 | **27** |

De dónde salió: `coach_tone_exemplars` −3,2 KB (la galería de sub-tipos A-F duplicaba
`coach_tone_openers` literal a literal; se queda la de openers, y exemplars pasa a ser por FASE y por
ELEMENTO, que es lo que allí no estaba) · fuera el bloque "LO QUE DELATA A UNA IA", cuyos cinco puntos ya
estaban en voiceprint y variety · las cuatro "reglas mecánicas de alternancia" reenunciaban la lista RELEE
de encima, y muere la cuota de muletillas por ventana de 5 mensajes (contador entre turnos, inejecutable) ·
`PUERTA DEL PUENTE` + `COMPROBACIÓN` + `BIDIRECCIONAL` eran tres líneas seguidas diciendo el mismo suelo ·
la comprobación mental estaba en el gate y otra vez en F4 · el gate no-método vivía en F2 y en el gate, la
regla del menú cerrado en tres sitios y "toda parada es invisible" en tres. Y fuera los sellos de fecha
"(12/08)", que son meta-comentario.

### Pasada adversarial — lo que se rompió al aplicar

Cuatro junturas cazadas antes de entregar ([[feedback_coach_ronda_verificacion_adversarial]]):

1. **La puerta B mandaba cerrar sin pasar por el `GATE DE CIERRE`**, que exige una reconducción previa.
   Resuelto nombrando cuál es la reconducción en cada caso: la lente expectativa-vs-realidad, o la escalera
   del "voy solo", que va ANTES y es obligatoria.
2. **`falta de urgencia NO descualifica`** en `coach_qualification_doesnt` chocaba de frente con E5.
   Reescrito a *"que todavía no te haya dicho cuánta prisa le corre"*: la ausencia no cierra, la negativa
   verbalizada sí.
3. **Un exemplar de F1 preguntaba el freno** (*"qué es lo que más se te resiste ahora?"*) antes del contexto,
   contra la cadena y contra la propia regla dura de F1. Cambiado a recorrido.
4. **Un arranque de pregunta con "y"** sembrado en F1 (*"y con ese horario, cómo te apañas?"*), el tic que
   la ronda de julio persiguió.

Más el ejemplo ✅ del voiceprint, que seguía siendo la pregunta de bloqueo desnuda, sin objetivo dentro.

### Colateral, fuera de Frodo

`doctrina-universal.md` §33: la fila *"si se mueve algo y cuántos días"* de la tabla CONTEXTO contradecía la
corrección de Rubén del 24-ago para este avatar. El párrafo de encima ya trae el test por avatar, pero la
tabla se leía sola; queda acotada. **Importa porque quedan 7 coaches pendientes de esta ronda y heredan de
ahí.**

### Batería de pruebas para el simulador

Señales de fallo transversales, invalidan la respuesta salga en el test que salga: **preguntar el freno sin
contexto delante** · una pregunta con **dos opciones dentro** fuera de las dos instrumentales · preguntar
**qué entrena, cuántos días o qué come** · **dos preguntas en un mensaje** · repreguntar algo ya contestado ·
tender el puente **sin E5 o sin E6** · abrir una pregunta con **"y"** · usar **"qué te aportaría"** o la
escala del 1 al 10 · nombrar la videollamada antes de F5.

**A · El camino bueno.** `buenas! llevo viendo tus vídeos y quiero quitarme la barriga de una vez` → F1
conexión, nada de objetivo todavía. `pues llevo así desde que nació el peque, 2 años ya` → recorrido
CONSTA, y el porqué. `me da corte quitarme la camiseta en la playa` → el porqué CONSTA, **toca CONTEXTO**,
no el freno. ⛔ Falla si le pregunta qué le frena aquí. `trabajo a turnos y llego reventado` → contexto
CONSTA → el bloqueo **con su objetivo dentro y en lenguaje de progreso**. `la comida, sobre todo` → bloqueo
CONSTA (categoría amplia, cierra el paso) → curiosidad al PORQUÉ. Después E5 y E6, y puente.

**B · El que pide precio en el mensaje 2.** `cuánto cuesta?` → literal de precio y retoma la cadena por
donde iba. ⛔ Falla si tiende el puente, si suelta la propuesta, o si da por cubierta E5: *pedir avanzar es
interés, no prioridad*.

**C · El que va contento.** `entreno 4 días y como bien, te sigo por los vídeos` → lente
expectativa-vs-realidad, paso 1. `no, voy contento, no cambiaría nada` → puerta B, y **antes de cerrar** se
comprueba el gate de cierre. ⛔ Falla si le busca un dolor, si le pinta un futuro peor o si le propone la
llamada.

**D · Lo suelta todo de golpe.** `tengo 41, quiero bajar 12 kilos, llevo dos años diciéndomelo, curro 10h
sentado y solo ya he visto que no puedo` → constan objetivo, recorrido, contexto, intención y medio porqué.
⛔ Falla si repregunta cualquiera de esos. Lo que queda: el bloqueo, la curiosidad y **E5**.

**E · El que esquiva el objetivo.** `es que con el curro no me da la vida`, a la pregunta de objetivo →
recuperación por otro ÁNGULO, una vez. Si sigue sin aterrizarlo, **parada `sin_objetivo_claro`**, nunca el
puente. ⛔ Falla si agenda.

**F · "Me lo voy a montar yo solo".** → escalera de `coach_objections_solo`, con el **gate de recorrido**
delante. ⛔ Falla si la abre con un lead que acaba de decir que aún no ha empezado, y falla si le suelta a la
primera.

### Pendiente

- **Desplegar en Automatía y medir.** Sigue sin confirmarse qué versión está desplegada (arrastrado de la
  ronda del 13-ago): si es anterior al 03-ago, parte de la queja se cae sola con desplegar.
- **Decisión de Iván sobre F5.** El literal de la propuesta sigue siendo el del entrenador (un párrafo con
  mayúsculas y frases largas, la excepción declarada del voiceprint). La propuesta en 4 movimientos
  ([[feedback_coach_propuesta_cuatro_movimientos]]) es la siguiente palanca obvia para la asistencia a
  llamada, pero es reescribir el mensaje de Frodo: **no se toca sin su OK**.
- **Validar con Frodo** los ejemplos del sub-tipo E y F (siguen siendo de cosecha propia, construidos con lo
  que su bloque declara que él defiende) y los literales nuevos del contexto y del bloqueo.
- **Los otros 7 coaches de academia**, con la cadena y con el test por avatar de §33.

Recall si vuelve feedback de Frodo o se toca su bloque.
