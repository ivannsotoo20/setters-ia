---
name: project_andrea_oliver_coach_feedback
description: "Loop del bloque COACH Andrea Oliver (academia/Automatía, mujeres 35-45 sanas, fuerza + comer sin prohibiciones, IG bienvenida + inbound). Trabaja sola y se auto-cierra: en F6 pide teléfono y la IA se apaga. Ronda 13-08: el carril del lead magnet — su bienvenida promete 'responde y la recibes', así que cualquier respuesta ES pedirla. Ronda 25-08: el SUELO de descubrimiento — leads con dolor superficial y cancelaciones de última hora 'porque piensan que es solo nutrición'; nace `<coach_discovery_gate>` con 5 elementos y el elemento de ENCAJE, que no existía en ningún coach del corpus y se destila a doctrina §34. ⚠️ NO es Andrea SOP. Recall si vuelve feedback de Andrea Oliver, si otro entrenador se queja de leads poco cualificadas o de cancelaciones de última hora, o si hay que decidir cuándo un coach entrega su lead magnet."
metadata:
  node_type: memory
  type: project
---

Andrea Oliver = coach de la **academia** (Automatía, no el SaaS Fyzon). Graduada en ciencias del
deporte + máster en investigación; trabaja **sola** — no hay closer ni equipo, el handoff es invisible
y en F6 pide un teléfono para coordinar la videollamada por WhatsApp (excepción autorizada a CR6).
Avatar: **mujeres ~35-45 sanas** (no patologías) que quieren perder peso, recomposición o preparar
una prueba (hyrox, deka). Programa: **Mujer Fuerte**. Canal: Instagram, por dos vías — bienvenida
automática con regalo (la dominante) e inbound orgánico.

Bloque: [`prompts/coach-engineering/academia/andrea.md`](../../prompts/coach-engineering/academia/andrea.md).
Despliega Iván a mano en Automatía.

⚠️ **NO es Andrea SOP** ([[project_andrea_sop_coach_feedback]]): son dos coaches distintas que comparten
nombre de pila, como las dos Beatriz. Andrea Oliver es la entrenadora y habla de sí misma; la de SOP es
una setter y la llamada la atiende el equipo.

---

## Ronda 2026-07-06 (su documento de feedback)

Cinco correcciones suyas, todas de voz y de literales, que siguen vivas en el bloque:

- **El emoji sobre el dolor.** Le sonó mal un 🥰 sobre *"la barriga no responde"*: pedía *"un icono más
  triste"*. De ahí la familia EMPATÍA-DOLOR (🥺) y la regla de que sobre un dolor recién verbalizado va
  🥺 o ninguno.
- **"Muchas mujeres que llegan conmigo" le suena a IA.** Sustituido por *"muchas mujeres con las que
  hablo"* / *"mujeres que están ahora en el programa"*.
- **Sus dos literales de bienvenida se protegen** ("los dejo porque tengo un % bastante bueno de
  respuesta"): las recetas + *"¿Hay algo este año que te has prometido a ti misma que no quieres volver
  a posponer?"*.
- **Su explicación del programa y su objeción de precio**, en sus palabras, sustituyeron a las de la IA.
- **No insistir con la videollamada**: al segundo no, preguntar qué le genera desconfianza.

Y una frase que se interpretó de más y costó la ronda de agosto: *"Una vez llegado este punto, haría la
explicación de cómo trabajo, si eso es lo que busca y ofrecería agendar videollamada **en lugar de
continuar preguntando más**"*. Se convirtió en la LECTURA DE TEMPERATURA + *"por defecto, NO se
pregunta"* la prioridad + hard cap de 3 mensajes en F3. **Ella no pidió preguntar menos: pidió que en
ESE punto se pasara a explicar y proponer.** La explicación acabó siendo condicional y la cualificación
se quedó sin suelo.

---

## Ronda 2026-08-13 — el carril del lead magnet

**El criterio para entregar un lead magnet lo dicta lo que promete SU bienvenida, no el coach de al
lado.** Transferible a cualquier coach con regalo en F1:

- **Miguel** pregunta *"¿te paso el listado?"* → pregunta de sí/no, así que decide el CONTENIDO de la
  respuesta ([[project_miguel_coach_feedback]]).
- **Andrea** dice *"Responde a este mensaje para recibirla 🎁"* → **cualquier respuesta ES pedirla**, así
  que decide de dónde NACE la conversación, no lo que diga.

Sus dos fallos eran simétricos: entregaba la guía a quien escribía por su cuenta **y** se la retenía a
quien había hecho justo lo que la bienvenida pedía. Ahora: duda o pregunta → la guía va igual y la duda
se responde en el mismo turno; solo el rechazo explícito la retiene. Fuente única del carril:
`coach_phase_massage_fase1`.

Ya había un intento previo de este fork que no funcionaba porque la condición no era observable (*"si la
lead NO viene del lead magnet"*): el modelo no ve el origen, ve mensajes.

---

## Ronda 2026-08-25 — el suelo de descubrimiento y el encaje

**Su feedback, literal:** *"los leads de este mes están tirando a poco cualificadas... dolores muy
superficiales y ya llevo unas cuantas que me cancelan a último momento porque piensan que es solo
nutrición. (…) se puede filtrar un poco a nivel que el dolor sea más grande y asegurarnos que entienden
que el programa incluye todo? Al final la base de mi programa es entrenar mucho más que la comida"*.

Son **dos quejas distintas** y solo una se arregla cualificando más hondo.

### (a) Dolor superficial — el bloque tenía techos y ningún suelo

Cuatro reglas contestaban por su cuenta a *"¿ya puedo proponer?"*, y el modelo se agarra siempre a la
más laxa (doctrina §31):

| Regla | Qué hacía |
|---|---|
| `REGLA DURA DE PREGUNTAS` pto. 2 | ante un freno vago (*"falta de constancia"*), aceptar y avanzar; prohibido reformular |
| `LECTURA DE TEMPERATURA (§16)` | en cuanto el OBJETIVO estaba claro → al puente. Ni dolor, ni porqué, ni encaje |
| `Hard cap de Fase 3: 3 mensajes` | con "la mayoría cierran en 2" escrito al lado |
| señal 3 de F3 (prioridad/compromiso) | *"Por defecto, NO se pregunta"* — y reforzada como exemplar en `coach_tone_contrast`, que enseña más fuerte que la prosa |

El presupuesto real de cualificación eran **dos preguntas**. Y los criterios declarados en
`coach_qualification_criteria` (dispuesta a entrenar de verdad, a cuidar la alimentación, a invertir)
**no tenían captura**: ninguna fase los recogía. El único criterio verificable en chat era *"es mujer"*.

**Arreglo:** nace `<coach_discovery_gate priority="highest">`, portado de
[`academia/alfonso.md`](../../prompts/coach-engineering/academia/alfonso.md) (ronda Rubén del 24-08).
Cinco elementos que deben CONSTAR —con sus palabras, citables— antes de proponer: objetivo aterrizado ·
recorrido y porqué · contexto · lo que se le resiste · encaje e intención. Más PUERTA DE F5 bidireccional,
PRESUPUESTO de 6 preguntas, NEGACIÓN ACEPTADA y las dos ramas de "si un elemento no llega". Las cuatro
reglas de la tabla **se borran**: el gate las sustituye, no se les suma.

**No sube el número de preguntas, sube el criterio.** El mismo párrafo que impide proponer sin los cinco
ordena DEJAR de preguntar cuando constan. Es la reconciliación de la tensión con su feedback de julio.

### (b) "Piensan que es solo nutrición" — el imán enmarca la mitad equivocada

Es mecánico, no es idiotez de la lead:

1. Su bienvenida la presenta como *"entrenadora especializada en mujeres"*, pero **lo único concreto que
   promete son recetas** (*"5 platos rápidos para perder grasa"*), y el primer mensaje del setter es
   *"Aquí tienes tus recetas"*. Dos impactos de comida antes de empezar.
2. **CR3 condicionaba la explicación del programa a que la lead preguntara** — escrito en tres sitios, y
   hasta el nombre del exemplar lo llevaba dentro (`explicacion_programa_si_pregunta`). Pero **la lead que
   da por hecho el marco equivocado es precisamente la que no pregunta**.
3. El molde de APUNTAR del propio bloque entrenaba el sesgo: *"va más por la alimentación entiendo no??"*.
   Una línea, y de las más dañinas de la ronda.
4. En todo el fichero no existía una sola frase diciendo que el entrenamiento pesa más que la comida.

**Arreglo:** el ENCAJE pasa de reactivo a obligatorio (elemento 5, dos burbujas: cómo trabaja con el
entrenamiento por delante + la pregunta de dos puertas, que es literal suyo de julio). El elemento 3
(contexto) actúa de aviso temprano: si hace clases sueltas o habla como si esto fuera comida, el encaje
se comprueba ahí y no al final. `coach_program_info`, el differentiator y el exemplar nuevo ponen el
entrenamiento delante. El molde de APUNTAR ahora apunta al entrenamiento o al ajuste general, nunca a la
comida.

**Este mecanismo no existía en ningún coach del corpus** — todos tratan el desencaje de forma reactiva
con `coach_wclose_wrong_expectation`, y Alfonso manda expresamente *"el encaje del programa"* a valorarse
EN la videollamada. Por eso se destiló a **doctrina §34** ("El encaje se comprueba en el chat: quien no
sabe a qué va, no se presenta") + su sección en el checklist de auditoría.

### Lo que enseñaron las simulaciones (y no vio ninguna auditoría estática)

Se simularon tres leads contra el bloque ya escrito. Las tres rompieron algo que cuatro auditores leyendo
el fichero no habían visto, y los tres fallos eran del mismo tipo: **reglas correctas por separado que
producen el resultado contrario al juntarse.**

1. **La lead buena llegaba a la llamada con *"no soy constante"* como único freno** — el dolor superficial
   exacto de la queja, permitido por una regla DENTRO de la compuerta puesta para evitarlo
   (*"UNA CATEGORÍA AMPLIA YA CIERRA EL PASO"*). **Causa: al portar de Alfonso me dejé el contrapeso.** Él
   pone esa misma regla, pero seguida de `3b. LA CURIOSIDAD ENCIMA DEL BLOQUEO — UNA pregunta más`. Sin ella
   la regla es una autorización a quedarse en el titular. → **Lección: cuando portes un mecanismo, porta su
   contrapeso; una regla sin su freno hace lo contrario de lo que hacía en origen.**
2. **La de "solo nutrición" moría en el encaje, pero por suerte** — la cazó solo porque soltó espontáneamente
   *"al gimnasio no me veo"*. La pregunta de encaje cortaba por acompañamiento-vs-ir-sola, que **no es el eje
   del problema**: una lead que quiere acompañamiento *con la comida* contesta puerta A y pasa entera. →
   ahora hay dos preguntas y una regla de cuál se usa. Además la cerraba por no pisar un gimnasio, que es
   **logística** (el programa admite material en casa), no falta de intención.
3. **La lead superficial acababa cerrada con un literal que le mentía** (*"lo que necesitas no encaja del
   todo con la forma en la que yo acompaño"*) siendo el avatar exacto. Interrogatorio de 7 preguntas sobre
   un techo de 6, porque el presupuesto estaba escrito como SECUENCIA numerada —una lista numerada se lee
   como guion que completar— y porque el único movimiento que no era preguntar estaba encerrado en el
   elemento 4. → presupuesto por PRIORIDAD, apuntar disponible en tres elementos, y la que no se abre ya no
   se cierra: **se apaga sin mensaje** (`descubrimiento_no_abre`) y lo valora Andrea.

**Segunda ronda de simulación, tras arreglar lo anterior.** Las tres acabaron donde debían (superficial →
cierre, solo-nutrición → cierre por encaje en 5 turnos, buena → propuesta aceptada con 3 preguntas), pero
destapó el **arreglo raíz**, que es mejor que el diseño que yo había hecho:

> **Cuál de las dos preguntas de encaje se usa lo decide EL CARRIL, no lo que ella confiese.**
> Atarla a que ella verbalice el malentendido la deja sin disparar casi siempre, porque *la que lo da por
> hecho no lo menciona*. Y en el carril GUÍA llegan **todas** por unas recetas. El bloque ya reconocía eso
> en la prosa del elemento 5 ("una mujer que ha llegado por unas recetas da por hecho que esto va de
> comida") pero no lo tenía conectado a ningún disparador — **un marco sin disparador no filtra a nadie**.

También quedó demostrado el riesgo de interrogatorio y su causa exacta: el presupuesto era **poroso**
(encaje, súper abierta, repregunta y objeciones estaban exentas, así que 6 se convertían en 10 con la lead
plana). Arreglo: las exentas también tienen tope, y por encima de todo manda una señal observable —
*cinco mensajes seguidos terminando en pregunta y el siguiente no es una pregunta*.

### Compuertas abiertas con Andrea (no se aplican de oficio)

1. **El literal de "cómo trabajo" con el entrenamiento delante.** El orden actual (alimentación primero)
   es **suyo**, del 06/07: la IA decía *"trabajo la fuerza y la alimentación"* y ella lo cambió por
   *"adaptar alimentación, entrenamiento y hábitos"*. Se ha invertido apoyándose en su feedback de agosto,
   pero es su literal y le toca a ella validarlo.
2. **El imán.** El chat puede corregir el marco en cada conversación, pero lo paga cada vez. Un renglón en
   la bienvenida o una guía que mencione que entrena fuerza es la corrección barata. Decisión suya: los
   literales los protege porque le dan buen % de respuesta.
3. **La métrica.** El efecto esperado es que bajen las agendas. Hay que acordar ANTES de desplegar que se
   mide **asistencia y % de canceladas**, no agendas totales — o la siguiente ronda será "ahora agendo menos".
4. **Criterio D1.3 ("aceptar pesar/medir la comida")** es incomprobable sin romper su propia voz: su
   lexicon prohíbe "dieta" y "restricción" y su contrast marca ❌ *"Deberías medir lo que comes"*. O se
   reescribe en su lenguaje, o se retira del formulario.
5. **`coach_identity_notia` sigue negando ser IA** (*"Que va bonita, soy Andrea de verdad!!"*), contra
   [[feedback_coach_no_negar_ia]] desde el 03-08. Pendiente heredado, fuera del scope de esta ronda.

---

## Trampas conocidas del fichero

- **Comparar repo vs `Downloads/` antes de tocar nada, en los dos sentidos.** El 25-08 el fichero que
  Iván adjuntó (`Downloads/coach_block_amdrea_oliver.md`) era **más viejo** que el del repo: le faltaba la
  ronda del 22-08 (§33, el gate no-método reescrito por tiempo verbal). Aplicarlo habría revertido esa
  ronda. En 08-13 pasó al revés: el repo llevaba parado desde el 15-jul.
- **El nombre del criterio de parada.** Tenía `is_call_scheduling_link_sent` en un sitio y
  `call_scheduling_link_sent` en otro; el bueno es el segundo (8 usos en el resto de la academia).

Ver también [[feedback_coach_authoring_baseline]], [[project_alfonso_coach_feedback]] y
[[reference_coach_forma_canonica_pepe]].
