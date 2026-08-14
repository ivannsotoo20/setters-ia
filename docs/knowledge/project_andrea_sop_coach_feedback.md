# Coach Andrea — Conquista tu SOP (academia / Automatía)

**Avatar nuevo: el 6º, y el segundo clínico tras Gonzalo.** Mujeres de 18 a 55 años con SOP
(Síndrome de Ovario Poliquístico) diagnosticado o con sospecha fuerte por sus síntomas.

- Bloque vivo: [`prompts/coach-engineering/academia/andrea-sop.md`](../../prompts/coach-engineering/academia/andrea-sop.md)
- Origen: `Downloads/andrea_jose.md` — formato antiguo (`coach_v3_andrea_conquista_tu_sop` +
  `nicho_v3_andrea_mujeres_sop`, secciones numeradas markdown).
- Sistema: **academia (Automatía)**, no el SaaS. Despliega Iván.

⚠️ **No confundir con [`academia/andrea.md`](../../prompts/coach-engineering/academia/andrea.md)**, que
es **Andrea Oliver**, entrenadora de fuerza para mujeres sanas de 35-45. Son dos coaches distintas que
comparten nombre de pila, como las dos Beatriz. Tabla comparativa en el
[README de academia](../../prompts/coach-engineering/academia/README.md).

---

## Ronda 0 — 2026-08-07 (traducción al esquema XML)

No hubo feedback del entrenador todavía. Lo que se hizo fue **traducir** su prompt del formato antiguo al
esquema `<coach_block>` y ponerlo al día con la doctrina y con el mecanismo de parada que Automatía sí
consume. El contenido de negocio (programa, criterios, literales de fase, enlace de Calendly) se conserva;
lo que cambia es la forma, el mecanismo y las reglas que estaban escritas contra la doctrina actual.

### Qué trae de nuevo al corpus

1. **CANAL 4 — COMPLICIDAD VIVIDA.** Andrea tuvo SOP, y esa es su palanca de autoridad principal. Ningún
   otro coach de la flota puede validar desde "a mí me pasaba lo mismo": Luis Royán tiene el problema
   contrario (es un hombre hablando a mujeres y su bloque lo prohíbe explícitamente). Se le puso **cuota
   dura** (máx 3 por conversación, una frase, nunca dos seguidas, nunca encima de una carga verbalizada)
   porque es justo el canal que un LLM convierte en tic y en biografía inventada. Lleva además el **test
   anti-invención de biografía** heredado de Pepe.
2. **PREGUNTA-T.** La dificultad para tonificar aunque entrene es el síntoma-ancla del nicho y casi ninguna
   se lo ha explicado nunca. En el original era obligatoria y colgaba de un flag
   (`internal_state.pregunta_tonificacion_hecha`) que Automatía no lleva. Se reescribió como **movimiento
   obligatorio de F2 sin estado**: se emite una vez, o se da por hecha si ella lo mencionó sola. **No es
   gate** — que falte no bloquea la propuesta (§31: falta de casilla ≠ descualificación).
3. **La lista de reconocimiento de F1**, única excepción legítima a CERO OPCIONES en todo el corpus. La
   apertura enumera síntomas ("ciclos irregulares, inflamación, exceso de vello, acné…") y eso normalmente
   está prohibido. Aquí funciona porque **no le pide priorizar, le da un espejo**: en SOP casi ninguna sabe
   que todo eso va junto, y verlo enumerado es la primera vez que alguien le nombra su cuadro entero. El
   bloque dice explícitamente que esa lista **no se propaga** al resto de la conversación.
4. **Frontera clínica adaptada del bloque de Gonzalo.** Genérico ("con SOP se puede adelgazar?") se
   responde y es el canal de confianza; su caso concreto ("dejo la píldora?", "me tomo inositol?") se
   deriva al médico en el momento, y si insiste, parada.

### Qué se corrigió del original (y por qué)

| Estaba así | Ahora | Motivo |
|---|---|---|
| `handoff_cause = "A"/"C"/"D"` + `phase = 6/11/12` | `manual_attention` + `skip_reply` + `motivo` snake_case | Doctrina §30: ese vocabulario es del SaaS. Automatía no lo consume, así que el bloque describía una pausa que el runtime nunca ejecutaba |
| "Cómo de importante es para ti resolver esto ahora?" + descualificadores D7 (no compromiso) y D8 (no urgencia) | Se LEE, no se pregunta. F3 pasa a ser solo verificación del tema principal | Veto de cualificación: pedir compromiso antes de proponer nada es lo que hace que se cierren. §22: los criterios son una pregunta, no un tema |
| Flag `internal_state` para la PREGUNTA-T | Regla sin estado | Automatía no lleva estado entre turnos |
| Regla del tercio + TM1/TM2/TM3 | Longitud **por función** + los seis movimientos de F2 | Las cuotas porcentuales no se cumplen (§7); las binarias sí |
| 4 datos del 80/20 como lista de comprobación | `<coach_discovery_gate>` con **suelo vinculante**, fuente única, estándar de prueba y tope global de 9 preguntas | §31: un sistema hecho solo de máximos solo puede fallar hacia abajo |
| Micro-aportes "cada 3-4 mensajes" | Ciclo de claridad de 5 pasos con permiso + tope de 2-3 ciclos | Patrón validado en Luis Royán |
| "Es algo que vemos mucho" | "es de lo más típico en SOP" | Colectivo de otras mujeres: le quita el sitio a ella y delata a la máquina |
| Ausente | Guion largo prohibido, sin punto final, sin "¿" de apertura, "Eso de…" prohibido | §17 + §32: la doctrina **no se despliega** a Automatía, así que las reglas de voz tienen que estar dentro del bloque |
| Ausente | Los ocho movimientos de §32 + banco de arranques + vocabulario de energía propio de Andrea ("uf", "jo", "madre mía", "te juro", "si te soy sincera") | Ídem. El vocabulario NO se copia de otro coach |

### Lo que NO se tocó

El programa y sus tres pilares, los criterios de descualificación de fondo, el enlace de Calendly, el
Puente de F4, los tres mensajes de F5 y el bloque de F6 con el enlace: son los literales del entrenador y
se conservan tal cual, limpios de guion largo y de punto final.

---

## Ronda 1 — 2026-08-10 (feedback #2: la titulación)

**Feedback literal:** *"Si alguna vez alguien pregunta si que titulación tenemos o si somos
nutricionistas... la IA debe responder que somos entrenadores y nutricionistas"*.

⚠️ **Quién lo firma.** El feedback llega en el hilo *"Andrea y Jose"* y aparece atribuido a **Sergio
Retuerto**, que es solo la cuenta de Automatía con la que **Iván** está registrado: Sergio **no trabaja en
Andrea y Jose** y no es el entrenador. Quien da la cara en el contenido, y de quien viene el criterio, es
**Andrea**. No dirigirse a Sergio al devolver preguntas.

Captura adjunta (08-08): la lead pregunta **"Pero eres nutricionista?"** y la IA abre con **"No soy
nutricionista, soy Andrea"**.

### Dónde estaba el fallo

No era voz ni criterio: **el bloque no tenía respuesta para esa pregunta**, y el modelo se agarró a lo
único que hablaba de titulación, que era un límite interno de actuación escrito en negativo. Venía del
original: la §C.6 se titulaba literalmente *"NO ERES MÉDICO NI NUTRICIONISTA CLÍNICA"*, y la traducción de
la ronda 0 lo heredó tal cual en `coach_identity_role`. Un encabezado escrito para acotar lo que HACE se
leyó como guion de lo que DICE. Es el mismo patrón que el fallo de la videollamada de la ronda 0: un
enunciado interno filtrándose al chat.

### Qué se cambió (`coach_identity_role` + un enrutamiento)

| Antes | Ahora |
|---|---|
| `NO ERES MÉDICO, NI GINECÓLOGA, NI NUTRICIONISTA CLÍNICA. No diagnosticas…` | `NO DIAGNOSTICAS NI TRATAS. No diagnosticas…` + coletilla: es el límite de lo que HACES, **nunca una confesión de lo que no eres** |
| (no existía) | **Regla de titulación**: se responde en AFIRMATIVO y en PRIMERA PERSONA — *"Sí, soy nutricionista, y trabajo solo con SOP 🫶🏼"*. En plural solo cuando la pregunta es por el equipo. Una frase, y la conversación SIGUE |
| (no existía) | ⛔ PROHIBIDO BINARIO abrir negando ("no soy nutricionista", "no tengo titulación") o rebajarlo ("bueno, yo más bien…") |
| (no existía) | A ese sí NUNCA se le añade **una carrera, un centro, unos años de profesión ni un número de colegiada**: confirmado está el título, no el currículum |
| (no existía) | Candado: ser nutricionista **no abre la puerta a pautar por chat** ni a tocar su medicación — el qué comer y el cómo entrenar se siguen viendo en la videollamada |
| `tuviste SOP, pasaste por los síntomas, y **te formaste** y acompañas…` (test anti-invención) | `…**eres nutricionista** y acompañas…`, y a la lista de lo que no se inventa entran **los años de profesión y los de convivencia con el SOP** |

La frontera clínica no se tocó: sigue intacta y binaria. Lo único que se retiró es la frase que el modelo
convertía en confesión; "no eres médico ni ginecóloga" no hacía falta enunciarlo para que la frontera
funcione, porque quien la ejecuta es la tabla GENÉRICO / SU CASO CONCRETO.

En `coach_special_protocols` → PREGUNTAS DIRECTAS DE LA LEAD entra **una línea** de enrutamiento
(`Titulación → coach_identity_role`), al lado de la que ya existía para "quién atiende la llamada". La
regla vive en un solo sitio.

### Lo que la captura delata además, y que NO necesita regla nueva

Tres incumplimientos de reglas que el bloque **ya tiene escritas**. Si se repiten en la próxima tanda de
capturas, entonces sí hay que mirar el bloque; hoy son señal de que está compitiendo consigo mismo
(§31, el peso de 29k tokens), no de que falte instrucción:

1. **"Llevo más de 13 años con SOP"** — biografía inventada. Ese dato no está ni en el bloque ni en el
   prompt original (verificado). Lo prohíbe el TEST ANTI-INVENCIÓN DE BIOGRAFÍA.
2. **"trabajo con el equipo de Conquista tu SOP"** — el equipo se nombra en 1ª persona posesiva ("mi
   equipo", "el equipo"), nunca en tercera. Lo prohíbe `coach_identity_role`.
3. **🤗** — fuera del banco de emojis permitidos (❤️ 🫶🏼 😊 😔 🥰 ✨ 🙌 💪🏼 🤔 😅).

### Aprendizaje para el corpus

**Un límite interno escrito en negativo acaba saliendo por la boca del setter.** Cada vez que un bloque
diga "NO ERES X", hay que preguntarse qué contesta cuando le pregunten si es X. Si no hay respuesta
escrita, el modelo improvisa la negación, y la negación en la primera línea es justo lo que quema la
autoridad en la pregunta donde la lead está decidiendo si se fía. Aplicable a toda la flota, y en
particular a los otros coaches con frontera clínica (Gonzalo, Luis Royán).

---

## Compuertas abiertas (antes de desplegar)

1. ~~**¿Quién atiende la videollamada?**~~ ✅ **CERRADA — Iván, 2026-08-07: la atiende el EQUIPO, no
   Andrea.** El original se contradecía: el modelo mental decía *"el equipo de Conquista tu SOP está al
   otro lado (…) eres la portera, no la coach"*, y el MSG 1 de la propuesta decía *"me encantaría conocer
   mejor tu caso (…) validemos si realmente voy a poder ayudarte"*, en primera persona. **Era el mismo
   fallo P0 que costó una ronda en Pepe** (prometía "una videollamada tú y yo" y la atendía su equipo de
   admisiones). Con la confirmación, el bloque pasó de *no prometerlo* a **decirlo**: regla dura en
   `coach_identity_role` con lista de fórmulas prohibidas, plural obligatorio en los tres mensajes de F5 y
   en el Puente, y un molde de respuesta honesta para cuando lo pregunte de frente (que NO para la
   conversación). Nota de autoría: el plural no enfría porque la calidez la sostienen "me encantaría",
   "juntas" y la salida digna, no el singular.
2. ~~**El apellido del entrenador.**~~ ✅ **CERRADA — Iván, 2026-08-07: la setter es "Andrea" a secas, sin
   apellido, y el entrenador NO se nombra.** Es coherente con el bloque, que nunca lo nombraba (el
   `_jose` del fichero de origen no aparecía dentro ni una vez).
   - `coach_identity_name` = **"Andrea, de Conquista tu SOP"**. Sin apellido en ninguna parte del bloque.
   - El fichero se queda en **`andrea-sop.md`**: el `-sop` NO es un apellido, es lo único que evita la
     colisión con `andrea.md` (Andrea Oliver). Este coach es la excepción a la convención por entrenador
     (`luis-royan`, `gonzalo-camacho`) y se nombra por nicho, a propósito.
3. **Rango de edad**: el perfil ideal decía 18-50 y el descualificador D2 decía "menor de 18 o mayor de
   55". Se resolvió por el descualificador (18-55, que es el que actúa como línea binaria) y se dejó
   coherente en todo el bloque. Confirmar cuál es el bueno.
4. **"Persona que no tiene SOP"** aparecía suelto dentro de la lista de perfil ideal, sin más contexto. Se
   interpretó como *cualifica también quien tiene síntomas sin diagnóstico*, que es coherente con el resto
   del bloque. Confirmar.
5. ~~**¿Andrea es personalmente nutricionista?**~~ ✅ **CERRADA — Iván, 2026-08-10: SÍ lo es.** El feedback
   vino en plural ("somos") y la regla se escribió primero en plural; con la confirmación pasa a **primera
   persona**, que es lo que da autoridad en la pregunta donde la lead decide si se fía. El título entra
   además en el test anti-invención, para que el modelo sepa exactamente qué puede afirmar y qué no.
6. **Voz real de Andrea.** Los exemplars están escritos sobre su registro declarado y sus literales, pero
   **no hay corpus real suyo** (conversaciones o audios). Hasta que lo haya, el test de
   indistinguibilidad (§12) no se puede pasar de verdad.

---

## El peso del bloque: 38K → 118K (decidido 2026-08-07)

Iván levantó que el bloque había triplicado el tamaño del original (38.476 chars / ~9.6k tokens →
117.850 / ~29.5k). Medido de verdad, por bloque funcional:

| Bloque funcional | Original | Ahora |
|---|---:|---:|
| Identidad + programa + enlaces | 4.077 | 9.406 |
| Cualificación + cierres | 4.231 | 9.588 |
| **Voz y tono** (§4 + §6) | 8.561 | **36.863** |
| **Estructura** (§C + regla 80/20) | 6.819 | **30.514** |
| Mensajes por fase (§5) | 3.609 | 15.054 |
| **Objeciones (§7)** | **3** | **9.857** |
| Protocolos especiales | (dentro de §C) | 6.488 |
| Bloque de nicho aparte | 10.746 | 0 (fundido dentro) |

**Las tres causas, y solo dos son mérito del trabajo:**

1. **La §7 del original estaba VACÍA** — literalmente `## 7.` y nada debajo. Y no era decorativa: D10
   decía *"sin ceder tras Protocolo RAM"* y el Puente decía *"aplica Protocolo RAM de objeciones (sección
   7)"*. El prompt apuntaba **dos veces a una sección que no existía**. Los 9.857 del banco salieron de la
   tabla de creencias del bloque de nicho.
2. **La voz (8.5K → 37K) es la consecuencia directa de
   [[feedback_coach_doctrina_no_llega_al_prompt]]**: a Automatía se despliega el `<coach_block>` a secas,
   así que §32 completa, el banco de arranques, los tests anti-invención y las reglas de puntuación tienen
   que vivir DENTRO del bloque o no existen. No es opcional y no es relleno.
3. **La estructura (6.8K → 30.5K) sí es decisión de autoría discutible**: se importó el aparato completo
   de Luis Royán (seis movimientos de F2, temperatura de lead, trigger de cierre temprano, discovery gate
   con suelo). Del original solo venían el 80/20 y las C.1-C.10.

**Contexto del corpus (el número solo engaña sin esto):** los coaches de academia que han pasado por
rondas pesan Alex 130K · Pepe 106K · Alfonso 104K · Luis 103K · Gonzalo 103K · Chema 94K · Frodo 86K ·
Miguel 85K. Los que **no** han pasado por ninguna: Andrea Oliver 39K · Efra 41K · Roberto 44K. Este bloque
salió del segundo grupo y entró en el primero.

**El coste no es el que parece.** Automatía cachea el prompt (corrección de Iván, 31-jul), así que el
bloque es prefijo estable y no se paga entero cada turno. El coste real es de **atención**: 29k tokens
compitiendo consigo mismos, y §31 documenta el mecanismo (*"nueve umbrales para una decisión: el modelo
siempre se agarra al más laxo"*).

**Autocrítica que hay que tener presente en la ronda 1:** este coach está en RONDA 0. Los que pesan 100K
llegaron ahí tras 3-5 rondas y **cada regla suya tiene un fallo real detrás**. Aquí se le puso de entrada
el peso de un coach maduro sin esa evidencia: le ahorra rondas conocidas, pero las reglas sin fallo detrás
son ruido que compite con las que sí importan.

> **DECISIÓN (Iván, 2026-08-07): se despliega tal cual y el peso lo decide el primer feedback real.** Si
> el entrenador o Rubén reportan que se lía, que suena a máquina o que se salta cosas, **se recorta con
> evidencia**, que es como se recortó en el resto de la flota. Precedente en contra de recortar a ciegas:
> a Luis *"le quitamos cuatro movimientos y solo le añadimos prohibiciones"* y fue a peor; y tres veces
> seguidas (Beatriz 28-jul, Miguel 31-jul, Frodo 03-ago) recortar preguntas fue el diagnóstico equivocado
> (§31, CUÁNTO vs CÓMO). Candidatos a recorte si llega ese feedback, por orden: temperatura de lead,
> trigger de cierre temprano, y la mitad de la conversación dorada. **Nunca** la parada, el notia, el
> discovery gate ni §32.

## Notas de nicho (para el siguiente coach de SOP o de patología hormonal)

- El sentimiento dominante del avatar no es "quiero adelgazar", es **"he pedido ayuda y ni así me han
  ayudado"**: fue al médico, le dieron la píldora y la despacharon. Conectar con eso abre la conversación
  más rápido que cualquier pregunta de descubrimiento.
- Muchos de sus síntomas son **visibles** (acné, vello, caída de pelo, inflamación) y golpean la
  autoestima. Por eso la proporción se diseñó en 6/10 validación, más alta que en los avatares masculinos.
- **Nivel de consciencia bajo por defecto**: no entiende la raíz hormonal. Preguntarle por objetivos la
  abruma; el eje va por síntomas.
- La **culpa** ("será que soy vaga", "será que no me esfuerzo") es transversal a todo el avatar, y
  quitarla es una palanca de calidez que no consume tope de validación porque no atribuye sentimientos:
  desmonta una creencia.
- SOP aparece también como **caso sensible que cualifica** en el bloque de Luis Royán (menopausia). No hay
  conflicto: allí es una comorbilidad que no descarta, aquí es el nicho entero.
