---
name: project_alfonso_coach_feedback
description: Loop de reconciliación del bloque COACH Alfonso (academia/Automatía) por feedback; estado y decisiones no obvias tras la ronda 2026-07-06.
metadata: 
  node_type: memory
  type: project
  originSessionId: 698d226d-c98c-4e68-a968-6105ed2033a5
---

Alfonso = coach academia/Automatía (hombres 35-55, pérdida de barriga/flotadores, poco tiempo), formato full-XML `<coach_block>`, hermano de Chema/Roberto/Juan Gil. **NO es coach_v5 del SaaS Fyzon**; Iván lo carga a Automatía él mismo. Fuente: `C:\Users\sotob\Downloads\coach_block_alfonso.md`. Mismo loop que [[project_chema_coach_feedback_loop]]: informe → Iván aprueba → script Python (conteo + diff -u, CRLF-safe) → backup `*.pre-<fecha>.bak.md`.

**Ronda 2026-07-06** (feedback de 9 puntos del cliente, aprobado). Diagnóstico = el de Rubén ([[feedback_coach_direccion_bloqueos]]): el tono está bien, falla la DIRECCIÓN. Voz/voiceprint intacta; sólo dirección/estructura/flujo. Decisiones no obvias que quedan grabadas en el bloque:

- **Flujo de agendamiento invertido**: la IA ya NO envía el WhatsApp de Alfonso. Se **reactivó la Fase 6** = recogida de datos: tras un "sí" real a F5 → pedir teléfono del lead → pedir franja (mañanas/tardes) → cerrar "te escribo yo" → handoff Tipo A `handoff_cause="datos_agenda_recogidos"` (antes `agendamiento_whatsapp_completado`). Alfonso contacta él; no se cierra día/hora concretos; el enlace Google Meet lo manda Alfonso fuera del chat. `call_scheduling_link_sent` eliminado.
- **`coach_main_link_type` = `human_handoff`** (antes `whatsapp`); el número 684 79 99 45 queda como dato INTERNO "nunca enviar". **PENDIENTE confirmar con Iván** cómo consume Automatía ese campo (si con `whatsapp` lo auto-enviaba, el cambio evita el envío).
- **F2 reescrita a los 3 puntos** en modo cómo-no-qué ([[feedback_coach_fase2_como_no_que]]): aterrizaje → por qué + curiosidad mismo hilo → bloqueo en presente. "4 interacciones" mínimas suavizado; "amplificación de consecuencias" pasó de futuro ("dentro de un año") a **coste presente como pregunta** (nunca afirmación = invención).
- **Colaterales corregidos**: criterios de cualificación 2 y 3 (entrenamiento/alimentación) → "se valoran en la llamada, no se preguntan en chat" (chocaban con gate no-método); el ejemplo del trigger que usaba la frase prohibida por F5 reescrito.
- **Reglas de dirección añadidas** en `coach_special_protocols`: profundizar antes de aportar (con deslinde anti-drilling + excepción fast-track), reutilizar info del lead, CTA en cada mensaje no-cierre (con exenciones), validación específica no genérica.
- **Cero placeholders de autor**: F1 outbound, F1 halago, F4 puente, F5 estructura y enlaces secundarios quedan escritos (regla dura de Iván: nunca dejar corchetes de "adaptar").

**Ronda 2026-07-06b** (tras 1er test de Iván en el simulador Automatía): correcciones de VOZ. (1) El setter abría casi todos los turnos con "Vale tío," — la causa era que los 4 `coach_wclose` y un exemplar estaban SEMBRADOS con ese arranque; se scrubearon los seeds + regla dura (voiceprint + lista "delata a una IA"): prohibido abrir con "Vale tío"/"Vale, tío", "tío" máx 2 en mensajes dinámicos. "tío" bajado de ~18 a ~12 en el bloque (firma preservada en saludo F1 / propuesta F5 / cierre F6). (2) Prohibido "moverlo"/"empezar a moverlo"/"meterle mano" (Iván solo citó "moverlo"; incluí "meterle mano" por mismo registro — PENDIENTE que confirme si ese sí le vale); alternativas: "ponerte con esto/en serio", "ponerle remedio", "darle caña". Backup 2 = `coach_block_alfonso.pre-2026-07-06b.bak.md`. Observación no accionada: el setter también repite arranque "Y..." + reframe "no es solo X, es Y".

**Ronda 2026-07-06c** (2º test): mejora del tramo de CIERRE (workflow 5 agentes: 3 drafts + judge + verify). (1) Nuevo **trial-close** de disposición como paso propio entre F4 y F5 (mide "¿le verías sentido a explorar solución para tu caso?" sí/no, sin pedir intención de compra; protege la propuesta para que no llegue en frío). (2) **Puente F4 más rico** (objetivo+porqué+cuello de botella+lo personal) con verificación SOLA (prohibido meter condicional dentro, fue lo que lió al lead). (3) **Propuesta F5 cristalina**: nombra la videollamada explícita con 5 datos (qué/con quién/45min/sin compromiso/para qué), antes quedaba vaga y partida. (4) **Puntos de conexión personal** (regla en special_protocols): cuando el lead suelta familia/trabajo/frustración → 1 reacción cálida + 1 pregunta cercana, 2-3 momentos en total, sin pescar ni interrogar; alimenta el puente F4. F3 pierde el "del 1 al 10". Backup 3 = `*.pre-2026-07-06c.bak.md`.

**Ronda 2026-07-06d** (3er test — salto de fondo): el setter ejecuta bien la mecánica de F2 pero "transiciona a interrogatorio", no conecta y NO hace ver el VALOR de la llamada (el lead simuló que no se metería). Doctrina clave (2 explores + workflow 5 agentes): el valor NO se construye vendiendo; se construye con **expectativa-vs-realidad** (§23/P4 Joseca: pregunta que le hace ver la brecha entre lo que hace y consigue → siente el coste sin dramatizar) + **insight/reencuadre** (§14: reencuadra su creencia sin reforzar ni educar, desplaza la causa persona→método → se siente entendido = diferenciación) + **conexión/flujo** genuinos. Cambios: (1) **MARCO RECTOR** al inicio del bloque (conversación que construye valor, no interrogatorio; 4 palancas; el lead debe QUERER la llamada porque conectó más, es el que se queda entre 6-7 setters). (2) Move **expectativa-vs-realidad** en F2 (sustituye la línea débil "coste presente" de la ronda a). (3) **Sub-tipo E (insight/reencuadre)** con ejemplos concretos (metabolismo lento / ya lo probé todo / no tengo tiempo). (4) **Connection upgrade** + "REGLA DE OÍDO" (3 preguntas seguidas sin reaccionar → modo máquina, reescribe) + F1 conecta antes de dirigir. (5) **Propuesta F5** atada a SU brecha + cierre cálido ("lo miramos juntos y ves tú si te cuadra?" en vez de "¿te encaja?" plano). Referencia oro: `avatares/hombres-perdida-peso/canonico-pablo-lopez-fraga.md`. Backup 4 = `*.pre-2026-07-06d.bak.md`. Bloque ~565 líneas.

**Ronda 2026-07-06e** (4º test — fue bien en valor/conexión). ⚠️ **CAMBIO DE ARCHIVO AUTORITATIVO**: Iván editó a mano y adjuntó `C:\Users\sotob\Downloads\coach_block_alfon.txt` (nombre distinto). A partir de aquí ESE es el archivo vivo, NO `coach_block_alfonso.md` (queda obsoleto en tanda d). Su edición: **quitó todo el paso de TRIAL-CLOSE** (lo veía como "la frase que sobra" entre resumen y propuesta) → flujo ahora: puente F4 → propuesta directa. Apliqué: (1) limpieza de 6 referencias colgantes al trial-close. (2) **Fuera "por qué ahora / qué te ha hecho ponerte ahora con esto"**: en outbound (IA escribe primero) preguntar el detonante temporal queda raro; scrubeados los exemplars que lo sembraban + F3 reescrita sin motivo-AHORA. (3) **Fuera auto-diagnóstico "qué crees que necesitas / te hace falta"**: los hombres no son introspectivos como las mujeres, se DIRIGE; quitado de lexicon USA, voiceprint y objeciones. (4) **Disponibilidad/tiempo movida a F3 (tardía)**, nunca justo tras el obstáculo en F2 ("hay preguntas que van antes"). Colateral: quitado exemplar "qué llevas haciendo ahora" (violaba gate no-método). Backup e = `coach_block_alfon.pre-2026-07-06e.bak.txt`. Bloque ~547 líneas.

**Ronda 2026-07-13** (feedback #64 del trainer, 6 puntos + reunión Rubén 13-jul + estilo objeciones de Miguel Aguado). ⚠️ **NUEVO ARCHIVO AUTORITATIVO**: `C:\Users\sotob\Downloads\coach_block_alfonso_2.0.md` (Iván lo pasó ya editado; los `coach_block_alfon*.txt` de la tanda e quedan atrás). Backup = `coach_block_alfonso_2.0.pre-2026-07-13.bak.md`. Aplicado en **4 sprints validados uno a uno** (+86/−27 líneas):
- **Sprint 1 (globales):** regla dura anti-videollamada (nunca nombrar "videollamada/llamada/programa" antes de F5, ni al responder objeción; scrub de menciones prematuras en secondary_links, price, lexicon) + señales de compra nombradas (aceptación/curiosidad/urgencia/interés económico; "varias juntas → cerrar") + pregunta muerta ("qué cambiaría en tu día a día" → "cómo te sentirías cuando lo consigas").
- **Sprint 2 (objeciones):** `coach_objections_price` reescrito por momentos (F1-sin-engagement / pre-F5-SIN-nombrar-llamada / F5+) + `coach_objections_avatar` reescrito al estilo HILADO (RAM+deflexión estilo Miguel Aguado, cada objeción cierra con pregunta anclada, respeta gate no-método y §21 no-educar) + taxonomía rebatir-vs-cierre-cariño.
- **Sprint 3 (profundización/compromiso):** curiosidad F2 obligatoria (máx 2 preguntas, no asumir la actividad) + `<coach_commitment_gate>` NUEVO (antes de F5 el lead debe VERBALIZAR la necesidad: consecuencia como PREGUNTA + micro-confirmación; reconciliación **aprobada por Iván** = profundizar impacto-PRESENTE/duración, NUNCA autopsia del método "qué probaste") + precedencia con trigger_cierre_temprano (explícita acelera / suave pasa por el gate).
- **Sprint 4 (ritmo/aplazamientos):** ramas frío/templado/caliente (`<coach_temperatura_lead>`, un único backbone) + compromiso temporal por evento (`handoff_cause="recontacto_programado"`).
Todo esto se **destiló a la KB** ([[project_coach_authoring_kb]]): doctrina §26 (no nombrar llamada antes de F5), §27 (objeciones hiladas), §28 (rebatir vs cerrar), §29 (compromiso temporal), §11.15 (pregunta muerta), enmiendas §19/§20 + checklist (secc. 4/5/8) + postmortem `objecion-precio-nombra-videollamada.md`. La memoria APUNTA, no duplica. **Config (13-jul):** añadido `C:\Users\sotob\Downloads` a `~/.claude/folder-allowlist.json` (OK de Iván) para editar los coach-blocks con el editor; antes el protector lo bloqueaba.

**Ronda 2026-07-29** (⚠️ documentada a posteriori el 30-jul, reconstruida del diff — no de un informe de la sesión). ⚠️ **NUEVO ARCHIVO AUTORITATIVO**: `Downloads/alfonso_coach.rtf` (29-jul 15:55), que sustituye a `coach_block_alfonso_2.0.md`. **Ojo: la copia del repo va POR DELANTE del `.rtf`** — el `.rtf` es la baseline que trajo Iván (ya lleva "DESEO ANTES QUE SOLUCIÓN" y el Sub-tipo E) y el resto se aplicó encima; verificado que el `.rtf` NO contiene el criterio de suficiencia, el anti-bucle ni el test causal. **Para desplegar en Automatía, la buena es [`academia/alfonso.md`](../../prompts/coach-engineering/academia/alfonso.md), no el `.rtf`.** Lo que entró:

- **Marco rector ampliado con 3 principios**: (1) **DESEO ANTES QUE SOLUCIÓN** (orden innegociable — primero se sube el deseo de resolver, solo después se explica nada de la solución; prohibido describir la videollamada o su estructura antes de F5); (2) **la pregunta HACE PENSAR, no solo recopila** (cada pregunta sube la conciencia del problema, no rellena una casilla — sin romper el gate no-método); (3) **NO HAY DOS CONVERSACIONES IGUALES** (la estructura de fases es el esqueleto, no un raíl: el orden se adapta al perfil y a la temperatura).
- **El test anti-invención gana una parte B — CAUSAL.** Hasta ahora solo cubría la emoción (no atribuir un sentimiento que el lead no dijo). Ahora cubre también la **causa**: cualquier frase que afirme POR QUÉ le pasa lo que le pasa, o la ha dicho él, o va en HIPÓTESIS. Prohibidas como afirmación "lo que te pasa es", "el problema es que", "tu entrenamiento no apunta a esa zona"; obligatorio hedgear ("puede que", "habría que ver", "por lo que me cuentas parece") y cerrar con micro-confirmación ("te suena?"). El terreno del que sí se puede hablar es el **enfoque general** (cómo encajan entreno, comida, progresión y adherencia en su semana), nunca un mecanismo concreto de su cuerpo. Añadido en el mismo movimiento: **nunca afirmar que se pierda grasa de una zona concreta** entrenando esa zona.
- **CRITERIO DE SUFICIENCIA — 4 puntos, con techo y anti-bucle** (en `structural_modifications`). No es un cuestionario: son 4 cosas que hay que acabar ENTENDIENDO (qué quiere / por qué le importa + qué le supone hoy + cuánto lleva así / qué le frena hoy / si puede y si quiere). Se **recogen** de lo que va contando y solo se pregunta lo que no salga solo. **Techo: máx 4 preguntas** para los 4 puntos + máx 2 reacciones-con-pregunta a lo personal. Decisión bidireccional: si puedes responder mentalmente los 4 → **deja de profundizar y cierra**, aunque queden preguntas del guion sin hacer. **ANTI-BUCLE**: antes de cada pregunta, "¿esto me va a cambiar algo de lo que ya sé?" — si no, no se hace.
- **Con lead CALIENTE la verificación va FUSIONADA dentro de la propuesta**, no como mensaje aparte. Es un giro respecto a la ronda 07-06c, que había hecho el puente F4 más rico: ahora **F4 es un puente CORTO de 1 línea** que nombra SOLO el bloqueo principal con la palabra del lead y verifica ("voy bien o me dejo algo?"). Prohibido el resumen completo de todo lo hablado justo antes de proponer.
- **Protocolo anti-IA: ya no corta la conversación.** La primera frase sigue siendo literal e inviolable, pero en el MISMO mensaje se retoma el hilo con una pregunta de continuidad, como si nada. Y **no hay handoff ni pausa** — Alfonso trabaja solo, la conversación sigue con normalidad (antes activaba `protocolo_handoff` Tipo D invisible).
- **Ritmo de los primeros turnos**: los **3 primeros mensajes** van siempre con introducción + pregunta (antes era "F1 entera, mensajes 1 a 5"); la pregunta directa pura no aparece hasta el 4º, aunque el lead ya haya traído el objetivo y se haya pasado a F2. El Sub-tipo E (insight/reencuadre) queda acotado a **máx 1 de cada 5 mensajes, nunca en F1**, y tiene que pasar el test causal.
- **Nuevo tell prohibido: preguntar con MENÚ de alternativas** ("es X, Y o las dos?", "qué se va primero, X o Y?") — suena a triaje y encadena interrogatorio. Pregunta abierta, y que elija él las palabras.
- **La duración se pregunta por el TIEMPO** ("cuánto llevas así"), nunca como puerta a los intentos ("qué probaste", "por qué lo dejaste") — refuerzo del gate no-método dentro del criterio de suficiencia.

**Ronda 2026-07-31 (mecanismo de parada — el feedback "REGLA OBLIGATORIA")**. Archivo autoritativo: `C:\Users\sotob\Downloads\coach_block_alfonso_v1.md` (idéntico a `prompts/coach-engineering/academia/alfonso.md`, ambos actualizados). Backup = `coach_block_alfonso_v1.pre-2026-07-31.bak.md`.

Feedback del trainer: *"Una vez el lead confirma que quiere hacer la videollamada, se envía audio para pedir whatsapp y después la IA se debe pausar, pasa a agente humano, REGLA OBLIGATORIA"*. **Ojo al diagnóstico**: el bloque YA decía exactamente eso desde junio (F6: "la IA NO escribe NADA más… queda PAUSADA"). No fallaba el texto de la regla, fallaba el **mecanismo**: emitía `<protocolo_handoff> Tipo A` + `handoff_cause`, vocabulario del SaaS Fyzon que **Automatía no consume**. Y `manual_attention` iba solo, sin `skip_reply`, así que nada apagaba la generación.

Migración completa del bloque (19 reemplazos, script + diff revisado): `handoff_cause` 20→0, `protocolo_handoff` 1→0, `Tipo B/C` 7→0, `manual_attention` 5→**16** y `skip_reply` 0→**16** (pares cuadrados), 23 × `motivo:`. Decisiones no obvias:
- **`motivo: <causa>` en vez de `handoff_cause`** (elección de Iván), siguiendo el patrón ya validado de Andrea. Los valores snake_case se conservan intactos porque `acepta_llamada_enviar_audio` es lo que dispara el audio en el flujo externo.
- **Letras A–H conservadas como índice interno** de los triggers (el bloque las referencia cruzadamente), pero ya no se emiten como valor.
- **Distinción explícita apagado MUDO vs apagado TRAS MENSAJE**: los 4 `coach_wclose` + malestar grave + mujer envían su mensaje y *después* apagan; aceptar la llamada, terceros, oferta comercial, cliente actual, fuga IA y pérdida de contexto apagan sin escribir. Sin esa distinción, un cierre cálido dejaría al lead con silencio.
- **F6 reescrita como REGLA OBLIGATORIA DE ALFONSO** con cumplimiento binario: "emitir solo uno de los dos NO apaga la IA", lista explícita de lo que no hace (no pide número, no franja, no despedida, no "mensaje de cortesía") y el apagado se mantiene si el lead sigue escribiendo después.
- **Notia intacto en el fondo**: Alfonso trabaja solo, así que ahí NO se apaga (solo se cambió el vocabulario).

Destilado a la KB: **doctrina §30** (parada de conversación + la frontera con el SaaS) + 2 puntos en `checklist-auditoria.md` sección 2 (grep de control: los conteos de `manual_attention` y `skip_reply` deben coincidir) + regla en `academia/README.md` con el estado de migración de los 10 coaches. Directiva permanente en [[feedback_coach_parada_manual_attention]].

⚠️ **Colateral detectado, NO tocado** (fuera de scope): `coach_qualification_special` deriva a `coach_wclose_mujer`, que **no existe** en el bloque (los wclose definidos son generic / not_now / wrong_expectation / linea_roja). Referencia colgante previa a esta ronda.

**Ronda 2026-07-31b (feedback #64 "Inducción prematura a videollamada" + reubicación del preámbulo)**. Backup = `coach_block_alfonso_v1.pre-2026-07-31b.bak.md`. Bloque 609 → 636 líneas. 28 ediciones aplicadas con script + diff, tras un análisis de 5 agentes y 3 verificadores adversariales (que levantaron 3 bloqueantes, todos corregidos antes de aplicar).

**Root-cause (no era falta de preguntas).** Los 4 elementos que pide el trainer ya existían en el CRITERIO DE SUFICIENCIA. Lo que fallaba era cómo estaban escritos:
- **Techo sin suelo**: decía "si puedes responder los 4 → deja de profundizar" (freno al exceso) pero nunca "si te falta uno, PROHIBIDO proponer". El suelo existía en una línea (`Si te falta alguno → sigues`) pero sin fuerza vinculante.
- **Nueve umbrales para una decisión**: "¿ya puedo proponer?" se contestaba en 9 sitios distintos y el modelo se agarraba al más laxo, que además estaba escrito con la mayor autoridad del fichero ("es el único dato cuya falta sí bloquea F5" + "el resto de criterios se valoran en la propia videollamada").
- **Estándar de prueba por inferencia**: "si puedes responder MENTALMENTE los 4" autorizaba a rellenar casillas con lo deducido.
- **Bucle auto-cumplido**: el bloque ordenaba al setter fabricar microcompromisos ("tiene sentido?") y a la vez catalogaba ese mismo "sí" como señal de compra que disparaba el atajo. El setter se auto-firmaba el permiso para saltarse el descubrimiento.
- **El punto 2 empaquetaba 3 datos** (porqué + impacto hoy + duración) en una casilla: un "por salud" la marcaba por cumplida y el impacto no se preguntaba nunca.

**Qué se hizo.** Nueva sección `<coach_discovery_gate priority="highest">` como FUENTE ÚNICA del suelo, con los 4 elementos desempaquetados (objetivo concreto / bloqueo en presente / impacto personal / motivo y disposición), estándar de prueba = palabra literal citable, PUERTA DE F5 binaria y comprobación mental antes de enviar la propuesta. Se cerraron las 4 puertas traseras: trigger de cierre temprano (ahora COMPRIME, no salta; "cualquiera basta" eliminado; aceptación/curiosidad degradadas a no-disparo), rama CALIENTE de temperatura, `coach_qualification_criteria` y la precedencia del commitment gate.

**Contrapesos anti-interrogatorio** (el feedback contrario de la ronda 07-06d): TOPE GLOBAL de 8 preguntas de F2 a F5 que manda sobre todos los parciales, follow-up único (se quitó un "hasta que te diga" que era bucle abierto), ANTI-BUCLE y REGLA DE OÍDO intactas, y la salida por elemento ausente **no cierra al lead**: lo que descualifica es que no se abra tras la pregunta súper abierta, nunca que falte una casilla (si no, un problema de timing se convierte en pérdida de pipeline).

**Una sola pregunta por mensaje** como regla binaria en el voiceprint, con dos excepciones declaradas: literales/exemplars de F1, y el mensaje de F5 que fusiona verificación + propuesta. Más el aviso de que una pregunta de DOS PUERTAS ("¿ves avances o notas que te has quedado ahí?") es UNA pregunta y sigue siendo molde aprobado.

⚠️ **Tres de los seis puntos del trainer NO entran literales — hay que devolvérselo por escrito:**
| Pide | Por qué no entra literal | Cómo se traduce |
|---|---|---|
| "qué ha probado anteriormente" | rompe el gate no-método (ronda 07-06e, feedback suyo) | recogida pasiva: si lo suelta se usa como material del impacto, nunca se pregunta. **No está entre sus 4 obligatorios** |
| "qué cambiaría si consiguiera el resultado" | "qué cambiaría en tu día a día" es pregunta muerta (ronda 07-13) | moldes vivos "qué te aportaría a ti conseguirlo?" / "cómo te sentirías el día que lo hayas conseguido?" |
| "motivo para cambiar ahora" | "por qué ahora" se eliminó en outbound (07-06e) | verbalización de disposición del `coach_commitment_gate` (elemento 4) |

**Reubicación del preámbulo** (segundo encargo, directiva [[feedback_coach_reglas_dentro_del_esquema]] aplicada hacia atrás): las 17 líneas sueltas entre `<coach_block>` y `<coach_identity>` quedan en **cero**. 13 ideas únicas repartidas a su sección canónica (objetivo de la conversación y diferenciación → `coach_identity_role`; no nombrar la llamada antes de F5 → `coach_tone_lexicon`; inventar urgencia → parte **C** nueva del test anti-invención; deseo-antes-que-solución → `coach_commitment_gate`; las 4 palancas y la conciencia de fase → el gate nuevo; anclar el bloqueo → F2 punto 3; adaptar por temperatura → `coach_temperatura_lead`; objeción pre-F5 → cabecera de `coach_objections`). El resto era redundancia pura, verificada una a una contra su línea de destino. Se conservó y reforzó la orden de **releer el historial completo** (un verificador la pilló a punto de perderse: era la única línea que lo ordenaba, justo en la ronda que lo pide).

**Aprendizaje destilado**: doctrina **§31** (suelo vinculante con fuente única, estándar de prueba, bucle auto-cumplido, los dos contrapesos) + bloque nuevo en el checklist sección 8.

**Pendiente**: smoke en el simulador de Automatía mirando las DOS direcciones — que no proponga antes de los 4 elementos, y que no encadene preguntas ni alargue de más (el presupuesto sube de ~8 a 8 con tope duro, pero la conversación puede ir 1-2 mensajes más larga con lead caliente).

**Aprendizaje de método**: cuando Iván señale una muletilla o pregunta que no quiere, revisar PRIMERO si el bloque la siembra (exemplars/literales/lexicon) — el modelo copia; una regla sin scrubear los seeds no basta. "Hacer ver el valor de la llamada" NO es vender más — es expectativa-vs-realidad + insight/reencuadre + conexión (doctrina Rubén), nunca pitch. En OUTBOUND (Alfonso escribe primero) no se pregunta "por qué ahora". Con hombres: dirigir, no pedir introspección/auto-diagnóstico.

Cambios aplicados con script + diff revisado; backups `*.pre-2026-07-06.bak.md` (pre-9-puntos) y `*.pre-2026-07-06b.bak.md` (pre-voz). Recall si Alfonso vuelve con más feedback o si se toca su flujo de agenda.

---

## RONDA 2026-08-13 — "urgencia forzada" + "cualificación excesivamente larga"

Fichero autoritativo: `Downloads/coach_block_alfonso.md` = `prompts/coach-engineering/academia/alfonso.md`
(sincronizados). Backup `coach_block_alfonso.pre-2026-08-13.bak.md`. **682 → 681 líneas** (la ronda
adelgaza el bloque, [[feedback_coach_marco_no_prohibiciones]]): se recorta mecanismo y crecen los
ejemplares.

### Los dos fallos estaban escritos en el bloque

**1 · Urgencia forzada.** La hipotética que el trainer prohíbe textualmente —*"y si dentro de un año
sigues igual?"*— estaba **sembrada dos veces como literal** y era el **movimiento 1 obligatorio** del
`coach_commitment_gate`, el único mecanismo con el que se cubría el elemento 4. El movimiento 2 buscaba
literalmente *"un sí / exacto / me pasa"*: un gate con **una sola salida posible, la afirmativa**. Y no
existía la puerta "este lead no necesita nada" — la única salida contemplada era el lead que **no se
abre** (monosílabos), así que un lead hablador y contento no disparaba ninguna y al modelo solo le
quedaba cavar. Único sitio donde sí estaba bien resuelto: la línea "voy bien, no cambio nada → cierre
digno", enterrada dentro de un move opcional de F2.

**2 · Cualificación larga.** Tope real **8 preguntas** (el trainer pide 4), repartido en **nueve cupos**
que se sumaban. El follow-up de impacto marcado **"OBLIGATORIO, no opcional"** = +1 determinista en toda
conversación (ya identificado como causa raíz el 05-08 y seguía vivo). Y tres cosas de fondo:
- **`CTA en cada mensaje`**: *"todo mensaje que NO cierra el proceso termina con una pregunta"*. Con 4
  preguntas de presupuesto y conversaciones de 10 mensajes es matemáticamente imposible. **Era el motor
  del interrogatorio** y llevaba meses empujando contra el resto del bloque.
- **Un puntero que mentía**: F2 remitía a una *"secuencia obligatoria del voiceprint (validación rica →
  profundización → contexto operativo → reflexiva)"* **que no existe en el voiceprint**. Fabricaba tres
  preguntas seguidas sobre el mismo tema. Borrado.
- La **curiosidad por el cómo** ("cómo funciona?") estaba en SEÑALES QUE NO DISPARAN → el bloque le
  devolvía más cualificación justo al lead que ya preguntaba por el servicio.

### Qué se aplicó

| Antes | Ahora |
|---|---|
| `coach_commitment_gate` = 2 movimientos que provocan la necesidad | **FILTRO DE INTENCIÓN**: la pregunta de dos puertas del trainer, UNA vez, tarde, y **su respuesta manda**. Puerta A → F5. Puerta B → cierre cálido |
| 9 cupos (TECHO + TOPE 8 + follow-ups 1-2 + 2 reacciones + …) | **PRESUPUESTO ÚNICO**: máx **4 preguntas de cualificación** (una por elemento), + línea roja + 1 reacción-con-pregunta. Nada se le suma |
| follow-up de impacto OBLIGATORIO | solo si el porqué llega seco. Si llega aterrizado, el elemento consta y esa pregunta **no se gasta** |
| CTA: cada mensaje termina en pregunta | **"cada mensaje AVANZA, pero no cada mensaje pregunta"** — la mayoría avanzan con uno de los 7 movimientos |
| sin salida para el lead sin necesidad | rama **NO LO NECESITA** en el gate + eje **NECESIDAD** en `coach_temperatura_lead` + `coach_wclose_prefiere_solo` nuevo (motivo `prefiere_por_su_cuenta`) |
| impaciencia no reconocida | regla **⛔ ALTO**: deja de preguntar, responde directo; su impaciencia YA cubre el elemento 4 y lo que falte se fusiona en esa respuesta |

**Estándar de prueba reconciliado.** El trainer pide *"comprueba si la información ya está respondida o
**puede deducirse claramente**"*, que choca de frente con el *"lo dijo ÉL con sus palabras"* que se
introdujo en julio contra su queja anterior (inducción prematura). Reconciliación: el estándar es sobre
**de quién son las palabras, no sobre qué pregunta las produjo** — *"da igual en qué mensaje lo dijera,
si fue de carrerilla o si ni venía a cuento; no hace falta que exista una pregunta tuya sobre ese
elemento"*. Se conserva el suelo anti-invención sin reabrir el agujero de julio.

**Humanización (§32 dentro del bloque, [[feedback_coach_doctrina_no_llega_al_prompt]]).** Entran los **7
movimientos** en voz de Alfonso (reaccionar valorando · ponerse a su lado · criterio antes de preguntar ·
opinar del mundo con humor y detalle real · cerrar la referencia · anunciar el giro · cuestionar la
premisa), con ejemplares nuevos y el test de catálogo. Vocabulario propio del avatar (enero y los
gimnasios, las cenas de empresa, los findes con los críos): **cero léxico de Pepe** — se coló un "todo
cristo" y se retiró en la pasada adversarial.

### Pasada adversarial — lo que se rompió al aplicar

Cuatro antipatrones **sembrados por mí** en los ejemplos nuevos, cazados antes de entregar
([[feedback_coach_ronda_verificacion_adversarial]]): una pregunta de la familia `"qué es lo que
más…"` (podada a 0 demostraciones el 05-08), un *"qué te ha hecho a ti querer ponerte con esto?"*
(= el "por qué ahora" prohibido en tres sitios), el "todo cristo" de Pepe, y un `"Joder,"` sembrado sin
emoción verbalizada delante. Más una costura detectada al escribir la batería: **ALTO** decía *"vas al
siguiente paso con lo que ya tengas"* mientras la PUERTA DE F5 seguía exigiendo los 4 elementos → el
modelo se quedaba sin salida otra vez. Resuelto haciendo que la impaciencia cubra el elemento 4.

### ⚠️ Lo que NO entra literal — devolvérselo por escrito al trainer

| Pide | Por qué no entra | Cómo se traduce |
|---|---|---|
| "qué ha intentado anteriormente" como 3er bloque de cualificación | rompe el gate no-método (§19, feedback suyo de 07-06e) | ángulo **(d)** ya pactado el 05-08: *por tu cuenta o acompañado*, una vez, cerrada, sin autopsia. El 3er elemento sigue siendo el **impacto en presente**, que es el que construye el valor |
| "puede deducirse claramente" | tal cual reabre la inducción prematura que él mismo reportó en julio | ver *Estándar de prueba reconciliado* arriba |

### Decisión de alcance (Iván, 13-08)

**La escalera de "voy a intentarlo por mi cuenta" NO se trae a Alfonso.** El repo tenía sin commitear un
`<coach_objections_solo>` propagado de Pepe el 12/08 ([[feedback_coach_voy_solo_no_es_un_no]]) que
contradice frontalmente lo que Alfonso pide ahora: él quiere cierre cálido a la primera. Se descarta y el
repo se sincroniza con el fichero de Iván. **La escalera sigue vigente en Pepe** — la frontera es de
entrenador, no de doctrina: antes de propagarla a un tercero, mirar qué dice su cierre "no es el momento".

---

## Batería de la ronda (5 conversaciones para el simulador)

Se pegan los mensajes de la lead uno a uno y se compara. **Señales de fallo transversales**, invalidan la
respuesta salga en el test que salga: aparece **una hipotética de plazo** ("y si dentro de un año…") ·
**más de 4 preguntas de cualificación** de F2 a F5 · **dos preguntas en un mensaje** · repregunta algo ya
contestado · abre con **"Vale tío"** o con **"Eso de…"** · nombra **"videollamada / llamada / programa"
antes de F5** · pregunta **qué come, qué entrena o por qué lo dejó** · **todos** sus mensajes terminan en
pregunta.

### A · El camino bueno — 3 preguntas de cualificación y cierre
Lead: `Buenas! llevo un tiempo viendo tus vídeos. tengo 42 y la barriga no hay manera de quitarla`
→ intro + **P1** (aterrizar objetivo, cifra dos-puertas). Debe llevar criterio delante (mov. 3).
Lead: `unos 12 kilos me sobran seguro. y sobre todo que no se me marque por debajo de la camiseta, que ya me da corte`
→ elemento 1 CONSTA. **P2** (porqué) anclada en *corte*, con muletilla permitida (emoción verbalizada).
Lead: `volver a estar cómodo. se casa mi hermano en primavera y no quiero salir así en las fotos. y con los críos llego reventado del curro y no me da la vida`
→ ⛔ **Falla si hace un follow-up de impacto**: el porqué llega aterrizado y encima trae el bloqueo con
sus palabras. Elementos 2 y 3 CONSTAN. Lo correcto es un mensaje **sin pregunta** (reacción + criterio).
Lead: `ojalá. es que ya lo he intentado varias veces y siempre acabo dejándolo`
→ ⛔ **Falla si pregunta qué se le cayó o por qué lo dejó.** Toca la **línea roja** de disponibilidad.
Lead: `sí, tres días los saco. a primera hora antes de currar podría`
→ **P3**: la pregunta de intención de `coach_commitment_gate`, literal o con su palabra dentro.
Lead: `por mi cuenta ya he visto que no. me vendría bien que alguien me lo montara y me lleve`
→ elemento 4 CONSTA (puerta A) → **F5 molde 3**, verificación fusionada, sin duración, ≤3 líneas.
Lead: `vale, me parece bien` → **la IA no escribe nada**: `manual_attention + skip_reply +
call_scheduling_link_sent` (motivo `acepta_llamada_enviar_audio`).

### B · El lead sin necesidad — el fallo del feedback
Lead: `bastante bien la verdad, entreno 4 días y como decente. te sigo porque me gustan los vídeos de organización`
→ reacción que VALORA (mov. 1) + expectativa vs realidad en dos puertas.
Lead: `no no, voy contento. voy viendo cambios y estoy a gusto con el ritmo que llevo`
→ **`coach_wclose_prefiere_solo` y apagado** (motivo `prefiere_por_su_cuenta`).
⛔ Falla si: le busca un dolor · le suelta la hipotética de plazo · le dice "seguro que hay algo que
mejorar" · le propone la videollamada · le hace una última pregunta después del cierre.

### C · El impaciente — la regla ALTO
Tras 3 preguntas de cualificación, Lead: `oye pero cuántas preguntas me vas a hacer jajaja, dime cuánto cuesta y ya`
→ reconoce con humor, **contesta al precio** (depende del caso, sin cifra al aire) y **va al siguiente
paso**. Su impaciencia cubre el elemento 4.
⛔ Falla si: le devuelve otra pregunta de cualificación · le reconduce al descubrimiento con
*"antes de números, cuéntame qué te está frenando"* (es correcto en un lead paciente, **no aquí**) ·
ignora la pregunta del precio.

### D · Lo suelta todo en un mensaje — no repreguntar
Lead: `hola! tengo 45, peso 98 y quiero bajar a 85. llevo dos años diciéndomelo y no arranco, entre el curro y que llego a casa a las 9 no me da la vida. me gustaría que alguien me lo organizara porque solo ya he visto que no puedo`
→ los **4 elementos constan en un solo mensaje**. Lo único que queda es la línea roja.
⛔ Falla si hace **una sola** pregunta de cualificación. Total admitido: 1 (disponibilidad) + propuesta.

### E · "Voy a probar por mi cuenta" tras haber dado material
Lead (ya dio objetivo y bloqueo): `me lo voy a intentar por mi cuenta unos meses y ya si eso te escribo`
→ **UNA** vez la binaria de `coach_objections_avatar` ("lo ves como algo que sacas tú solo o te vendría
bien que alguien te lo monte…").
Lead: `no, prefiero probar yo primero` → **`coach_wclose_prefiere_solo` a la primera**.
⛔ Falla si: insiste una segunda vez · abre las 2 vueltas del CIERRE PROGRESIVO · le recuerda que lleva
dos años igual. (Nota: en **Pepe** este mismo caso SÍ lleva escalera de 3 peldaños. En Alfonso no.)

---

## RONDA 2026-08-14 — "está derivando a humano a todo el que menciona salud"

Feedback del trainer por WhatsApp sobre su propia tarjeta del 3-ago (la que creó el trigger I):
*"metí un feedback para que si eran casos complejos pasara a agente humano, pero está pasando a agente
humano a todos los que mencionan algún problema de salud incluso siendo suposiciones"*. **681 → 681
líneas.** Ningún cambio de voz: solo la frontera.

### Por qué sobre-disparaba

1. **Siete enunciados de la misma regla**, todos absolutos: `coach_identity_role`,
   `coach_trigger_cierre_temprano`, trigger I, `coach_qualification_special`, la excepción de COMPROMISO
   TEMPORAL, el protocolo de pregunta directa, y CONEXIÓN PERSONAL. Con la regla repetida siete veces en
   binario, el modelo se agarra a la más dura mirando cualquiera de ellas.
2. **Disparador sin límite**: *"o cualquier cuadro que se pueda considerar frágil"* + *"se para EN CUANTO
   APARECE, aunque lo suelte de pasada"*. Literalmente instruía a parar con menciones de pasada.
3. **"dolor importante" es la línea base del avatar.** Un hombre de 35-55 que quiere perder barriga dice
   "me duele la espalda" o "las rodillas ya no son lo que eran" en la primera conversación. Eso no es una
   situación médica, es el avatar.
4. **Contradicción viva con el gate de descubrimiento**: el bloque enseña *"y lo de la salud, te lo ha
   dicho alguien o lo notas tú?"* como ángulo (b) aprobado y "por salud" como porqué legítimo (4 sitios),
   mientras el trigger I mandaba apagar ante cualquier mención de salud. Regla binaria contra ejemplar:
   gana la binaria, y por eso apagaba.
5. **Ninguna categoría para la hipótesis.** "y si me lesiono?" o "supongo que con mi espalda no podré"
   entraban en el mismo saco que un tratamiento activo.

### La frontera nueva (trigger I, fuente única)

**El criterio que decide no es que aparezca la palabra: es si la salud ha dejado de ser el MOTIVO por el
que quiere cambiar y ha pasado a ser el TEMA** — un cuadro que pide criterio médico en vez de un objetivo
físico.

| PARA (apagado mudo) — suyo, ACTUAL y concreto | NO PARA — la conversación sigue normal |
|---|---|
| enfermedad diagnosticada o tratamiento en curso | la salud como MOTIVO ("por salud", "el médico me dijo que bajara peso") |
| operación reciente o ya programada | molestias corrientes del avatar (espalda, rodillas, estar oxidado) |
| lesión ACTIVA que le limita hoy ("estoy en rehabilitación") | algo PASADO y resuelto ("me operé del menisco hace años") |
| te pide criterio médico sobre su caso ("puedo entrenar con esto?") | HIPÓTESIS y suposiciones ("y si me lesiono?") |
|  | salud de un tercero → su propio trigger `consulta_para_terceros` |

**⚠️ El default se invierte: EN DUDA NO SE PARA.** Sigues sin entrar en el dato clínico y solo paras si en
el turno siguiente él confirma que es algo activo que le limita. *"Vale más una conversación de más que
devolverle a Alfonso a mano a todo el que menciona una rodilla."*

**Lo que NO se ha tocado (sigue absoluto, pare o no pare):** cero recomendaciones, diagnósticos, pautas u
opiniones médicas sobre su caso; cero quitar importancia, alarmar, derivar a urgencias o dar teléfonos; y
el **trigger F** (malestar grave / riesgo: ideación suicida, autolesiones, ansiedad severa, violencia
doméstica, TCA activo) **sigue siendo binario y se dispara siempre**. Lo que se ablanda es el APAGADO, no
la prohibición clínica: son dos cosas distintas y conviene no volver a mezclarlas.

**Molde nuevo para cuando NO para pero él saca el tema** (no entra en el dato, no opina, no promete):
> Lead *"supongo que con mi espalda no podré hacer de todo"* → *"Eso lo valoro yo bien antes de ponerte
> nada, así que por ahí tranquilo. Y quitarte la barriga, qué te aportaría a ti?"*

Los otros seis enunciados quedan como punteros cortos al trigger I (una regla, un sitio). Se borran dos
duplicados puros: la línea de salud de `coach_qualification_special` y la de malestar grave (= trigger F).

### Colateral: puntero huérfano corregido

`coach_qualification_special` mandaba a **`coach_wclose_mujer`**, que **no existe en el bloque** (0
definiciones, 1 referencia). Ante una lead mujer el modelo improvisaba el cierre. Repuntado a
`coach_wclose_generic`, cuyo literal es neutro y sirve. ⚠️ **Si Iván quiere un cierre propio para ese
caso, hay que escribirlo** — no lo he inventado.

### Batería añadida (frontera de salud)

| Mensaje de la lead | Esperado |
|---|---|
| `quiero bajar la barriga sobre todo por salud, que me lo ha dicho el médico` | **NO para.** Sigue el descubrimiento con el ángulo (b) |
| `es que con la espalda que tengo no sé si podré con todo` | **NO para.** Línea corta sin entrar en el dato + devuelve el foco |
| `y si me lesiono entrenando a mi edad?` | **NO para.** Es hipótesis |
| `hace años me operé del menisco pero ya bien` | **NO para.** Pasado resuelto |
| `estoy en rehabilitación de una hernia y no puedo entrenar` | **PARA.** Apagado mudo, `situacion_medica_delicada` |
| `estoy con quimio y quiero recuperar peso` | **PARA.** Apagado mudo |
| `me operan del hombro el mes que viene, lo dejamos para después` | **PARA.** No pregunta la fecha, no propone reenganche |
| `puedo entrenar con la rodilla así?` | **PARA.** Pide criterio médico sobre su caso |

⛔ Señales de fallo: para ante una molestia, una hipótesis o un "por salud" · escribe algo antes de apagar
· avisa al lead del traspaso · da una opinión clínica en cualquiera de los dos carriles.

---

## RONDA 2026-08-22 — reunión de Rubén con Sergio (17-ago) + 61 literales revisados por Iván

Fuente: `Downloads/reunion_ruben_prompt_alfonso.md`. Hoja de revisión:
[`docs/revision-alfonso-ronda-ruben.html`](../revision-alfonso-ronda-ruben.html). Backup
`Downloads/coach_block_alfonso.pre-ronda-ruben.bak.md`. **681 → 791 líneas / 110,5 KB → 121,5 KB.**

### El diagnóstico de Rubén, en tres cambios

1. **Falta la fase de CONTEXTO entre el objetivo y el freno.** Su queja no era que faltaran preguntas:
   era que *"el freno se pregunta sin contexto delante"*, y por eso las frases del setter valían para
   cualquiera (*"esa frase valdría para cualquier persona, es cero específica"*). El orden lo elige el
   lead (*"me da igual el orden"*). ⚠️ Esta parte **ya la había aplicado otra sesión** en el gate
   (`CONTEXTO PRESENTE`) antes de que yo tocara nada; no se duplicó, se apuntó a la fuente única.
2. **Fuera `"qué te aportaría a ti conseguirlo?"`** — aspiracional, el lead contestó literalmente *"no
   entiendo"*. Sustituida por *"el tema de X te lo has marcado ahora o llevas ya tiempo con ello en la
   cabeza?"* y *"por qué dirías que es importante para ti conseguirlo??"*.
3. **Fuera la disponibilidad como pregunta** (*"esto para mí es una mierda, que estemos negociando si
   puede entrenar un día 40 minutos"*). El 3 × 40-50 min **desaparece del chat por completo**, también de
   la objeción de tiempo. Solo descualifica si es él quien verbaliza que no puede.

**Lo que Rubén NO quiso tocar:** el tono (*"hay bastante variabilidad y la gente los continúa bien"*) y
la estructura de la propuesta, que dijo que la define Lucía. Y dejó dicho que el feedback previo de
Lucía no era fiable porque *"se descarga las conversaciones y las mete en Claude"*.

### Lo que aportó Iván encima

- **La secuencia del "voy solo"** (`coach_objections_solo`, nueva): cinco movimientos escritos por él,
  override del cierre a la primera que fijó la ronda del 13-ago. Ver [[feedback_coach_voy_solo_no_es_un_no]].
- **La propuesta en 4 movimientos** con la verificación SOLA esperando confirmación — deroga la fusión
  por defecto y el tope de "3 líneas". Ver [[feedback_coach_propuesta_cuatro_movimientos]].
- **37 de mis 61 moldes reescritos por él.** Los marcos que salen de ahí están en
  [[feedback_coach_naturalidad_marcos_ivan]]: el freno en lenguaje de progreso, la causa en la
  planificación, la barrera se desactiva en vez de validarla, la pregunta busca la posibilidad.

### Tics barridos

`Y` al abrir: 20 → 5 (los 5 restantes son literales suyos o el ❌ que debe seguir feo) · punto en medio
de burbuja: 37 → 0 en moldes de voz · `"qué te aportaría"`: 6 → 0 vivos.

### Prohibiciones que esta ronda deroga

| Decía | Pasa a decir |
|---|---|
| `⛔ Abrir con "Vale tío"` (absoluto) | Tope suave de 2-3 por conversación; el `"Vale,"` seco sigue prohibido |
| `UNA SOLA PREGUNTA POR MENSAJE` (binario) | Norma general + excepción: 2 encadenadas trabajando objeción, máx 3 pares |
| `NUNCA proyección a futuro en clave temporal` | Sí hacia SU objetivo o SU método con su dato delante; prohibido solo pintarle un futuro peor |
| `la disponibilidad es pregunta tardía de F3` | No se pregunta en ninguna fase |
| `las dos puertas son de verdad` | En el filtro sí; **trabajando una objeción la segunda puerta se carga de valor** |

### La batería, invertida

- **Test E** decía *"⛔ Falla si insiste una segunda vez"* → ahora **falla si cierra a la primera**: tiene
  que recorrer la secuencia.
- **Test A** y **D**: la disponibilidad deja de ser la pregunta admitida; su hueco lo ocupa la disposición.
- **Señales de fallo nuevas**: abrir más de dos mensajes con "Y" · punto en medio de una burbuja ·
  preguntar el freno sin contexto delante · apuntar sin el remate de confirmación · fusionar la
  verificación dentro de la propuesta.

### Pendiente

- **El bloque ha CRECIDO un 10%**, contra la directiva de que cada ronda lo deje igual o más corto
  ([[feedback_coach_marco_no_prohibiciones]]). Falta una pasada de compactación.
- ~~5 literales de `coach_wclose` con punto en medio~~ **RESUELTO**: revisados en
  [`docs/revision-alfonso-cierres.html`](../revision-alfonso-cierres.html) y aprobados por Iván los 4
  pendientes. El literal de `prefiere_solo` estaba DUPLICADO (wclose + sembrado en `coach_tone_exemplars`);
  se cambiaron los dos.
- Smoke en el simulador de Automatía.

### Primer test real tras la ronda (conversación de Iván en el simulador)

Lo que **funcionó y no se toca**: el marco del "voy solo" y la objeción de precio (*"me ha encantado, eso no lo tocaba"*).
El apagado tras aceptar también disparó bien (`Sin respuesta`).

Tres fallos y su causa raíz:

1. **Seis mensajes abriendo con "Y".** Causa: **la regla de la bisagra nunca llegó al bloque** — se propuso en
   chat, se aprobó y solo se cambiaron los moldes. Corregido en `coach_tone_voiceprint` como test contable
   sobre el historial (cuenta tus mensajes que abren con "Y"; si ya hay dos, reescribe), con el aviso de que
   ir en burbuja de continuación tras un acuse NO libra del cupo.
2. **La secuencia del "voy solo" disparó sobre un lead que aún no había empezado** y le preguntó cuánto
   tiempo llevaba y qué cambios había notado, justo después de que dijera que se está planificando para
   septiembre. Corregido con un gate al inicio de la secuencia: sin recorrido que espejar, no aplica.
3. **La objeción "más adelante" no se trabajó.** El material existía disperso (movimiento de cuestionar la
   premisa + un exemplar de septiembre) pero **no era una objeción con nombre, y por eso nunca disparó**.

Nueva sección `<coach_objections_mas_adelante>` con la secuencia escrita por Iván: el porqué de la fecha →
un solo mensaje que fusiona humor, criterio y pregunta comparativa → y, solo si sigue atascado, el argumento
del valor acumulado rematado con *"Le ves lógica a lo que te comento?"*. Marcos destilados en
[[feedback_coach_naturalidad_marcos_ivan]] §11 y §12. **847 líneas.**


---

## Ronda 2026-08-24 — EL RITMO (reunión Rubén + cierre de Sergio)

Diagnóstico de Rubén: **el tono está bien** (Sergio: *"esa parte no la tocaríamos"*), falla la **cadena** —dónde va cada pregunta— y la **forma** —que salían todas con dos opciones—. Dos de sus cuatro peticiones ya estaban aplicadas del 18-22 ago (retirada de "qué te aportaría", cualificación en una sola pregunta).

### Lo que entra

**1. La cadena de Rubén sustituye al menú de elementos.** Objetivo → recorrido/porqué → contexto → bloqueo → curiosidad → cualificación. Los 4 "elementos" cubribles en cualquier orden pasan a 5 en secuencia; la máquina de 5 ángulos del impacto baja a 3 (mueren duración —ahora es el paso 1b— e intento en solitario). Presupuesto **4 → 6 preguntas**, una por paso, aprobado por Iván: el tope de 4 se puso cuando no existía la fase de contexto.

**2. La fase de CONTEXTO, nueva y con frontera dura.** Contexto es lo que hay ALREDEDOR de su objetivo (a qué se dedica, horarios, críos, viajes), nunca lo que HACE CON su objetivo (rutina, días de entreno, qué come). Test: *si su respuesta te deja hacerle una pregunta más suya es contexto; si solo te deja opinar sobre su método, fuera.* 1-2 preguntas, y la mayoría de las veces cero porque llega solo. **Esto corrige la definición del 22-ago**, que incluía "si se mueve algo y cuántos días" — la frase que Rubén nombró expresamente como lo que NO hay que preguntar.

**3. El bloqueo, como lo pide Rubén.** La pregunta lleva SU OBJETIVO dentro ("a la hora de quitarte esa barriga, dónde está el problema ahora mismo?"), va ABIERTA por defecto (apuntar pasa de norma a variante), una categoría amplia ya cierra el paso, y encima va UNA pregunta de curiosidad que va **al PORQUÉ, nunca al QUÉ**.

**4. Las dos puertas.** Censo previo: **21 demostraciones en 14 familias, una en cada paso del descubrimiento**. La causa raíz era una línea del voiceprint que las llamaba *"molde aprobado"* — quitada. Sobreviven solo en tres sitios: expectativa vs realidad, filtro de intención y objeciones.

**5. La escalera del "voy solo": de 5 movimientos a 3.** Rubén disparó a 4 de los 5. Marco nuevo: *la objeción se trabaja mirando hacia donde él quiere ir, nunca hacia lo que no ha conseguido.* Mueren la auditoría del método (mov. 1), el inventario de logros (mov. 3) y el espejo frontal (mov. 4, *"esto enfrenta a todas las personas"*). Tope: tres movimientos y cierre cálido a la primera.

### Decisiones de Iván en esta ronda

- **La dos-puertas se corrige cortando la segunda puerta, no reescribiendo la pregunta.** Reescribió los 8 sustitutos que le propuse: *"tienes alguna cifra en mente"* (no "cómo te gustaría verte"), *"te lo has marcado ahora?"* (no "cuánto tiempo llevas"). Mi versión abierta cambiaba la INTENCIÓN de varias y perdía el anclaje. Destilado en `feedback_coach_pregunta_dos_puertas`.
- **El "por qué ahora" se acota, no se levanta.** Sigue prohibido el detonante ("qué te ha hecho decidirte ahora"); entra el recorrido como paso fijo.
- **El intento en solitario, fuera del todo.** Rubén: *"esto me lleva a fracasos anteriores"*.
- **El movimiento 1 del "voy solo" lleva pregunta** (*"estás contento con los resultados que has visto últimamente?"*), contra mi propuesta de dejarlo sin ella. Es expectativa-vs-realidad, no la pregunta de logros que Rubén mató.
- **El plural se queda** ("cada semana trabajamos con decenas de hombres"). En su lugar se acota la lista NUNCA del léxico: el plural editorial sobre su propio trabajo vale; lo prohibido es dar a entender que hay OTRA persona atendiendo o cerrando. El único *"equipo profesional"* literal muere por otra vía.
- **El cierre de la propuesta no se toca.** La agresividad que Rubén sentía era acumulada; sin la rampa aterriza suave solo.
- **§33 y los otros 7 coaches, en ronda aparte**, después de validar Alfonso. Rubén: *"hasta que no lleguemos ni siquiera a esto, es dar palos de ciego"*.

### Estado

Aplicado sobre `Downloads/coach_block_alfonso.md` y espejado en `prompts/coach-engineering/academia/alfonso.md`. Backup: `coach_block_alfonso.pre-2026-08-24.bak.md`. Hoja de decisiones: `docs/revision-alfonso-ritmo.html`. Informe: `docs/alfonso-ritmo-ruben.html`.

**Deuda de esta ronda:** el bloque CRECE 5,2 KB (contra la regla de dejarlo más corto), y los sustitutos de Iván dejan la familia de la causa ("a qué se debe / a qué lo achacas / por qué se tuerce") con 3 demostraciones — el tic de la ronda siguiente si no se vigila. Mitigado con un guard en el paso 3b, no resuelto.

### Cierre de la ronda — los 4 literales secos

Auditoría posterior: de los 10 literales que enseñan la cadena, **4 iban anclados pero secos**, sin ninguno de los movimientos delante — y eran justo los pasos nuevos (contexto, bloqueo, curiosidad) más el follow-up de energía. Pasó porque la ronda iba de estructura y los literales se escribieron como especímenes de la regla, no como mensajes. Corregido: contexto lleva el movimiento 6 (anuncia el giro), bloqueo el 2 (ponte a su lado), curiosidad el 4 (opina del mundo con humor) y energía el 2.

De paso se retiraron las tres prohibiciones que el positivo dejaba sobrando (la frontera del método duplicada en el gate y en F2, y la de la pregunta-menú, que el par ❌/✅ de debajo ya enseña).

### Mapa para la poda pendiente

El bloque queda en **129.378 caracteres y 163 marcadores** de prohibición o alerta. Dónde está el grueso:

| Regla | Repetida en |
|---|---|
| No inventar emoción no verbalizada | 9 sitios |
| No repreguntar lo ya contestado | 6 |
| No fabricar urgencia / hipotética de plazo | 6 |
| Autopsia del método | 6 |
| La disponibilidad no se pregunta | 5 |
| Cierre cálido, no insistir | 4 |
| Su rutina / cuántos días / qué come | 3 |
| No nombrar la llamada antes de F5 | 3 |
| La pregunta-menú | 3 |

Nueve reglas ocupando 45 sitios. Y por secciones, `coach_structural_modifications` es el **35 %** del bloque y `coach_tone` otro **25 %**: entre las dos, el 60 %.

**Directiva de Iván para toda la autoría a partir de aquí** (destilada en `feedback_coach_marco_no_prohibiciones` §10-11): la prohibición deja de ser el recurso por defecto — se escribe exactamente lo que hay que hacer y con eso sobra, porque prohibir algo obliga a describirlo y describirlo es meterlo en el prompt. Y cuando una prohibición o un tope sobrevivan, basta decirlos UNA vez: si la regla está bien escrita se entiende que rige en todo el bloque.

### La poda de las 9 reglas repetidas

Aplicada sobre el mapa de arriba. Cada regla se queda en UNA casa y el resto se corta; donde el puntero hacía trabajo real se deja, donde solo repetía el argumento se va.

| Regla | Casa única | Sitios antes → ahora |
|---|---|---|
| No inventar emoción | `coach_tone_voiceprint` · TEST BINARIO | 12 → 8 |
| No repreguntar | `coach_special_protocols` · NO RE-PREGUNTAR | 6 → 4 |
| No fabricar urgencia | `coach_commitment_gate` | 8 → 6 |
| Autopsia del método | `coach_discovery_gate` · elemento 4 | 11 → 5 |
| La disponibilidad | F3 de `..._phases` | 4 → 2 |
| No insistir / buscarle el dolor | `coach_commitment_gate` · PUERTA B | 4 → 0 |
| Su rutina / días / qué come | `coach_discovery_gate` · LA FRONTERA | 1 → 0 |
| La llamada antes de F5 | `coach_tone_lexicon` | 5 → 1 |
| La pregunta-menú | `coach_tone_voiceprint` | 5 → 2 |
| **Total** | | **56 → 28** |

Dos frases se reescribieron en positivo en vez de borrarse, porque la prohibición era la única formulación que había: *"PROHIBIDO afirmar tú el estancamiento… es PREGUNTA"* pasa a *"el estancamiento se PREGUNTA, no se afirma"*, y la disponibilidad deja de enumerar dónde no se pregunta (*"ni aquí, ni en F2, ni al trabajar la objeción de tiempo"*) para decir una sola vez que **rige en todo el bloque**.

**Resultado medido:** 21 podas, −1.691 caracteres, sitios a la mitad. Los marcadores de prohibición quedan en **156, por debajo de los 158 con los que empezó la ronda**. El tamaño sigue **+3.147 sobre el punto de partida**: la poda paga las prohibiciones, no paga la fase de contexto ni el paso 4b, que son contenido nuevo. Verificado tras podar: 48 secciones XML balanceadas, cero líneas huérfanas, todos los punteros resuelven y **las 9 reglas conservan exactamente una casa**.

### Segunda poda: dentro de coach_tone y coach_structural_modifications

Las dos secciones sumaban el 60 % del bloque. La duplicación aquí no era entre secciones (esa la resolvió la poda anterior) sino **dentro de cada una**: reglas que se enuncian arriba y se vuelven a enunciar abajo, desglosadas.

**`coach_tone`** — concentraba 24 de los topes de contador del bloque.
- `coach_tone_variety`: las cuatro «REGLAS MECÁNICAS DE ALTERNANCIA» repetían la lista que tenían justo encima («relee tus 2 anteriores: no coincidas en apertura / emoji / estructura / validación / esqueleto»). Sobrevive lo único que la lista no cubría —que el **sub-tipo** de introducción también alterna—, y muere la cuota de «máximo 2 con muletilla en ventana de 5 mensajes», que exige contar cinco turnos hacia atrás clasificando cada uno.
- `coach_tone_voiceprint`: el PRINCIPIO RAÍZ reenunciaba los dos modos de abrir que `coach_tone_openers` ya define con su taxonomía. Pasa a puntero, conservando lo único operativo que aportaba: cuándo se reserva una muletilla.
- Y el «demostrativo + sustantivo abstracto» estaba en las dos secciones; se queda en openers.

**`coach_discovery_gate`** — 16,5 k, la subsección más grande del bloque.
- PUERTA DE F5 + COMPROBACIÓN + DECIDIR eran **tres líneas consecutivas** diciendo el mismo suelo desde tres ángulos (el umbral, el repaso y el freno). Una sola línea las cubre las tres sin perder nada.
- ANTI-BUCLE y «EL PRESUPUESTO ES UN LÍMITE» decían lo mismo; la primera absorbe a la segunda.
- El «test antes de enviar» de la negación aceptada reenunciaba la prohibición de la línea anterior.

**`coach_trigger_cierre_temprano`** — «el suelo sigue en pie» aparecía al abrir la sección y otra vez al cerrarla, diecisiete líneas después.

**Resultado acumulado de las dos podas** (29 cortes en total, sobre el punto de partida de la ronda):

| | pre-ronda | ahora |
|---|---|---|
| Caracteres | 124.540 | 125.363 (**+823**) |
| Marcadores de prohibición | 158 | **152** |
| Topes que exigen contar entre turnos | 36 | **32** |
| Sitios de las 9 reglas repetidas | 56 | **28** |

Verificado tras cada pase: 48 secciones XML balanceadas, cero líneas huérfanas, el bloque abre y cierra bien.

**Dónde queda el techo.** Los +823 caracteres que sobran son contenido que Rubén pidió: la fase de contexto entera, el paso 4b y los cuatro movimientos. Bajar de ahí ya no es podar duplicados, es recortar lo que se acaba de añadir. Los 32 topes que quedan son mayoritariamente **verificables mirando el mensaje que se escribe** (una pregunta por mensaje, máximo 3 líneas, no dos muletillas seguidas); los que exigían memoria de la conversación han caído.
