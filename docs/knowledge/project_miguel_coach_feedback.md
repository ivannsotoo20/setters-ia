---
name: project_miguel_coach_feedback
description: "Loop del bloque COACH Miguel Aguado (academia/Automatía, mujeres 35-70 pérdida de peso sin dietas, IG outbound). Ronda 1 (2026-07-31, feedback #42): las conversaciones morían en el tramo final porque el bloque tenía escrito el techo — tope de 2 preguntas de cambio, F3 y F4 compartiendo tope, y la pregunta de necesidad gastada dentro del literal de handoff. Se monta la ESCALERA DE CAMBIO de 4 escalones en F4. Recall si vuelve feedback de Miguel o si otro coach reporta conversaciones cortas al final."
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

## Gaps conocidos del bloque, NO tocados en esta ronda

- **§24 (leads cerrados)** — Miguel tiene CSM-02 modo ligero, pero le falta el movimiento de "pregunta
  súper abierta que pide contexto" y la lectura de que **el silencio cualifica**.
- **§26 (no nombrar la llamada antes de F5)** — `coach_objections_avatar` la nombra en dos respuestas
  ("Prefiero información por aquí" y "No es el momento"). Violación pre-existente; no se tocó porque
  reescribir su banco de objeciones excede el alcance autorizado y ese banco es referencia de §27.

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
