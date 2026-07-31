---
name: project_miguel_coach_feedback
description: "Loop del bloque COACH Miguel Aguado (academia/Automatía, mujeres 35-70 pérdida de peso sin dietas, IG outbound). Ronda 1 (2026-07-31, feedback #42): las conversaciones morían en el tramo final porque el bloque tenía escrito el techo — tope de 2 preguntas de cambio, F3 y F4 compartiendo tope, y la pregunta de necesidad gastada dentro del literal de handoff. Se monta la ESCALERA DE CAMBIO de 4 escalones en F4. Ronda 2 (2026-07-31): se cierran los dos huecos de doctrina que quedaron fuera — §26 (dos objeciones nombraban la videollamada antes de F5, grave en Miguel porque su setter no la propone nunca) y §24 (lead cerrada dentro de CSM-02: una pregunta súper abierta y el silencio como filtro). Recall si vuelve feedback de Miguel o si otro coach reporta conversaciones cortas al final."
metadata:
  node_type: memory
  type: project
---

Miguel Aguado = coach de la **academia** (Automatía, no el SaaS Fyzon). Nutricionista de Madrid,
trabaja **solo** (no hay equipo: el handoff es invisible y quien retoma es él). Avatar: **mujeres
35-70** que quieren perder peso y volumen sin dietas restrictivas — trabajo, familia, poco tiempo,
años de bucle dieta-rebote, confianza tocada. Canal: **Instagram outbound** (lead magnet = listado
de la compra). Cierre: **handoff sin enlace** — el setter nunca ofrece la llamada ni propone fechas.

Bloque: [`prompts/coach-engineering/academia/miguel-aguado.md`](../../prompts/coach-engineering/academia/miguel-aguado.md),
formato `<coach_block>` con headers `##` (mismo loop que [[project_alfonso_coach_feedback]] /
[[project_frodo_coach_feedback]] / [[project_beatriz_coach_feedback]]). Despliega Iván a mano en Automatía.

Su `<coach_objections>` (protocolo RAM + deflexión) ya es **referencia externa citada en la doctrina §27**
(objeciones hiladas, no troceadas). Es el mejor banco de objeciones del corpus academia.

---

## Ronda 1 — 2026-07-31 (feedback #42, "Pendiente / Alta")

**Lo que dijo:** *"Las conversaciones siguen siendo muy cortas en general. Cuando comento que se
queda corta, normalmente suele ser en las últimas fases (hasta este punto me parece bastante bien
todo el prompt). Pero en la parte de discurso de cambio, y sobre todo en la búsqueda de soluciones,
solo se hace 1-2 preguntas."* Nombró cuatro preguntas que nunca aparecían: cómo de importante es
esto para ti · cómo te está afectando · es algo que te gustaría cambiar ya · sinceramente, por lo
que hemos hablado, qué crees que puedes necesitar.

### El diagnóstico: el techo estaba escrito en el bloque

No era una intuición suya. Siete causas raíz, en orden de impacto:

1. **`coach_cambio_discourse` decía literalmente "Regla de tope: máximo 2 preguntas de este banco por
   conversación"** — coincidencia exacta con el "1-2 preguntas" que reportaba.
2. **F3 y F4 compartían el mismo tope.** F3 tenía "MÁX 3 mensajes" + "hard cap: 2 de cualificación +
   hasta 2 de cambio". Si F3 quemaba los 2, F4 ("aquí es donde, si aún no lo hizo, lanzo el discurso
   de cambio") se quedaba a cero y se volvía un paso a nivel.
3. **La 4ª pregunta ya estaba escrita… dentro del literal de handoff de F5** (*"por todo lo que hemos
   hablado… para ver qué puedes necesitar exactamente a día de hoy"*). Se gastaba como frase de cierre
   en vez de preguntarse. Por eso la "búsqueda de soluciones" no ocurría nunca: estaba plegada dentro
   del handoff.
4. **Los tres atajos autorizaban abreviar F4** (CSM-05, carril CALIENTE, FAST-TRACK). En un avatar que
   casi siempre trae objetivo claro desde el minuto uno, el atajo se disparaba casi siempre.
5. **Presupuesto mal repartido:** crucero 14-20 mensajes y *"al mensaje 14, inventario → empiezo a
   explorar INTENCIÓN"*. Empezar la intención en el mensaje 14 de 14-20 dejaba ~6 mensajes para
   F3+F4+F5. F2 ("donde más tiempo se pasa") se comía el presupuesto.
6. **Dos de sus cuatro preguntas estaban vetadas.** F3 decía *"NO en la importancia abstracta ni
   escalas"* y el par de contraste marcaba ❌ *"Del 1 al 10, cómo de importante es esto para ti"*.
   Subir el tope sin tocar esto no habría hecho aparecer la pregunta.
7. **El gate pre-F5 (CSM-06) no pedía impacto ni necesidad** — solo CONTEXTO/OBJETIVO/BLOQUEO/
   INTENCIÓN/DISCURSO DE CAMBIO. Lo que no se exige, no se hace.

### La solución: LA ESCALERA DE CAMBIO en F4

F4 pasa de paso a nivel a **la etapa que decide el handoff**. Cuatro escalones en orden, cada uno
apoyado en la respuesta al anterior, con 3 variantes cada uno (para no sonar a guion):

| Escalón | Intención | Mapea a |
|---|---|---|
| 1 | IMPACTO — cómo te está afectando esto en tu día a día | 2ª pregunta de Miguel |
| 2 | IMPORTANCIA — cómo de importante es para ti resolver esto ahora (abierta, NUNCA escala) | 1ª |
| 3 | URGENCIA — y esto es algo que te gustaría cambiar ya | 3ª |
| 4 | NECESIDAD — sinceramente, por todo lo que me has contado, qué crees que puedes necesitar | 4ª — **siempre obligatorio** |

Se llaman **"escalón N"** y no E1-E4 a propósito: el bloque ya usa E1-E5 para las *etapas*
(E1 Conexión, E2 Su Problema, E3 Intención, E4 Valorar…) y la colisión era real.

**Las 7 reglas que la separan de un interrogatorio** — esto es lo importante, no las preguntas:
mínimo 3 de 4 escalones y el 4 siempre · escalón ya respondido espontáneamente = cumplido, NO se
repregunta · alternancia obligatoria (al menos un escalón precedido de validación o micro-aporte,
prohibido encadenar 4 preguntas secas) · encadenado (si no enlaza con lo que acaba de decir, se
reescribe) · en modo ligero por energía baja NO se sube (manda CSM-02) · una pregunta por mensaje ·
si entra objeción a mitad, se retoma en el escalón donde se quedó (la deflexión no borra la escalera).

**Lo demás cambiado para que la escalera quepa:**
- Presupuesto 14-20 → **18-24** mensajes, soft cap 25 → 30; inventario del mensaje 14 → **11-12**;
  regla nueva de reparto (E2 no se lleva más de la mitad; el tramo final necesita 7-9 mensajes propios).
  Estaba en **dos sitios** (CSM-01 y `..._phases`) y había que tocar los dos o se contradecían.
- **Literal de F5 reescrito** en dos variantes: la A cita la necesidad que ELLA acaba de verbalizar en
  el escalón 4 en vez de volver a preguntarla; la B es el fallback si su respuesta fue demasiado corta
  para citarla. ⚠️ **Es un mensaje suyo — pendiente de que lo valide Miguel.**
- Los tres atajos llevan ahora la misma cláusula binaria: se comprime F1-F3, **la escalera nunca baja
  de 2 escalones (3+4)** y el 4 se lanza incluso con la lead más caliente.
- CSM-06 pide **IMPACTO** y **NECESIDAD VERBALIZADA POR ELLA**; el preflight CHECK 2 bloquea el handoff
  sin escalón 4 ("no me falta llamada, me falta escalera").
- Par de contraste amendado: sigue ❌ la escala del 1 al 10, pasa a ✅ la importancia abierta.
- Exemplars nuevos en `coach_tone_exemplars` mostrando la escalera en marcha (doctrina §8: los
  exemplars enseñan el patrón, la regla sola no basta).

### Bugs colaterales arreglados de paso

- **Pregunta muerta §11.15** — *"qué cambiaría en tu día a día si consiguieras lo que quieres"* (la que
  Rubén dijo quitar siempre porque "la conversación se muere ahí") vivía en 2 exemplars. Sustituida por
  proyección emocional: *"cómo te imaginas sintiéndote el día que lo hayas conseguido?"*.
- **Autopsia del método** — el banco viejo tenía *"Crees que con lo que has probado hasta ahora tienes
  suficiente…"*, violación latente de §11.8 / CR7. Desaparece al reescribir el banco.
- **CSP-04 duplicado** — "reanudación tras pausa" y "eres de Madrid" compartían número. La reanudación
  pasa a CSP-05.
- **Tabla de activación rápida** — apuntaba a `CSP-05` y `CSP-06` inexistentes, y mandaba "ningún motivo
  / curiosidad" a CSP-03 (que es comportamientos inapropiados). Tres punteros corregidos + fila nueva
  para el escalón 4 pendiente.

---

## Lo que queda abierto

- **Validar con Miguel el literal de F5** (variantes A y B) — es su voz, no la nuestra.
- **Medir sobre conversaciones nuevas.** El feedback venía de una sola captura. La palanca del prompt es
  real (los topes estaban escritos), pero si la lead deja de responder o la plataforma corta el hilo,
  alargar el prompt no lo arregla.
- **Vigilar el riesgo de interrogatorio** en el tramo final: 4 preguntas seguidas es justo el formulario
  que §22/§25 combaten. Lo sujetan la alternancia y el "escalón ya respondido no se repregunta".
- **Vigilar el riesgo de enfriar leads calientes** por alargar el final. La excepción del carril CALIENTE
  sobrevive reducida al escalón 4.
- **Desplegar en Automatía** (lo hace Iván a mano).

---

## Ronda 2 — 2026-07-31 (cierre de los dos huecos de doctrina)

Ronda de doctrina, no de feedback del trainer: se cerraron los dos gaps que la Ronda 1 dejó fuera de
alcance. **Miguel no ha visto estos cambios** — los tres literales nuevos son voz suya puesta por
nosotros y entran en el mismo lote de validación que el literal de F5 de la Ronda 1.

### §26 — las dos respuestas que nombraban la videollamada antes de F5

En Miguel la infracción es **más grave que en el resto del corpus**: su setter no propone la llamada
*nunca* (F5 es handoff invisible y Miguel la ofrece por audio). Nombrarla en una objeción de F2/F3 no
es adelantarla, es inventar un paso que en su flujo el setter no tiene.

- **"Prefiero información por aquí"** — antes justificaba con *"lo que solemos hacer aquí es una
  videollamada…"*. Ahora abre por lo que SÍ puede dar (orientación general, enganchado a **CSP-02**,
  que ya prohíbe las frases defensivas tipo "sin conocer tu caso no puedo") y reconduce al
  descubrimiento con anclaje en su objetivo o su bloqueo.
- **"No es el momento / más adelante"** — la rama de razón vaga remataba en *"¿Qué te parecería al
  menos tener una videollamada y ya decides?"*. Ahora reencuadra el momento perfecto y reconduce al
  presente; se añade que si se abre, **la escalera de cambio se retoma en el escalón que quedara
  pendiente** (coherente con la regla 7 de `coach_cambio_discourse`).

Las dos se reescribieron **hiladas** (§27): unidad cálida de lógica lineal con comas, terminada en
reconducción. Es requisito, no estética: este banco es la referencia externa que cita la propia §27.
La escalera de escalado de cada objeción se dejó intacta.

### §24 — leads cerrados, dentro de CSM-02

Se añadió el bloque **LEAD CERRADA** a CSM-02, distinguiéndolo explícitamente de la energía baja
puntual que ya cubría (aquí sí responde, pero después de 4-5 preguntas sigue sin haber contexto).
Movimiento: **una** pregunta súper abierta que pide contexto, una única vez en la conversación. Y la
lectura, que es lo que de verdad faltaba: **si no se abre, eso ya cualifica** — es el filtro. No se
repite la pregunta, no se sube la escalera, no hay handoff Tipo A y **no se cierra por
descualificación** (no ha dicho que no): se deja abierta y la recoge el seguimiento de n8n.

Traducido a las restricciones de Miguel: el "no se le tira el enlace" de la doctrina no aplica literal
(su setter no manda enlaces nunca) → se convierte en "no se fuerza el handoff". Fila nueva en la tabla
de activación rápida.

### Gaps NUEVOS detectados al auditar, NO tocados (decisión de Iván)

Un grep de `videollamada` sobre todo el bloque levantó **dos infracciones más de §26 que la Ronda 1 no
había fichado**. No se tocaron por disciplina de alcance; las dos tienen propuesta lista:

- **`coach_objections_avatar` → "Consultarlo con mi pareja/familia"** dice *"tu pareja también puede
  estar en la videollamada por WhatsApp"*. Es la MISMA sub-sección de las dos ya corregidas. Además
  está rota por partida doble: si la objeción llega pre-F5 viola §26, y si llega post-F5 el setter ya
  está en `skip_reply = true` y no la responde nadie. **O se reescribe sin nombrar la llamada, o es
  código muerto.**
- **`coach_tone_exemplars` → `situacion="tranquilizar_duda_F5"`** (*"No te preocupes, la videollamada
  es gratuita y sin compromiso…"*) enseña al setter un mensaje que en el modelo de Miguel **no debe
  enviar jamás** — su F5 es handoff mudo. Por §8 (los exemplars enseñan el patrón), un exemplar malo
  pesa más que una regla: es candidato a borrado, no a reescritura.

### Gap adyacente, fuera de alcance de esta ronda

- **§29 ("no es el momento" con evento concreto → compromiso bidireccional anclado a la fecha).** La
  rama de razón concreta de esa misma objeción sigue en **cierre pasivo** ("cierre con dignidad +
  puerta abierta"). §29 pide capturar la fecha y comprometerse a escribir después
  (`handoff_cause = "recontacto_programado"`). Se vio al reescribir esa línea; no se aplicó porque el
  encargo era §26. Alfonso y Roberto ya lo llevan.

## Candidato a doctrina (NO propagado, a decisión de Iván)

La escalera de cambio es el primer mecanismo del corpus que convierte el discurso de cambio de "una
pregunta suelta con tope" en "una secuencia con recorrido mínimo". Si mide bien con Miguel, es candidato
a **sección nueva de `doctrina-universal.md`** y a **P11 del avatar mujeres**. (Ojo: el §30 ya está
reclamado por el hallazgo de reconocimiento de [[project_pepe_coach_feedback]] — si entran los dos,
numerar en orden de validación, no de descubrimiento.) Se dejó sin propagar siguiendo el método de
Rubén: *testear uno primero, luego propagar* (mismo criterio que con Roberto v2).

Nota de conflicto entre coaches, para cuando se propague: **Beatriz Juan pregunta la importancia con
escala 0-10** ([[project_beatriz_coach_feedback]]) y **Miguel la prohíbe** (su voiceprint veta las escalas
numéricas). Coinciden en el fondo — la importancia se pregunta — y divergen en la forma. La doctrina, si
se escribe, debe pedir el escalón, no la escala.
