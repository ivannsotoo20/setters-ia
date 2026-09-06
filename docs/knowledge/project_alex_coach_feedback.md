# Coach Alex — escaladores (Escalada Inteligente, Alejandro Padilla)

Academia / Automatía. Bloque: [`prompts/coach-engineering/academia/alex.md`](../../prompts/coach-engineering/academia/alex.md).

Entrenador: **Alejandro Padilla Crespo**, doctorando especializado en entrenamiento de escalada.
Programa **Escalada Inteligente**, +600 escaladores acompañados y un equipo de entrenadores
titulados. **La videollamada la atiende el equipo, no Alejandro y no el setter** (plural obligatorio
en el puente y en la propuesta).

⚠️ **Mismo bloque, dos nombres**: `Downloads/coach_block_padilla.md` es la copia que Iván pega en
Automatía y `academia/alex.md` es la versionada. Son el mismo fichero y se sincronizan en cada ronda.
Antes del 04-09 estuvieron desincronizados: el de Downloads llevaba el candado del recurso y las URLs
nuevas de lead magnet, y el del repo se había quedado en la versión del 5 de agosto.

## Lo que trae este coach a la craft: el conformismo como freno

Es el **primer coach de rendimiento deportivo** de la flota, y el nicho está nombrado literalmente en
`academia/DIRECTIVAS_OPERATIVAS_POR_NICHO_v1.md` §3. Lo que lo separa de los avatares de pérdida de
peso:

- **Conciencia ALTA, intención BAJA.** El escalador sabe que debería entrenar mejor, ya se esfuerza y
  ya va al roco. El freno no es la ignorancia ni la constancia: es el **conformismo**, haberse hecho
  a la idea de que su grado es el que es.
- **El objetivo va antes que el freno**, al revés que el default. Si preguntas por el freno sin
  tener delante a dónde quiere llegar, la pregunta vale para cualquiera.
- **El miedo a lesionarse SÍ mueve a la acción** en este nicho, y es de los pocos sitios donde eso
  pasa. No hay que esquivarlo.
- **Su escalada se pregunta, su entrenamiento no.** Aquí el test del método de la doctrina §33 cae
  del lado de Bea Espínola y no del de los hombres: la escalada es una **actividad que quiere
  conservar** y te la cuenta encantado (cuánto lleva, dónde, qué tipo, qué grado), así que se
  pregunta. Lo que sigue siendo autopsia es su plan de entrenamiento: qué planificación tiene
  montada, qué programa siguió, por qué lo dejó.
- **No asumir la disciplina.** Bloque, deportiva, vías largas, roca o plafón se preguntan. Es §20
  aplicado al nicho, y es el equivalente del *"a qué le das tú en la montaña"* de Rubén.

## Ronda 1 (2026-08-03) — criterio anti-IA propio

Alejandro pidió su propia respuesta ante "eres una IA?": tres mensajes literales (se identifica como
**Lara**, asistente digital de Alejandro / para qué ha sido formada / seguir o hablar con el equipo)
y **después** la parada con los dos criterios. Es la **config 3** del acuerdo del 03-08 (responder y
parar), distinta del apagado mudo de Pepe y del "responde y sigue" de Chema.

Dos decisiones de Iván al aplicarlo: **"Lara" solo en ese trigger** (el setter sigue siendo Alex en
el resto de la conversación, aun sabiendo que el lead ve dos nombres), y el placeholder de su
feedback es **el nombre del lead**, no el del equipo. Murieron el desmentido en dos tiempos y el
"100% humano".

Al escribir esta config hay que declarar la excepción **en los dos sitios que pisa** (la prohibición
de dar opciones y el cupo de usos del nombre); si no, el modelo reformula el literal en vez de
enviarlo.

## Ronda 2 (2026-08-03) — emojis

Reporte: *"por mucho que se ha intentado variar, los pone de manera continua y masiva"*. El censo dio
solo 8 emojis en literales: la causa no eran los ejemplos, era la **técnica del espejo**, que
autorizaba a adaptar "el uso de emojis" al lead, más una cuota que además exigía *variedad*, o sea
rotar iconos. Se pasó a **cero emojis binario**, que es lo único verificable mirando el mensaje que
se está escribiendo, y el espejo dejó de espejarlos.

## Ronda 3 (2026-08-05) — tres reportes, y a uno se le dijo que no

Mandó "ser más directos", "la frecuencia más directa y cerrada" y "priorizar el dolor, no repetir
mensajes". Se aplicó todo menos la directividad general, que se rebatió con autoridad. Lo aplicado:

- **Un intento por tema** (la respuesta floja ES el dato) y **nunca repetir una pregunta**. El bucle
  no lo causaba el modelo: lo causaban los checklist "innegociables" de fase que le decían que no
  podía avanzar sin las casillas. Pasaron a ser orden de preferencia.
- **La pregunta de disponibilidad** con sus cifras (2 sesiones de roco de 1 h + 1 específica de
  40-50 min = 3-4 h/semana), en dos burbujas: ancla primero, pregunta cerrada de sí o no después.
  Es la **segunda y última** excepción nominal a la prohibición de preguntas cerradas.
- **La regla del hilo caliente**: si abre con miedo, lesión o parón, la logística se deja para el
  final.
- **Anclar no es recitar**, y fuera del puente se prohíben los resúmenes.
- **Paradas migradas** a `manual_attention` + `skip_reply` + motivo, con tabla de motivos.

## Ronda 4 (2026-09-04) — la compuerta de intención, y la migración a XML

**Su feedback (#28):** *"Después de hacer el resumen tiene que cambiar la manera en la que propone la
llamada en casos de leads que como este… han avanzado muy rápido por la conversación teniendo que
mejorar cosas y algo de dolor pero que no parece que tenga una necesidad imperiosa… tiene que
preguntarle antes de ofrecer la llamada si… teniendo en cuenta su situación y que es complicado
manejar estas dificultades por su cuenta… que si cree que tendría sentido para ella tener un plan de
acción con el que saber qué hacer en cada momento y poder mantener una mejora constante en su
escalada sin comprometer su salud y dedicándole el tiempo que ya le dedica. Y si responde que sí,
entonces ofrecerle la llamada."*

Lo que hace esta ronda:

- **F5 se parte en dos turnos con espera en medio**, copiando el microcompromiso de
  `angel-martinez.md`. Turno A: prueba social con el vehículo en una palabra, te mojas, y la pregunta
  de sentido con las palabras de Alejandro, **sin nombrar todavía la videollamada**. Turno B: la
  propuesta, solo con su sí. Y `<coach_commitment_gate>` como fuente única de esa puerta, la única
  del bloque que puede acabar en un no.
- **Se aplicó universal, no condicional.** Él escribe "en casos de leads como este", pero
  condicionarlo obliga al modelo a clasificar la temperatura turno a turno, y esa clasificación es la
  junta por donde se rompen estos carriles. Con un lead caliente el sí es inmediato y cuesta un
  mensaje; con el tibio hace exactamente lo que pide.
- **Su petición cierra una contradicción viva de su propio bloque.** La Fase 4 anterior (búsqueda de
  soluciones conjunta) preguntaba *"qué crees que te ayudaría ahora para conseguir X"*, que es
  auto-diagnóstico, mientras la Fase 3 lo prohibía expresamente dos pantallas antes. La compuerta
  ocupa ese hueco sin pedirle que se diagnostique, así que **la Fase 4 desaparece**.
- **Migración al esquema `<coach_block>`.** Era el último de los 16 bloques de academia en el formato
  antiguo `BLOQUE 0…11`. Entra además `<coach_discovery_gate>` como suelo con fuente única, y la
  parada con las **tres piezas** de Efra (comprobación antes de enviar, el cierre es el literal de
  `coach_wclose`, y la red sobre el último mensaje enviado).
- **De 136.869 a 72.146 chars** (2019 → 926 líneas). Se fueron el bloque de autoevaluación entero
  (40 casillas que repetían reglas ya escritas), el bloque de situaciones específicas (duplicado
  íntegro del avatar), 112 líneas de separadores de caja y la secuencia de cierre con recurso, que
  vivía escrita en nueve sitios y ahora vive en uno.

### Doce contradicciones del bloque viejo que se arreglaron de paso

F5 mandaba a "Fase 7" y tres líneas después a "Fase 6" · la distribución de tipos de mensaje estaba
declarada dos veces con los porcentajes intercambiados · la regla de cero emojis convivía con un
cierre post-agenda obligatorio que llevaba `:)` y `;)` · se prohibían las palabras malsonantes y el
bloque las usaba como exemplar propio y como conector autorizado · una fase decía que no se
presentara y otra ordenaba "preséntate como Alex" · la objeción "lo pienso" tipificaba TIPO A / TIPO B
y anunciaba cómo distinguirlos, pero luego no los usaba · un puntero mandaba al "Bloque 9" para las
objeciones, que estaban en el 8 · la prohibición escribía `hand_off_human` con un guion bajo de más ·
bloques de código mal cerrados y comillas tipográficas en F7 que podían romper el parseo del literal ·
y **la regla de humanización demostraba en sus propios ✅ justo lo que prohibía tres líneas antes**
(abrir preguntas con "Y").

Lo que **no** se tocó aunque parezca error: el slug `llamada-de-admisin-al-programa` (es el real) y
que los recursos 3 y 5 compartan enlace (está declarado correcto en el propio bloque).

## Compuerta abierta

**Quién atiende la videollamada.** El bloque dice, y así se ha escrito, que Alex es el canal del
**equipo de entrenadores** y que la llamada la atienden ellos. Si en realidad la da Alejandro en
persona, cambia el registro entero del turno B y hay que revisar los plurales del puente y de la
propuesta. Es el mismo punto que costó dos P0 en Pepe y en Andrea SOP: confirmar con él antes de que
esta versión lleve mucho tiempo en producción.

## Relacionado

- Forma copiada: [`academia/angel-martinez.md`](../../prompts/coach-engineering/academia/angel-martinez.md)
  (F5 en dos turnos), [`academia/luis-royan.md`](../../prompts/coach-engineering/academia/luis-royan.md)
  (los dos gates y el layout sin sangrado), [`academia/efra.md`](../../prompts/coach-engineering/academia/efra.md)
  (las tres piezas de la parada).
- Doctrina que gobierna la ronda: §19-§22 (dirección), §30 (parada), §31 (el suelo con fuente única),
  §32 (lo que va antes de la pregunta), §33 (contexto presente sí, autopsia no).
