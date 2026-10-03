# Tania (tenant 7) — ronda del 2026-10-03: su documento "Objetivo de la IA" aplicado al coach

Tania mandó un documento de 37 puntos ("INSTRUCCIONES IA SETTER — OBJETIVO DE LA IA"). Su
tesis: el objetivo del setter no es llevar a cuanta más gente mejor a videollamada, sino
entender a cada persona y darle el siguiente paso adecuado; la calidad no se mide en enlaces
enviados. Iván: aplicarlo en su prompt "lo más eficiente posible", con una reducción grande de
lo que molesta antes de meter lo nuevo.

## Lo que se quitó del coach (y el punto de su documento que lo veta)

| Fuera | Por qué |
|---|---|
| Recap espejo obligatorio en F4 ("Si te he entendido bien… Es así o me dejo algo?") | Su punto 5: no hace falta que confirme dos veces su propia historia. |
| La "lectura que quita la etiqueta de normal" de F2 y sus cinco ejemplos ("no es algo que tengas que dar por normal", "no es pedir mucho, es lo mínimo") | Su punto 3 veta literalmente "No tendrías que darlo por normal". Era el molde que el modelo repetía en cada turno (punto 4). |
| Micro dato clínico ("L4-L5 es de las zonas que más carga soporta") | Puntos 11 y 12: ni afirmaciones clínicas ni refuerzo del miedo estructural. |
| Pregunta de disposición de F3 y "Te está dando los resultados que necesitas?" | Punto 7: preguntas que pescan un sí (o un no). |
| Escalera de tres peldaños del "puedo solo" | Su peldaño 3 era una afirmación causal ("falta un plan que se ajuste") y una pregunta que pesca el no. |
| Micro compromiso de cuándo DESPUÉS del enlace, "prohibido despedirse sin reserva", "resérvalo ahora que estamos" | Punto 32: no presionar después del enlace. El compromiso práctico pasa a ir ANTES (la franja, punto 25). |
| Precio "depende de la situación de cada persona" en dos vueltas | Punto 30: no evadir con eso si no es cierto. |
| Exemplars que ponían peso o inseguridad que nadie nombró ("3 años es tiempo suficiente para que empiece a pesar", "Me puedo imaginar la inseguridad…") | Punto 3. |
| Explicación de cómo trabaja solo si la piden y reconduciendo ("primero me interesa entender el tuyo") | Puntos 9, 10 y 31: tiene que entender qué hace Tania antes de una llamada. |

## Lo que entró

- **Rutas A-F** (su punto 34) en `coach_structural_modifications_core`, con "qué necesita esta
  conversación ahora" como pregunta rectora (regla maestra) y "gravedad no es encaje" (punto 14).
- **Sin guion** (puntos 1-2, 4, 6): lo dado no se repregunta, tres comprobaciones antes de cada
  pregunta, no todos los turnos acaban en pregunta (modula el paso 5 del Core).
- **Un suelo único para proponer** (puntos 6, 16, 22): situación, qué quiere recuperar, qué ha
  probado/qué le falta, apertura espontánea, que entienda qué hace Tania, filtros con el país
  sabido. Que falte algo nunca cierra: se sigue conversando o va un recurso.
- **F4 = explicar cómo trabaja**, conectado con su caso (puntos 9, 10, 22), con sus dos ejemplos.
- **Señales de intención** (punto 8) y **de no-entiendo** (puntos 10, 31: se para el camino a la llamada).
- **País** (puntos 15-21): obligatorio antes de proponer y preguntado de forma explícita con su
  frase ("Te pregunto porque acompaño a personas de distintos países") cuando no lo dan el motor,
  el formulario ni el chat. Instagram casi nunca trae teléfono (medido el 26-09: 940 de 995
  conversaciones eran de Instagram y solo 2 tenían teléfono).
  Fuera de zona = **ruta de recurso** con el mismo tono, nunca "no cualificas"; si pregunta precio
  o cómo empezar, handoff B a Tania.
- **Recurso según necesidad** (puntos 18, 19, 33): rigidez de mañana, miedo a entrenar/fuerza,
  rigidez general/sentada; se ofrece ("Si quieres te la paso") y se manda con un sí; fuera de
  zona cierra, en el resto la conversación sigue `active`.
- **Interés / intención / intención de agenda** (puntos 24-26) y **franja antes del enlace**
  (punto 25), escrita como no-negociación de hora para no chocar con la CR5. El enlace va en tres
  burbujas con su "compruebo que haya quedado correctamente reservado 😊".
- **Sin presión tras el enlace** (punto 32) y **vuelta sin reserva** con su pregunta (punto 28).
- **Seguridad ampliada** (punto 13): empeoramiento agudo, cambio reciente, posquirúrgico, cuadro
  neurológico, con handoff B. **Lenguaje clínico y miedo estructural** con sus listas (11, 12).
- **Tono** (punto 37): su nombre una vez como mucho, "tiene sentido / totalmente / es normal /
  entiendo" una vez cada una, sus frases de empatía inventada vetadas.

Tamaño del cuerpo: 43,2k → ~36,7k caracteres (−15 %), con los 37 puntos dentro.

## Cambio de código que hacía falta: las focales de fase

`apps/motor-agente/src/lib/phase-focus.ts`. La focal es el último bloque del prompt y el modelo
la lee como la orden vigente (lección de la conv 12203). La F4 pedía en cada turno
"¿Voy bien o me dejé algo?", la F3 "una sola pregunta sutil sobre disposición" y la F5 "si acepta,
enlace ya": justo lo que el documento de Tania prohíbe, y por encima del coach. Ahora F1-F5 dicen,
justo después del título, que si el bloque coach define la fase manda el coach; la F5 da el enlace
ya salvo que el coach pida un paso antes (la franja), y nunca hace esperar a quien ya pidió reservar.
F6 y las focales de zona no cambian. Para un coach que no redefine la fase no cambia nada.

## Lo que NO se puede cumplir desde el prompt (pendiente, decisión de Iván o de Tania)

1. **Fuera de zona decidido por el motor** (prefijo de fuera, o "vivo en / te escribo desde" +
   término): V21 manda `zone_close_message` (el literal 8) en el primer turno y V20 bloquea
   cualquier URL, también los vídeos. Ahí la ruta de recurso no corre. Donde el país sale como
   respuesta a la pregunta del país (veredicto `mention`, Instagram) sí corre. Para cumplir su
   punto 17 en todos los casos: un modo "recurso" en el motor (V20 bloquearía solo el enlace de
   agenda y WhatsApp, V21 dejaría unos turnos de ruta B con tope y cerraría con el literal si no
   cierra). Es dar la vuelta a la decisión del 26-09, que nació de los 24 mensajes de la conv 12203:
   necesita su OK.
2. **Recursos sin URL**: movilidad para la jornada (oficina) y la guía de los tres bloqueos
   (punto 19). Con las URLs, son dos líneas en `coach_secondary_links`.
3. **Precio** (punto 30): pide responder con sus condiciones comerciales; la CR2 del Core prohíbe
   cifras y no las tenemos. Hoy: una vez sin cifra ("antes prefiero entender bien tu caso") y, si
   insiste, a Tania (D_espera). Si Tania quiere dar precio por chat hace falta su texto y una
   excepción de la CR2 para el tenant.
4. **Fuera de zona que pregunta cómo empezar o el precio** (punto 21): "según las condiciones que
   Tania haya establecido para estos casos". No las tenemos: va a Tania con handoff B.
5. **Producto, fuera del prompt**: seguimiento proactivo tras el enlace sin reserva (punto 28; el
   n8n tenía `post_link_24h/72h`, el SaaS no marca cuándo se envía el enlace y su seguimiento por
   inactividad no sabe de enlaces), registro del motivo de no reserva (29), estados
   CALL_INTEREST → BOOKING_CONFIRMED (27) y el embudo de métricas (35). Hoy existen "Enlaces
   enviados" (proxy F6/F7) y "Citas agendadas" (reales, del calendario).
6. **Configuración**: el turno del enlace son tres burbujas; con `aiMessagesPerTurnMax` < 3 el
   Splitter junta la tercera. Sus frases vetadas de empatía pueden ir además a `forbiddenPhrases`
   (V17, máx. 10 de ≤40 caracteres) si se quiere cumplimiento estricto.

## Carga

No se cargó: sin acceso a Supabase desde la sesión. Se carga como v28 con el SOP
`sops/cargar-coach-v5-desde-md.md` (`--expect-md5` del v27 en BD, que debería ser
`cf6e774f7a6ec6d7efbdd619b458698b` si la BD está en el `.md` del commit anterior) y la batería del
simulador. Escenarios a meter, con sus ejemplos: el lead de los 7 años (no repreguntar), la
operación (reflejo sin dramatizar), "necesito alguien que sepa de espalda" (explicar, no
repreguntar), Instagram sin teléfono que llega al suelo (pregunta del país antes de proponer),
"Perú" como respuesta (ruta B sin decir el motivo), "sí, me gustaría" (franja, no enlace),
"mañana por la mañana?" (enlace directo), "mañana lo miro" tras el enlace (sin presión),
"qué haces exactamente?" tras la propuesta (explicar, no repetir enlace), pérdida de fuerza nueva
(derivación), y los de la batería v22-v27 (Jenny 15 días, "sí" a secas, Colombia, Venezuela, Lima).
Las focales nuevas solo están en producción tras el deploy del motor (push a `main`).

La captura que acompañó la petición enseñaba las palabras clave de bienvenida de Tania (#27-#29,
"Hola, te doy la bienvenida a esta comunidad"): son las bienvenidas a las que responde el carril
"Abriste tú con la bienvenida" de `coach_phase_massage_fase1`; no cambian nada del bloque.
