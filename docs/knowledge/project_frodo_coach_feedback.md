---
name: project_frodo_coach_feedback
description: "Loop del bloque COACH Frodo (academia/Automatía, hombres recomposición corporal); estado tras la ronda 2026-08-03 (el tope duro de 2 preguntas amordazaba las preguntas del propio entrenador → sustituido por <coach_discovery_gate>, suelo de 5 elementos; preámbulo repartido en el esquema; paradas migradas a §30). Archivo autoritativo: prompts/coach-engineering/academia/frodo.md. Recall si vuelve feedback de Frodo."
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

Recall si vuelve feedback de Frodo o se toca su bloque.
