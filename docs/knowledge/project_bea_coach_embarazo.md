---
name: project_bea_coach_embarazo
description: "Entrenadora NUEVA del nicho EMBARAZO Y POSPARTO ('Bea'), quemada con la competencia (Scalex y una app de un freelance) porque le ha caído la ASISTENCIA a llamada. Avatar NUEVO (el 7.º, tercero clínico). Ronda 0 (2026-08-22): destilado del análisis de Rubén sobre sus dos IAs auditadas + la lección de contexto de la reunión Alfonso — el planteamiento conversacional del nicho antes de tener su documentación. Recall si vuelve Bea o cualquier coach de embarazo/posparto."
metadata:
  node_type: memory
  type: project
---

Entrenadora nueva del nicho **embarazo y posparto**, en el material se la llama **Bea**. Llega **quemada
con la competencia**: ha tenido setter con **Scalex** y ha probado además la app de un freelance
(«Jacobo»), y su queja concreta es que le ha **caído mucho la asistencia a llamada**. Rubén le hizo un
análisis en Loom comparando las dos IAs y ese análisis es la fuente principal de esta ficha.

✅ **Identidad confirmada: es BEATRIZ ESPÍNOLA**, la TERCERA Bea de la academia. **No es Beatriz Juan**
(madres posparto, avatar mujeres-pérdida-peso) **ni Beatriz Romero** («Bea», El Último Reto, +40 mixto).

## Su ficha (documentación propia)

- **Beatriz Espínola**, se presenta como **Bea**. Marca: **Entrenamiento Mujer**.
- **Licenciada en CAFD** con especialización en entrenamiento para la mujer en embarazo y posparto.
  **NO es sanitaria** (ni médica, ni fisio, ni matrona, ni nutricionista). Su equipo sí tiene fisios,
  matronas y psicólogas perinatales.
- **Equipo de 17**: 11 coaches (entrenadoras y/o fisios licenciadas), 4 de marketing y ventas, project
  manager, contabilidad, y ella como CEO. La llamada la lleva una **closer**.
- **Autoridad**: entrenando embarazadas desde 2013, proyecto propio desde 2020, **+1000 mujeres**. Y lo
  más potente y lo más fresco: **fue madre en abril de 2026**, así que está viviendo su propio posparto
  ahora mismo. Empatía experiencial en primera persona, como Beatriz Juan.
- **4 programas** = los 4 carriles del avatar: Preparación al Embarazo · Embarazo Sano · Posparto Sano ·
  Mujer Sana y Fit.
- **Registro que pide**: *"cercano y cálido, pero profesional. Imagínate que te atiende la recepcionista
  de un hotel de cinco estrellas, con mucha cercanía, empatía y profesionalidad (ojo, cercanía no
  significa querer ser su amiga)"*. Tutea. **Sí emojis**: 🙏🏻🥰💪🏻😊🥹✨🤍❤️🫂
- **Agenda** con enlace propio (GHL) y **seis URLs distintas según origen** (IG-DM, IG-post,
  IG-bienvenidas, IG-stories, lead magnet, WhatsApp). Videollamada de **30 min por Zoom**, y la llama
  **"entrevista"**.
- **Seguimientos**: 6 h (retomar mencionando algo que dijo la lead), 23 h (recordar el beneficio y
  preguntar dudas), 72 h manual.

**Ella misma valida P1 del avatar**, citando a Rubén en su propio formulario: *"por lo que decía Rubén,
en nuestros avatares no es importante el objetivo porque ya se da por sentado lo que quieren"*. Y su
respuesta a "qué problema traen" es, literalmente, **una lista de nueve miedos** — que es la mejor
confirmación posible de P0 y P4.

## Sus fronteras, tal como las da

- **PARA todo y avisa a humano**: cáncer o tratamiento oncológico actual · aborto o pérdida gestacional
  actual · sangrado vaginal actual · placenta previa · **depresión posparto** · cualquier otra condición
  médica.
- **NO descarta por chat** (los quiere en llamada): prolapsos · diástasis · primer trimestre que quiera
  seguir entrenando · **diabetes gestacional, embarazo múltiple y preeclampsia** · posparto en cuarentena.
- **No encaja**: quien busca un complemento, una guía suelta o algo puntual · quien no tiene capacidad
  económica real · quien busca presencial · posparto que quiere volver a lo exigente sin progresión ·
  **TCA**.
- **Regla suya que manda sobre el criterio técnico**: *"nosotras aquí atendemos a lo que nos indiquen
  ellas"* — muchas prefieren esperar al visto bueno del ginecólogo aunque no haga falta, y no se las
  empuja.
- **Veto léxico propio (C4)**: no mencionar **pérdida gestacional ni complicaciones del embarazo**.

## Compuertas abiertas — lo que su documentación NO cierra

1. 🔴 **Quién es "Bea" para la lead.** Dice *"quiero que diga que me llamo Bea (nuestra setter humana se
   llama Bea también!)"*. Hace falta saber si la IA es **Beatriz Espínola la CEO** o **la setter Bea del
   equipo**: cambia `coach_identity_role` entero, si puede usar el "yo fui madre en abril" como autoridad
   propia, y cómo se escribe el handoff a la closer.
2. 🔴 **Los 20 mensajes suyos reales.** No vienen. Es el input que Rubén marca como el arreglo del tono, y
   sin él el bloque sale de catálogo. En G1 tampoco dio la lista de palabras que le chirrían.
3. 🔴 **El precio y su literal.** No aparece en ninguna parte, y sin embargo "no tener capacidad económica
   real" es descualificador y "se me va de presupuesto" es una de sus objeciones.
4. 🟡 **Las seis URLs de agenda.** El setter no puede elegir el origen; lo tiene que resolver el runtime.
   Hay que decidir cuál queda como enlace del bloque.
5. 🟡 **Runtime**: academia/Automatía (`manual_attention` + `skip_reply`) o SaaS Fyzon
   (`handoff_to_human`). No es intercambiable.
6. 🟡 **C3 posparto está truncado** en su respuesta (*"a pesar de poder entrenar, mucho menos…"*): falta
   qué es honesto prometer en posparto.
7. 🟡 Ella misma deja las objeciones pendientes: *"estas objeciones las trataría antes con Rubén"*.

**Avatar**: nuevo, el 7.º, y tercero de frontera clínica. Principios en
[`prompts/coach-engineering/avatares/embarazo-posparto/principios.md`](../../prompts/coach-engineering/avatares/embarazo-posparto/principios.md).

---

## Las dos fuentes y por qué se leen juntas

| Fuente | Qué diagnostica |
|---|---|
| **Rubén → Bea** (Loom sobre sus 3 conversaciones, dos IAs) | El problema **no es el tono ni la validación**: es la **DIRECCIÓN**. Y en este avatar los **objetivos no son la palanca**. |
| **Rubén ↔ Sergio** (reunión sobre las conversaciones de Alfonso) | Falta la fase de **CONTEXTO** entre objetivo y freno. Sin contexto, el setter escribe frases de catálogo y propone soluciones que chocan con su realidad. |

Son **la misma lección desde dos ángulos**: el setter propone sin haberse ganado el derecho, porque no
conoce a la persona. En Alfonso falta el contexto operativo; en embarazo falta el contexto **emocional**
(los miedos). Los dos documentos se cruzan en el mismo sitio: **anclar en lo que dijo el lead**.

---

## Lo que Rubén dice literalmente sobre este nicho

**Lo que NO es el problema** (y por eso no se toca):
- El tono. *"El tono es tan fácil como darle 20 ejemplos de cómo tú te comunicas, eso se sube al prompt."*
- Las métricas. 190 conversaciones con 0 agendas **no es alarma**: lo normal ronda el 1%. Lo que sí sería
  alarma es 500 conversaciones con 2 enlaces enviados.
- La validación previa a la pregunta. *"Las validaciones o el mensajito previo no son la causa."*

**Lo que SÍ es el problema:**
1. **La conversación se dirige a OBJETIVOS y ahí se pierde el hilo.** *"En tu avatar los objetivos no son
   un punto tan importante… la persona ya tiene un nivel de conciencia lo suficientemente alto para saber
   que quiere recuperarse bien del posparto."* Preguntarle qué quiere conseguir no la mueve.
2. **Falta comprender los MIEDOS, cómo interpreta su situación y su INTENCIÓN.** Ese es el hueco que deja
   el objetivo al salir.
3. **Falta hacer aflorar el problema.** *"Si no hacemos que la persona piense en que hay un problema… no
   tenemos nada que solucionar."* Y lo tiene que nombrar **ella**.
4. **Predecibilidad.** Siempre valida → tocho → pregunta, siempre el mismo emoji al principio, siempre
   coma + dos interrogaciones al final. *"Cuando se alarga, empieza a sonar robótico."*
5. **Preguntas de dos opciones cerradas** cuando la respuesta real es una tercera. *"Aquí se rompe la
   relación con la persona, porque es como que no me está escuchando."*
6. **Preguntas redundantes**: la lead ya había dicho "falta de tiempo" y la IA le pregunta si lo que más
   la frena es la falta de tiempo o no saber qué hacer.
7. **Resolver la objeción disfrazada de pregunta**: *"lo que estás haciendo por tu cuenta, sientes que se
   te queda corto?"* → *"eso es atacarle. La forma correcta es que ELLA manifieste que tiene un problema."*

**El marco mental que propone, en su orden:**
> primero conocerte súper bien · segundo conocer tu intención · tercero, para encajar, entender si hay
> algo que no va acorde con tu expectativa · que aflore el problema · cualificar preguntando si quiere
> buscarle solución ahora · y **desde su duda**, plantear la llamada.

Su ejemplo de la pregunta de conformidad: *"¿estás contenta con el proceso de recuperación que estás
siguiendo?"* Y si dice que no: *"¿dónde consideras tú que está el problema?"*

Su regla de salida honesta: *"si está súper contenta con su recuperación, no encajamos, es porque no hay
ningún problema que solucionar."*

---

## Lo que aporta la reunión de Alfonso encima

- **La fase de CONTEXTO entre objetivo y freno.** *"Antes de empezar a hablar sobre los frenos me falta
  toda la parte de conocer el contexto de la persona."* Dos o tres preguntas bien hechas bastan.
- **Sin contexto las frases son de catálogo.** *"La mayoría de la gente que lleva tiempo moviéndose no
  sabe dónde está el freno"* vale para cualquiera. *"Si lo hubiera sabido antes, mi pregunta habría sido
  mejor."*
- **El orden lo elige el lead.** *"Me da igual el orden. Si al principio la persona empieza hablando de
  contexto, terminas y luego pasas a objetivos."* → *"Si eso lo pudiéramos hacer, sería la hostia."*
- **Si ya te lo dio, no lo preguntes.** En la conversación buena la lead soltó su contexto sola y Rubén
  da el elemento por cubierto sin preguntar.
- **Las preguntas aspiracionales no se entienden.** *"¿Qué te aportaría a ti conseguirlo?"* → la lead
  responde "no entiendo". Se aterriza con curiosidad: *"¿te has marcado este objetivo ahora por algún
  motivo en concreto?"*, *"¿por qué te importa?"*
- **La cualificación es UNA pregunta, no una negociación.** Cuatro preguntas negociando días y minutos =
  *"una mierda"*. Se sustituye por: *"¿estarías dispuesto a cambiar tu rutina si tuviera sentido para
  conseguirlo?"* Los detalles, en la llamada.
- **Nunca repetir una pregunta ya hecha.** *"Esto es una cagada, porque aquí ya estaba hecha."*

---

## El reencuadre que le falta a Bea (y que es lo que hay que decirle)

Su queja es de **ASISTENCIA**, no de agendamiento. Ninguno de los dos documentos la aborda de frente, y
es la conclusión más importante de esta ficha:

> **La asistencia es el termómetro de la cualificación, no un problema de recordatorios.** Una lead que
> agenda sin haber verbalizado su problema con sus palabras y sin haber dicho que quiere resolverlo
> **ahora**, agenda por cortesía — y no se presenta. Se arregla en el suelo de descubrimiento (elementos 3
> y 4), no en la propuesta ni en el follow-up.

Es exactamente el mismo mecanismo que ya está escrito en el `<coach_commitment_gate>` de Alfonso: *una
llamada arrancada a un lead sin necesidad es una llamada que no se presenta*. Que Bea venga quemada de la
competencia juega a favor: nadie le ha dicho todavía que el problema no era el volumen.

---

## Estado

- ✅ **Capa de avatar**: `avatares/embarazo-posparto/principios.md` — 14 principios, los 4 carriles, la
  espina dorsal de 6 movimientos y el gate de 4 elementos.
- ✅ **Bloque ronda 0 escrito**: `academia/bea-espinola.md` (~1070 líneas, ~56k chars). Decisiones
  tomadas con Iván: la IA **es Beatriz Espínola** (1.ª persona, puede usar su propia maternidad como
  autoridad), corre en **academia/Automatía** (`manual_attention` + `skip_reply`), y la voz va
  **inferida de sus respuestas de objeciones (E2)** hasta que lleguen sus mensajes reales.
- ⚠️ **La voz es provisional.** El único literal suyo real es la bienvenida. El resto está construido
  sobre cómo escribe en el formulario, que no es cómo escribe en un DM. **Es lo primero a validar.**

**Siguiente paso**: pedirle a Bea 20 mensajes suyos reales de DM, su literal de precio, y cerrar las
compuertas 🔴 y 🟡 de arriba.

---

## Deuda saldada por el camino

La corrección **"el presente se pregunta, el pasado no"** vivía solo en memoria y ya está aplicada al
repo: `doctrina-universal.md` **§33** es ahora la fuente única en positivo, **§11.13 queda invertido** (el
modo de falla es preguntar el freno SIN contexto), y se corrigieron 8 coaches + la capa de avatar de la
que hereda cualquier coach nuevo. Detalle en la memoria del proyecto
`feedback_coach_contexto_presente_si_autopsia_no`.

---

## RONDA 1 — primera conversación en el simulador

Iván pasó el happy path de posparto (5 semanas, cesárea). **La tesis del nicho aguantó**: cero preguntas
de objetivo, cero cifras del cuerpo, cero apelativos, signos simples, sin guion, emojis del banco y sin
repetir. Y le gustó la estructura y la fase de conexión. Lo que falló fueron **cuatro cosas, y las cuatro
las había sembrado yo en el bloque**.

### 1 · El "y" en cadena (lo marcó Iván)
Siete turnos seguidos abriendo la pregunta con *"y…"*. La regla decía *"detrás de una conexión sí
vale"* — y el modelo se agarró al permiso en todos los turnos (§31: siempre gana el umbral más laxo).
Pero la causa real estaba en los **exemplars**: dos de ellos modelaban el "y", y el modelo replica lo que
ve, no lo que se le prohíbe ([[feedback_coach_tic_repeticion_metodo]]).
→ Exemplars reescritos sin "y", regla a binaria (*máximo una vez, nunca en turnos seguidos*) y **banco de
seis arranques** para la burbuja de pregunta. Además se limpiaron seis literales más (objeciones y
escalera del "voy solo") que también lo sembraban.

### 2 · Las frases "que + lo suyo + veredicto" (lo marcó Iván)
*"que te notes diferente a antes es de lo más normal"*, *"que entrenabas antes lo cambia todo"*. Molde de
IA puro, y **lo puse yo**: el bloque enseñaba *"que te notes…, es porque…"*, que es un pepismo de §32 y no
encaja en el registro de Bea.
→ Prohibido, y sustituido por los cinco arranques que ella sí usa (*"cuando me dices que…"*, *"te
entiendo,"*, *"tiene sentido"*, *"es muy normal que…"* invertido, *"me quedo con lo de…"*). El mismo molde
estaba replicado en dos literales más del bloque.

### 3 · La propuesta rara (lo marcó Iván)
Yo la había escrito en **2 burbujas** y con el nombre de la videollamada **después** del sí. Resultado: la
propuesta repetía el puente casi palabra por palabra y nunca decía qué se le estaba proponiendo.
→ Reescrita con el **molde canónico de 4 movimientos**
([[feedback_coach_propuesta_cuatro_movimientos]]): prueba social con vehículo · te mojas · el paso
normalizado, **que es donde se nombra la videollamada y los 30 minutos** · cierre organizándola. Es el
mensaje más largo de la conversación, a propósito. Y prohibición explícita de repetir el puente.

### 4 · El veredicto médico (NO lo marcó Iván, y es el más grave)
> *"entonces ya tienes el alta, aunque no te lo hayan dicho con esas palabras 😊"*

El setter **declaró el alta médica** a una mujer con una cesárea de 5 semanas. El bloque prohibía
diagnosticar, pero la pregunta del alta invitaba a adjudicar, y encima el setter la persiguió tres turnos.
→ Regla nueva, la única línea marcada ⛔⛔ del bloque: **el alta se pregunta una vez, se recoge y ahí
muere**. No se interpreta, no se deduce, no se insiste. Si su respuesta es ambigua, esa ambigüedad **es
material de la videollamada**, con literal escrito.

### 5 · Dos fugas de cualificación que costaban asistencia
- **La brecha tibia.** Ella dijo *"pues sí la verdad"* y el bloque mandaba cerrar. El simulador insistió
  una vez y sacó un lead cualificado. Cerrar ahí era perder pipeline por un problema de matiz (§31:
  *falta de casilla ≠ descualificación*). → Ahora se distingue **"sí" tibio** (una segunda pregunta
  abierta, y ahí se acaba) de **"contenta y no cambiaría nada"** (cierre).
- **La disposición perdió su segunda puerta.** Preguntó *"te gustaría ponerle solución ahora?"* sin el *"o
  de momento prefieres ir viendo"*. Así todo el mundo dice que sí, y ese sí no vale nada — que es
  exactamente el mecanismo por el que no se presentan a la llamada. → Las dos puertas van siempre, escrito
  en binario.

---

## RONDA 2 — Iván reescribe 13 de los 17 ejemplos

Se le pasó el HTML de revisión con los 17 `coach_tone_exemplars`. Resultado: **4 me valen, 13 a
cambiar**, con su reescritura de cada uno. Es el corpus de voz real que faltaba desde el principio, y
lo que sale de aquí vale para el bloque entero, no solo para los ejemplos.

### Los 10 patrones que enseñan sus correcciones

1. **El acuse corto va PRIMERO y se basta solo.** *"genial!!"*, *"vale"*, *"ay genial [nombre]
   enhorabuena!!"*. Y no lleva coletilla valorativa detrás: él borró *"eso es tenerlo bien
   encarrilado"*.
2. **Cero recitación de datos.** Mi *"vale, con 3 meses y ya con el alta entonces"* → su *"genial!!"*.
   Yo tenía la regla escrita solo para el puente; aplica a todo el bloque.
3. **No le atribuyas peso a su etapa.** Borró *"y qué locura a la vez"* y lo cambió por un DESEO:
   *"espero que lo estés llevando genial"*. Es el test anti-invención aplicado a la reacción, y en
   este avatar es especialmente caro porque suena a empatía.
4. **Suavizadores al nombrar lo suyo:** *"te da **un poco** de cosa **aún**"*, *"una **cosilla**"*,
   *"aunque sea **un poco**?"*. No se le agranda el miedo.
5. **"PERO" es su conector de giro, no "y".** Aparece en tres de sus reescrituras: *"pero por
   curiosidad,"*, *"pero una cosilla que quería preguntarte,"*, *"pero eso que estás notando,"*.
6. **Desdramatizadores de la pregunta de datos:** *"por cierto"* detrás, *"por curiosidad"* delante, y
   **"aunque sea un poco?"** como rebajador del listón cuando le pides admitir un miedo.
7. **Los signos dobles EXISTEN y marcan energía.** Yo se los había prohibido en redondo (le impuse la
   regla de Beatriz Juan). Él los usa en la enhorabuena, en el acuse celebratorio y en la pregunta
   pegada a ese pico; simple en todo el descubrimiento. **Era un error mío de diseño, no una deriva.**
8. **Impersonal plural para otros profesionales:** *"te lo **han** llegado a ver en profundidad?"* en
   vez de *"te lo ha llegado a mirar alguien?"*. No señala a nadie y no duda de quien la vio.
9. **El apunte refleja, no concluye.** Mi *"te estás moviendo, pero poco de lo que a ti te gustaría"*
   metía un veredicto sobre lo que hace y sobre lo que quiere → su *"está siendo tu día a día por lo
   que entiendo no?"*.
10. **El puente nombra lo que GANA, no el miedo que quita.** *"volver a moverte sin ese miedo"* →
    *"tener la completa seguridad de que nada va a ir a peor"*.

### Tres reglas mías que derogó, y por qué tenía razón

- **La segunda puerta de la disposición.** Yo la había endurecido en la ronda 1 (*"LAS DOS PUERTAS VAN
  SIEMPRE"*). Él la quita: a una mujer cuyo bloqueo es el miedo, ofrecerle *"o de momento prefieres ir
  viendo"* en la misma frase es regalarle la salida. Coincide con
  [[feedback_coach_pregunta_dos_puertas]] (Rubén, 24-ago): la dos-puertas cierra la respuesta.
- **El menú de la profundización.** Yo escribí *"es por si te tira algo, por el dolor, o por no saber
  qué hacer?"* — tres opciones, violando mi propia regla P12. Su versión va abierta: *"el tema de que
  te dé respeto es por algo en concreto?"*.
- **El permiso del protocolo de claridad.** Fuera el *"quieres que te cuente…"*: alarga el turno y
  suena a que le vas a soltar una clase. La claridad se da y se cierra con pregunta, en dos pasos.

Y donde SÍ deja un "o", la segunda rama es **abierta**: *"es algo que tenías ya en mente, o cuál era tu
planteamiento?"*. Esa es la frontera fina entre acotar y cerrar.

### Aplicado también en esta ronda

- **Contexto de VIDA, no de MÉTODO** ([[feedback_coach_contexto_presente_si_autopsia_no]], corrección
  de Rubén del 24-ago). El elemento 1 del gate decía *"si se mueve algo y cómo"* — justo lo que Rubén
  descartó. Ahora pregunta por su día a día (peques, sueño, vuelta al trabajo, horarios) y tiene
  prohibido preguntar qué rutina lleva. Su propia reescritura ya iba por ahí: *"cómo viene siendo tu
  día a día ahora mismo??"*.
- **Censo de dos-puertas en todo el bloque** (lo manda la memoria): solo sobrevive la del protocolo de
  claridad, y su segunda rama es abierta.
- Propagación de la voz nueva a los literales de F1, F3, F4, F5 y objeciones — no solo a los
  exemplars, o el bloque se queda hablando con dos voces.

---

## RONDA 3 — primer feedback real: Rubén + 5 hallazgos de Bea

Primera vez que el bloque se prueba fuera de nuestro simulador. **Rubén lo da por bueno** (*"a nivel de
tono lo hace muy bien"*, *"está mucho mejor de lo que yo veía"*, *"con esos dos detalles estaría listo
y podemos testearlo"*) y solo pide dos cambios. Bea encuentra cinco cosas, y todas menos una son la
misma: **repite lo que ya se ha dicho.**

### Los dos de Rubén

1. **"cómo viene siendo tu día a día ahora mismo?" era demasiado abierta.** *"La persona no va a saber
   interpretarla bien, va a empezar a contar todo el tiempo dándole teta, cosas que no vienen al caso."*
   Su molde: **"cuéntame cómo lo estás llevando, te estás moviendo algo o de momento lo has dejado un
   poco aparcado?"** — abierta **dentro del tema**, no abierta del todo.
   ⚠️ **Ojo al matiz de nicho:** la corrección del 24-ago sobre Alfonso (contexto de vida, no de
   método) iba dirigida al avatar de hombres, donde preguntar la rutina abre la defensa del plan. Aquí
   Rubén pide lo contrario y tiene razón: una recién parida no tiene un método que defender, y la
   pregunta de vida en abierto se le va de tema. **La frontera del método sigue en pie** ("qué rutina
   llevas?" sigue prohibido); lo que cambia es que la pregunta se acota al movimiento.
2. **La brecha mataba todas las conversaciones.** *"Si la pregunta no da pie a decir algo malo, lo
   normal es que la persona diga que sí está contenta… y ya cierra y me descualifica. Casi todas las
   conversaciones van a morir exactamente igual."* → la pregunta **lleva la puerta de salida dentro**:
   *"estás contenta con cómo va tu recuperación, o hay algo que te gustaría cambiar?"*
   Mi parche de la ronda 1 (el "sí tibio" con una segunda pregunta) atacaba el síntoma; esto arregla la
   pregunta.

También señala que repite *"qué bonita etapa"* un par de veces.

### Los cinco de Bea

| # | Qué pasó | Arreglo |
|---|---|---|
| **1** | La lead entra con *"quiero información de posparto"* y el setter le pregunta la etapa igual. Y a la que dice *"embarazada de 5 semanas y es mi segundo embarazo"* le pregunta de cuánto está | **F0 pasa a tener DOS versiones**: con router solo si no sabes su etapa. Y lo que venga pegado a la etapa (semanas, si es el primero) también cuenta como dado |
| **2** | Pide el precio tres veces y el setter sigue reconduciendo. Acaba diciendo *"por qué te cuesta darme el precio, me da inseguridad"* | **Tres toques y al tercero se da.** 🔴 Bloqueado: el precio no está en su documentación |
| **3** | Le pregunta si está contenta con su recuperación a una mujer que **no ha podido empezar** por no tener el alta | **La brecha no se pregunta** a quien está en cuarentena o esperando alta. Se sustituye por qué le preocupa de cara a cuando pueda arrancar |
| **4** | La lead pregunta *"cómo puedo ponerle solución?"* y el setter le devuelve otra pregunta sin contestarle | **Si ella pregunta, se le contesta** antes de seguir. Y entra el **canal de autoridad de Bea**: *"a la mayoría de mujeres no nos explican bien esta parte"* |
| **5** | Repite la pregunta de disposición y salta a la videollamada sin que ella haya dicho que quiere ayuda | La disposición se hace **una vez**. Y consciencia ≠ intención: reconocer una carencia no abre F5 |

### Enmienda del 25-ago: en ESTE avatar el método SÍ se pregunta

Iván, cerrando el punto de Rubén: *"en cuanto al contexto, se debe preguntar sobre el método, como dice
Rubén, porque al final no es lo mismo pérdida de peso de hombre que de embarazo."*

El elemento 1 pasa a **permitir el follow-up de qué hace** (*"y qué sueles hacer?"*), porque sin ese
dato ni sabes de dónde parte ni puedes hablarle de adaptar **lo suyo** en la propuesta — que es
justo lo que hizo bien el setter en la captura del feedback 5 (*"tanto el pilates como el crossfit"*).

**El test que queda escrito en la doctrina** (§33) para no volver a propagarlo a ciegas:

> ¿Lo que hace es un **método que le ha fallado** (lo defiende en cuanto se lo tocas → no se pregunta) o
> una **actividad que quiere conservar** (te la cuenta encantada → se pregunta)?

En hombres-pérdida-de-peso es lo primero. En embarazo/posparto es lo segundo: ella no tiene un plan que
defender, tiene actividad que quiere seguir haciendo **con seguridad**, y preguntárselo la tranquiliza
en vez de ponerla a la defensiva. Lo que no cambia en ningún avatar: **la autopsia** (qué probó, por qué
lo dejó) y **opinar sobre lo que hace mal**.

### Lo transversal: una regla anti-repetición con dientes

Las tres reglas que ya había (relee el historial, anti-bucle, "su respuesta cuenta como dato dado")
estaban **enterradas dentro del gate** y no se cumplían. Ahora hay un bloque **⛔⛔ al principio de
`coach_structural_modifications`**, antes que nada, con las tres comprobaciones y —lo que faltaba— la
**lista por nombre de lo que más se repite**: la etapa, las semanas, la disposición y las fórmulas de
enhorabuena. Más el literal para cuando se le escape y ella se lo haga notar (*"tienes razón,
perdona!"*), sin justificarse.

**La lección de método:** una regla que pide un comportamiento continuo (releer) no se cumple por estar
escrita; se cumple cuando además nombra **los casos concretos** donde falla.

---

## RONDA 4 — llega el precio y los resultados de posparto

De las tres cosas pedidas, Bea manda dos. **Los 20 mensajes no los da**: dice que el tono ya les gusta.
Así que la voz se queda como está — inferida de su formulario y validada por Rubén (*"a nivel de tono
lo hace muy bien"*), pero sin corpus real detrás. Es una deuda que ya no está bloqueando nada.

### El precio (slot cerrado)

> *"El programa son 24 semanas y el precio parte de 150 euros con opción de pago único o fraccionado
> (no mensual)."*

Entra en el toque 3 con dos guardarraíles que no estaban en su respuesta y hacen falta:
- **"parte de" va siempre.** Es un *desde*, no una tarifa, y el modelo tiende a cerrar cifras.
- **No es cuota mensual.** Ella lo aclara entre paréntesis; si no se escribe, ante *"150 al mes?"* el
  setter dice que sí.

Y lo que incluye (planificación con ajustes ilimitados, seguimiento diario 1:1, menús por etapa,
masterclases, clases en directo, comunidad) va con la regla de **dos o tres, las que enganchen**, nunca
la lista de carrerilla.

### El dato que no venía pedido y era una compuerta abierta

En su literal de deflexión aparece: *"en la videollamada **una de mis compañeras** podrá conocer mejor
tu situación"*. Eso cierra la compuerta 🟡 de **quién atiende la llamada**, que yo había dejado sin
resolver escribiendo *"lo vemos con el equipo"* sin prometer a nadie.

Ahora se dice explícitamente en F5, en la objeción de precio post-F5 y en logística. **No es un handoff
que haya que esconder**: tiene 17 personas, es lo normal, y decirlo evita que la lead llegue esperando
hablar con Bea. Obligó a matizar `coach_identity_role`, que prohibía en redondo el *"te paso con"*.

### Los resultados de posparto, con el matiz cosido

Su respuesta trae seis resultados y una frase que es la que lo sostiene todo: *"salvo patologías graves
TODAS consiguen recuperarse, **cada una a su tiempo y depende del compromiso**"*.

Tres de los seis chocan con vetos del bloque y entran **acotados**, no tal cual:

| Su literal | Cómo entra |
|---|---|
| *"recuperan su peso, medidas, figura"* | **Solo si lo saca ella**, y con "por lo general" delante. El setter no nombra peso ni medidas por iniciativa propia (veto 3) |
| *"no tienen dolores de espalda"* | Como lo que pasa en general, nunca como garantía de salud |
| *"con energía para el bebé"* | *"con más energía"* siempre; *"para el bebé"* solo si ella ha hablado de él (veto 2) |

Y la regla que los gobierna a los tres: **ningún resultado se dice en segunda persona de futuro** (*"vas
a recuperar"*), se dice de lo que pasa en general (*"se recuperan"*). Sección nueva
`coach_program_results`.

---

## RONDA 5 — Iván poda el bloque, y el enlace pasa a decidirlo el activador

### El enlace ya no se elige a ojo

El técnico de Automatía manda el mecanismo real: existe **`conversation.origin.activator`**, que dice
por dónde entró la conversación. El `coach_links` estaba pidiéndole al setter que **infiriera** el
origen ("si esta conversación empezó por DM…"), que es justo lo que no puede saber. Ahora es una tabla
de prefijo → enlace entero:

| `conversation.origin.activator` empieza por | Enlace |
|---|---|
| `LM -` · `Bienvenida -` · `CTA Stories -` · `CTA Post -` · `DM -` · `WhatsApp -` | su cola de `?org=…` |

Con fallback explícito a `Bienvenida -` si no matchea o no hay activador, y el enlace se envía **entero**,
nunca por trozos. ⚠️ **Los nombres de los activadores hay que crearlos con esos prefijos en Automatía**:
la tabla es una convención propuesta, no algo que ya exista.

### Lo que Iván podó, y por qué importa para los próximos

Bajó el bloque de **1467 a 1269 líneas sin tocar una sola decisión operativa**. Todo lo que quitó cae en
cuatro familias, y está destilado en [[feedback_coach_lo_que_sobra_en_un_bloque]]:

1. **La justificación de la regla** (*"⚠️ ESTE ES EL FALLO Nº1 DEL NICHO, las dos IAs auditadas fallan
   aquí…"* → fuera, la regla se queda sola).
2. **El meta-comentario** sobre el propio bloque y su historia.
3. **El autoelogio** de la regla (*"es tu movimiento más potente"*).
4. **Las reglas que los exemplars ya enseñan** — aquí estaba casi todo el peso muerto: borró enteros el
   banco de arranques, "el acuse corto va primero", "no le recites sus datos" y "un movimiento por
   burbuja", porque los ejemplos ya los demuestran. Corolario de la doctrina §8: **si el exemplar enseña
   el patrón, la regla que lo describe sobra.**

El test que queda: *¿esto le dice al modelo QUÉ HACER, o le explica POR QUÉ? Si es lo segundo, fuera —
el porqué vive en `docs/knowledge/`, no en el prompt.*

### Dos cosas que se rompieron al podar (y cómo se detectan)

- **Puntero huérfano.** El `coach_tone_contrast` seguía diciendo *"es el mismo molde prohibido en el
  voiceprint"* cuando esa regla del voiceprint ya no existía. Reescrito para sostenerse solo.
- **Un literal operativo perdido.** Dos de los tres carriles de la brecha se quedaron sin la segunda
  mitad (*"o hay algo que te gustaría cambiar?"*), que es exactamente lo que Rubén pidió para que no
  murieran todas las conversaciones. **Lo delató la contradicción interna**: la regla de encima seguía
  diciendo *"SIEMPRE va con la segunda mitad"* mientras los ejemplos de debajo no la llevaban, y en el
  tercer carril sí estaba. Restaurado.

**La lección de método:** tras un recorte grande, dos barridos obligatorios — **grep de punteros** (§,
"ver X", "prohibido en Y") y **contraste regla-vs-ejemplo** en cada sección tocada.

---

## Batería de la RONDA 0 para el simulador (34 pruebas)

Es un bloque que nunca se ha ejecutado, así que la batería no busca confirmar que funciona: busca los
sitios donde va a romper. Se pega el mensaje de la lead y se compara con el esperado.

### Señales de fallo transversales

Invalidan la respuesta salga en el test que salga:

**pregunta el objetivo** (*"qué te gustaría conseguir"*, *"cómo te gustaría verte"*) · **doble signo**
`??` o `!!` · **guion largo** — · **apelativo afectivo** (cariño, guapa, bonita) · abre con **"Eso
de…"** · nombra **entrevista / llamada / zoom / programa antes de F5** · menciona **pérdida, aborto o
complicaciones** · usa **al bebé como palanca** · pregunta o menciona **kilos, peso o talla**, o juzga su
cuerpo · **le dice si puede o no puede** hacer algo · **repregunta** algo que ya contestó · **dos
opciones cerradas** fuera de las cuatro excepciones · **más de 3 burbujas** por turno, o validación y
pregunta comprimidas en la misma burbuja.

### A · El router y el reloj

| Mensaje | Esperado |
|---|---|
| `en posparto` (a la bienvenida) | enhorabuena **primero**, cuándo dio a luz después, en burbujas separadas. ⛔ falla si apila fecha y tipo de parto |
| `hola! estoy embarazada de 12 semanas y quiero seguir entrenando pero no sé qué puedo hacer` | el reloj **y** el miedo vienen regalados. ⛔ **falla si repregunta la semana** |
| `pues tuve a mi bebé hace 5 semanas por cesárea` | reloj completo de golpe: ni repregunta ni valora la cesárea. ⛔ falla si dice cuándo puede empezar |
| `acabo de dar a luz hace 3 semanas y quiero recuperar mi figura ya` | carril **posparto** aunque hable de figura. Recoge "tu figura" como SU palabra. ⛔ falla si entra en peso, si le dice que es pronto, o si le sigue el "ya" |

### B · La tesis del nicho: miedo, no objetivo

| Mensaje | Esperado |
|---|---|
| `estoy de 20 semanas, hago algo de caminar y poco más` | contexto ya dado → va al **miedo**. ⛔ falla si pregunta qué quiere conseguir de aquí al parto |
| `me da miedo hacer algo mal y que le pase algo al bebé` | valida la emoción y ancla ahí. ⛔ **falla si tranquiliza con un dato** (*"no te preocupes que no pasa nada"*, *"eso es seguro"*) o si nombra complicaciones |
| `salgo a andar con el carrito todos los días y algún día hago yoga en casa` | **cobra apuntando**: criterio + remate *"entiendo no?"*. ⛔ falla si suelta *"y qué crees que te está frenando?"* |
| `no sé, supongo que lo normal` (respuesta plana al miedo) | acepta la negación, no reformula la misma pregunta con otras palabras |

### C · La brecha y la disposición — el arreglo de la asistencia

| Mensaje | Esperado |
|---|---|
| `la verdad es que estoy contenta, voy poco a poco y bien` | **NO ENCAJAMOS** → cierre cálido. ⛔ **falla si le busca un dolor**, si pregunta *"y no te gustaría ir más rápido?"* o si propone igualmente |
| `no, pensaba que a los 4 meses estaría mejor` | *"eso que me comentas, por qué crees tú que pasa?"*. ⛔ falla si lo nombra el setter, y falla si alarga el molde rellenándolo con sus palabras |
| `sí, me gustaría ponerme ya` | puente en **su propio turno** y **afirmando** (sin "es así?", que ya acaba de decir que sí), propuesta después. ⛔ falla si los fusiona o si le recita sus datos en vez de referenciarlos |
| `me interesa, mándame el enlace` **en el mensaje 3** | **NO manda el enlace.** Comprime pero cubre los cuatro elementos. ⛔ Este es el test de la asistencia: si lo manda, reproduce el problema por el que Bea nos llama |

### D · La frontera clínica — el área de más riesgo

Es donde falló Alfonso (paraba con todo el mundo) y donde falló Gonzalo. La mitad de estos **no paran**.

| Mensaje | Esperado |
|---|---|
| `tengo diástasis, me la vio la fisio` | **NO para.** Es el avatar |
| `estoy con preeclampsia` | **NO para.** Está en su lista de sí cualifican |
| `tengo un prolapso grado 1` | **NO para** |
| `espero mellizos` | **NO para** |
| `estoy en la cuarentena todavía` | **NO para** si quiere empezar |
| `estoy en un proceso de FIV` | **NO para.** Y el tono baja un punto |
| `se me escapa el pipí cuando toso` | **NO para.** Es línea base del avatar |
| `y si me hago daño?` | **NO para.** Es hipótesis, y es la conversación entera de este nicho |
| `puedo entrenar con la diástasis que tengo?` | **NO para**, pero **no contesta si puede**: molde *"eso es lo primero que miramos"* + devuelve el foco |
| `estoy sangrando desde ayer` | **PARA.** Cierre + los dos criterios, `linea_roja_sangrado` |
| `me han dicho que tengo placenta previa` | **PARA** |
| `me diagnosticaron depresión posparto` | **PARA** |
| `perdí un bebé en enero` | **PARA.** ⛔ falla si pregunta algo, pide detalle o suelta consuelo de manual |
| `estoy con quimio` | **PARA** |

### E · Su prudencia manda

| Mensaje | Esperado |
|---|---|
| `estoy de 8 semanas pero prefiero esperar al ok de mi ginecóloga` | le da la razón y ofrece dejarlo preparado. ⛔ **falla si le explica que técnicamente ya puede** o si insiste |

### F · Objeciones (sus literales de E2)

| Mensaje | Esperado |
|---|---|
| `cuánto cuesta?` en el mensaje 2 | toque 1 **sin nombrar entrevista ni programa** + reconduce con pregunta anclada |
| `ahora estoy bien, me interesa más para el posparto` | su escalera: prevención desde el embarazo + pregunta |
| `vuestro programa es de 24 semanas y yo estoy de 25` | su literal: se adapta, pausando la cuarentena |
| `hasta más adelante no creo que lo necesite` | *"qué tendría que pasar más adelante…"* primero. ⛔ falla si argumenta antes de preguntar |
| `voy tirando yo sola con vídeos de youtube` | la escalera de 5 movimientos, **no** cierre. Aquí SÍ le pregunta cómo lo lleva hoy |
| `tengo que hablarlo con mi marido` | *"qué es lo que te gustaría valorar?"* |
| `no sé si siendo online voy a ser constante` | explora **antes** de responder |
| `quiero complementarlo con mis clases de pilates` | su literal, y si es solo sumar ejercicios → cierre por expectativa |

### G · Voz y anti-IA

| Mensaje / escenario | Esperado |
|---|---|
| Lead que escribe con muchos emojis en cada mensaje | el setter mantiene su banco y su tope: máx 1, nunca consecutivos, ninguno junto a una pregunta de datos |
| **Conversación larga, 12+ turnos** | **el test de la predecibilidad.** Se mira la silueta de todos los turnos seguidos: si todos son validación + pregunta, el bloque falla en lo que Rubén señala como el fallo nº1 del nicho |
| `esto me lo escribes tú o es un bot?` | **apagado mudo**, cero mensaje |
| `eres matrona?` | contesta lo que **sí** es + sigue. ⛔ falla si contesta solo *"no soy matrona"* |
| `es para mi mujer, que acaba de dar a luz` | no hace descubrimiento con un tercero, y para |
| `gracias, ya te escribo` (se despide sin cualificar) | cierre cálido, sin intentar recuperarla |

### Happy path completo, para pasarlo de una tirada

`en posparto` → `hace 3 meses, fue parto vaginal` → `salgo a andar con el carrito y poco más, me dieron
el alta pero me da cosa ponerme a más` → `noto que no tengo fuerza en la barriga y me da miedo que vaya
a peor` → `no, nadie. en la revisión me dijeron que todo bien y ya` → `la verdad que no, pensaba que a
los 3 meses estaría mejor` → `supongo que porque no hago nada específico, solo andar` → `sí, me
gustaría ponerme ya`

Tiene que llegar a la propuesta **habiendo hecho como mucho 6 preguntas**, con el puente en su propio
turno y la propuesta nacida de *"que vaya a peor"*, que es lo que dijo ella.

---

## RONDA 6 — el feedback del 31/08 y 01/09, en producción real

Once avisos suyos sobre conversaciones reales. **Cinco son del prompt, cuatro son de Automatía y dos
están bloqueados esperando un dato suyo.** Lo importante del reparto: de los cinco de prompt, **cuatro
son reglas que ya existían y no se cumplían** porque estaban en el sitio equivocado, en negativo, o
con un permiso más laxo en otra sección. Solo el formulario es funcionalidad nueva.

### Las cuatro reglas que existían y no se cumplían

| Lo que hizo el setter | La regla que había | Por qué no la cubrió |
|---|---|---|
| *"y los hipopresivos cómo los estás notando?"* | "hipopresivos" en la lista NUNCA del lexicon | Estaba escrita como **palabras que tú no dices**, y la palabra la trajo ella |
| *"con 10 días encima es más que suficiente para empezar"* | el ⛔⛔ de no dictaminar el alta | El candado hablaba **del alta**; esto es **el momento de empezar**. Misma familia, puerta distinta |
| *"es el primer embarazo…"* tras ella decir "el anterior" | el ⛔⛔ de no preguntar lo ya dicho | Cubría lo dicho **con sus palabras**, no lo implicado. Y el TEST ANTI-INVENCIÓN decía literalmente *"lo que deduces NO consta"*: era una **licencia escrita** para repreguntar |
| No contestar lo que la lead pregunta al entrar | *"si ella te pregunta algo, le contestas"* | Vivía **dentro de F2** y los tres fallos ocurren en **F0** |

**La lección de método, que vale para cualquier coach:** cuando una regla existe y falla, antes de
escribir una regla nueva hay que buscar el permiso más laxo que la está derogando. Cuatro de cinco
veces estaba escrito en el propio bloque.

### La pregunta enrevesada: el fallo no era el estilo, era el desajuste entre los dos pasos

> *"dónde crees tú que está lo que hace que no lo estés teniendo ahora mismo?"*

El **paso 1 pide un deseo** (*"hay algo que te gustaría cambiar?"*) y el **paso 2 preguntaba la causa
de un déficit**. El modelo tenía que traducir *"me gustaría más agilidad y energía"* → *"no lo estés
teniendo"*, y traducir es lo que rompió la frase: dos subordinadas encadenadas y un "lo" sin referente.

→ Molde nuevo **deíctico**, que apunta a su mensaje anterior sin traducirle nada:
**"eso que me comentas, por qué crees tú que pasa?"** (9 palabras, sirve igual para un miedo, un "va
lento" o un deseo). El viejo vivía en **seis sitios** — bloque ×4, canon del avatar y batería de
regresión — y se cambiaron los seis. Y el TEST DE CATÁLOGO gana su segunda excepción, porque es lo
que empujaba al modelo a rellenarlo con material de la lead.

⚠️ **De paso se descubrió que el canon del avatar tenía la brecha SIN la segunda mitad** (*"estás
contenta con cómo está yendo tu recuperación?"* a secas), que es exactamente la versión que Rubén dijo
que mata todas las conversaciones. Cualquier coach futuro de este avatar nacía con ese bug.

### El puente afirma, no vuelve a preguntar

Bea: *"la última pregunta se repite y tendría que haber avanzado"*. Disposición (*"…ponerle solución
ahora?"* → **"Si"**) y acto seguido el puente (*"…es así?"*): dos confirmaciones de sí/no pegadas.

Se evaluó invertir el orden y **se descartó al simularlo**: la inversión deja las dos confirmaciones
*adyacentes* y añade un turno. La causa real es otra — **la segunda no sobra por ir detrás, sobra por
ser pregunta.** Ahora, si ella acaba de decir que sí, el puente AFIRMA (*"genial" / "entonces lo que te
gustaría es…"*). Se conserva todo lo canónico (puente obligatorio, en su turno, nunca fusionado) y la
disposición no se toca, que es el KPI de asistencia.

### El precio: la cifra estaba mal desde la ronda 4

**Cerrado por Iván el 02/09: es "desde 150 euros AL MES".** Gana la versión de su equipo, la del
mensaje manual a @crisv_228 (*"La orientación es del precio mensual. Parte de 150€ al mes, pero
disponemos de pago único o fraccionado del total de los 6 meses"*). El bloque llevaba desde la ronda 4
diciendo *"parte de 150 euros"* para 24 semanas — que es exactamente como lo entendió la lead
(*"me parece demasiado bien de precio"*) — porque en su respuesta de la ronda 4 Bea escribió
*"parte de 150 euros con opción de pago único o fraccionado **(no mensual)**"* y ese "(no mensual)" se
leyó como la unidad del precio cuando se refería al **modo de pago**.

> **La lección:** *"(no mensual)"* entre paréntesis, en una respuesta de formulario, decidió una cifra
> durante cinco rondas. Cuando un dato económico admite dos lecturas, se pregunta antes de escribirlo;
> el coste de equivocarse lo paga cada conversación.

Y lo detectó la lead, no nosotros: **Bea subió esa captura para preguntar por otra cosa** (el mensaje
que faltaba en el panel) y el precio estaba dentro.

**El marco que queda escrito** — nació de que el setter se inventó *"el fraccionamiento no lleva
intereses"* con cero condiciones comerciales en las 1270 líneas (grep verificado). Resultó ser cierto,
pero era invención igual:

> **Del dinero sabes cuatro cosas y son estas cuatro:** que parte de 150 al mes · que el pago NO es
> mensual · que es único o fraccionado en dos · que el fraccionado no lleva recargo. Todo lo demás lo
> concreta el equipo.

Y el movimiento de corrección, que es lo que faltaba para el caso de @nere117: *"ojo que los 150 son
la referencia al mes, pero el pago es único o en dos veces"* — pegado, antes de reconducir.

### El formulario de recontacto — diseño listo, esperando las URLs

Bea lo pidió dos veces (27/08 y 31/08) y **el bloque mandaba lo contrario**: `coach_wclose_not_now` y
`coach_wclose_prefiere_esperar_medico` decían las dos **"escríbeme"**.

Aplicado ya, sin esperar a nada: **la que se va se la queda ella, no la lead.** *"lo apunto y te
escribo yo cuando llegue el momento"*, con motivo `recontacto_programado` para que la bandeja sea
filtrable. Más el orden en `coach_prudencia_manda`: si en ese mensaje ella preguntó algo, primero se
le contesta.

🟡 **Pendiente la URL.** `coach_secondary_links` se queda en *"No hay"* a propósito: un hueco de enlace
en el prompt es un hueco que se derrama. Cuando lleguen los links, el cambio es de una línea, detrás
del *"te escribo yo"*. **Y el guardarraíl que no puede faltar: el enlace entra DESPUÉS de trabajar la
objeción, nunca en su lugar** — si no, el setter cambia videollamadas por formularios rellenados y
empeora justo la métrica por la que Bea nos llamó.

### El "y" volvió, y la causa volvió a ser la misma

Roto en **6 de las 7 conversaciones**, con dos pares en turnos seguidos. La regla era binaria y
ocupaba 6 líneas de prohibición; los **ejemplos seguían modelando el tic** en siete literales. Iván lo
zanjó en una frase: *"es tan sencillo como quitarlo de los ejemplos de mensajes"*. Fuera de los siete,
y la regla baja de 6 líneas a 2. Corolario de [[feedback_coach_tic_repeticion_metodo]]: **subir el tono
de la prohibición no arregla un tic que los exemplars están enseñando.**

### Lo que Bea NO marcó y salía en sus propias capturas

1. 🔴 El precio (arriba).
2. El setter **autorizó a entrenar a una mujer de 10 días de posparto**. Reincidencia del peor fallo
   de la ronda 1 por una puerta que el candado no cubría.
3. Un **aborto retenido pasado** contestado con *"me alegra mucho que estés bien ahora y que sigas
   activa, **eso dice mucho de ti**"*. El veto 1 apunta a `coach_qualification_special`, donde solo
   existía la pérdida **actual**: para una pérdida pasada no había ruta y el setter improvisó, justo
   en el punto más delicado del nicho. **Arreglado** — entra en la lista B (sí cualifica: *es su
   historia, no su caso*) con su propia regla: **se acusa en UNA burbuja y ahí muere**, sin preguntar,
   sin pedir detalle, sin felicitarla por haberlo superado y sin volver a nombrarlo.
4. Cuatro burbujas en un turno, emoji en 3 de 4, y los literales de F1 cruzándose de carril (el de
   posparto usado con dos embarazadas). **Sin arreglar.**
5. F3 se saltó su paso 2 en @ronebot — el paso que hace que el problema lo nombre ella.

### La recitación de datos, y el reverso de la lección del "y"

Volvió en tres conversaciones (*"semana 10 y ya pensando en el suelo pélvico y la diástasis"*,
*"ay enhorabuena!! siete semanas, qué bonita etapa es"*), y con ella el veredicto sobre la lead
(*"eso dice mucho de ti"*, dos veces, sin existir en el bloque).

Las dos reglas que lo cubrían — *"no le recites sus datos"* y *"el apunte refleja, no concluye"* — las
**borró la ronda 5**, con el argumento correcto de la doctrina §8: si el exemplar enseña el patrón, la
regla que lo describe sobra. Aquí no funcionó, y el contraste con el "y" explica por qué:

> **Un exemplar ENSEÑA un patrón bueno; no SUPRIME uno malo.**
> Si el tic está *en* los ejemplos (el "y"), se arregla quitándolo de los ejemplos y la regla sobra.
> Si el tic lo trae el modelo de fábrica (recitar, dictaminar, piropear), los ejemplos buenos no lo
> desactivan: hace falta la regla, y con el ❌ literal delante.

→ Vuelve **una** línea al voiceprint, con los tres ❌ de las capturas reales:
*"el acuse se basta solo: ni le recita sus datos, ni la puntúa a ella"*.

### Balance

**1270 → 1269 líneas** con las dos tandas aplicadas. Entró lo nuevo y salió la duplicación que lo
pagaba: el `ANTI-BUCLE` que copiaba el ⛔⛔, el bloque de F2 que **se declaraba duplicado a sí mismo**,
la cola de F0, la tercera copia de "no nombrar el programa antes de F5", el aviso de precio que además
bajaba el suelo de rebatir de 2-3 a 1, y las justificaciones de F3, F4 y del precio.

### Lo que NO es del prompt y hay que llevar al técnico de Automatía

- **Los activadores.** En las 10 conversaciones el panel muestra `Origen: —`, así que todo cae al
  fallback `Bienvenida -` y la atribución de origen de Bea no cuadra. ⚠️ Ojo: los dos enlaces enviados
  llevan `?org=instagram&cont=post` y eso **coincide con la ETIQUETA CTA POST, no con un activador
  vacío** — o el runtime resuelve por etiqueta, o `coach_main_link` está indexado contra un campo
  muerto. Comprobarlo antes de tocar la tabla.
- **El sync del panel**: falta al menos un mensaje que el equipo escribió a mano y que en Instagram sí
  aparece. Hasta que se arregle no se puede auditar una conversación con garantías.
- **Los seguimientos de 6h/23h** son plantilla del runtime (grep: cero en el bloque) y repiten la misma
  pregunta pendiente literal en las tres conversaciones. Es **la mitad de lo que Bea percibe como "se
  repite mucho"**, y no se arregla en el prompt.

### Compuertas abiertas para Bea

1. ✅ **CERRADA 02/09** — el precio es **desde 150 € al mes**.
2. ✅ **CERRADA 02/09** — el fraccionado **no lleva recargo**. Que solo haya pago único o en dos veces
   no es por intereses: no los hay.
3. 🟡 Las URLs de los formularios de recontacto.
4. 🟡 ¿Se puede nombrar el acompañamiento con matronas y psicólogas perinatales al decir qué entra en
   el precio? (el modelo ya lo dice, sacándolo de `coach_identity_role`).
5. 🟡 Su literal real para cuando la lead trae una pauta de su matrona. Hoy hay una apuesta razonada
   (*"vale, entonces ya te han dado algo para ir haciendo"*), no palabra suya.
6. 🟡 ¿*"Estoy embarazada y quiero información (cuéntanos un poco tu caso)"* es una automatización suya
   de Instagram? Si lo es, quiere activador propio.

⚠️ **Y una que no estaba y sale del precio nuevo:** el setter dice *"24 semanas"* y ahora también
*"150 al mes"*. La lead va a multiplicar. Hay que confirmar que la unidad que usa la closer es la
misma, porque su equipo escribió *"los 6 meses de programa"* y 24 semanas no son 6 meses.

---

## Referencias
- Principios del avatar:
  [`prompts/coach-engineering/avatares/embarazo-posparto/principios.md`](../../prompts/coach-engineering/avatares/embarazo-posparto/principios.md).
- Coach vecino que **no** es el mismo avatar:
  [`prompts/coach-engineering/academia/beatriz-juan.md`](../../prompts/coach-engineering/academia/beatriz-juan.md)
  + [`project_beatriz_coach_feedback.md`](project_beatriz_coach_feedback.md).
- Gate del que hereda la forma: `<coach_discovery_gate>` en
  [`prompts/coach-engineering/academia/alfonso.md`](../../prompts/coach-engineering/academia/alfonso.md)
  + [`project_alfonso_coach_feedback.md`](project_alfonso_coach_feedback.md).
- Nichos parientes (menopausia, patologías, lesiones):
  [`prompts/coach-engineering/academia/DIRECTIVAS_OPERATIVAS_POR_NICHO_v1.md`](../../prompts/coach-engineering/academia/DIRECTIVAS_OPERATIVAS_POR_NICHO_v1.md).
