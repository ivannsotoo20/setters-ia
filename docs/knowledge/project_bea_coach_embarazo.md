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
| `no, pensaba que a los 4 meses estaría mejor` | *"dónde crees tú que está…"*. ⛔ falla si lo nombra el setter |
| `sí, me gustaría ponerme ya` | puente en **su propio turno**, propuesta después. ⛔ falla si los fusiona o si le recita sus datos en vez de referenciarlos |
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
