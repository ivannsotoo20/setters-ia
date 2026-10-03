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
- **País por canal** (puntos 15-21, con la decisión de Iván de más abajo): en WhatsApp decide el
  prefijo y nunca se pregunta; en Instagram/Messenger se pregunta al principio con su frase ("Te
  pregunto porque acompaño a personas de distintos países"). Instagram casi nunca trae teléfono
  (medido el 26-09: 940 de 995 conversaciones eran de Instagram y solo 2 tenían teléfono). Fuera
  de zona: cierre 8 directo, nunca "no cualificas"; si después pregunta precio o cómo empezar,
  handoff B a Tania.
- **Recurso según necesidad** (puntos 18, 19, 33): rigidez de mañana, miedo a entrenar/fuerza,
  rigidez general/sentada; se ofrece ("Si quieres te la paso") y se manda con un sí; la
  conversación sigue `active` salvo en el cierre 3 (solo quiere ejercicios sueltos).
- **Interés / intención / intención de agenda** (puntos 24-26) y **franja antes del enlace**
  (punto 25), escrita como no-negociación de hora para no chocar con la CR5. El enlace va en tres
  burbujas con su "compruebo que haya quedado correctamente reservado 😊".
- **Sin presión tras el enlace** (punto 32) y **vuelta sin reserva** con su pregunta (punto 28).
- **Seguridad ampliada** (punto 13): empeoramiento agudo, cambio reciente, posquirúrgico, cuadro
  neurológico, con handoff B. **Lenguaje clínico y miedo estructural** con sus listas (11, 12).
- **Tono** (punto 37): su nombre una vez como mucho, "tiene sentido / totalmente / es normal /
  entiendo" una vez cada una, sus frases de empatía inventada vetadas.

Tamaño del cuerpo: 43,2k → ~39k caracteres (−10 %), con los 37 puntos dentro. Del v27 solo
siguen tal cual ~6k caracteres de líneas, casi todos literales de Tania o de Iván; el resto se
quitó o se reescribió.

## Cambios de código que hacían falta

### Las focales de fase

`apps/motor-agente/src/lib/phase-focus.ts`. La focal es el último bloque del prompt y el modelo
la lee como la orden vigente (lección de la conv 12203). La F4 pedía en cada turno
"¿Voy bien o me dejé algo?", la F3 "una sola pregunta sutil sobre disposición" y la F5 "si acepta,
enlace ya": justo lo que el documento de Tania prohíbe, y por encima del coach. Ahora F1-F5 dicen,
justo después del título, que si el bloque coach define la fase manda el coach; la F5 da el enlace
ya salvo que el coach pida un paso antes (la franja), y nunca hace esperar a quien ya pidió reservar.
F6 y las focales de zona no cambian. Para un coach que no redefine la fase no cambia nada.

### El Judge borraba los vídeos de recurso

`packages/agent-pipeline/src/judge.ts`, guardrail 5: "URL en fases 1-3 → eliminar". La ruta de
recurso manda el vídeo casi siempre en F1-F3, así que le habría llegado "Si quieres te la paso"
y, tras su sí, un mensaje sin enlace. Ahora en F1-F3 solo se quita el enlace de agenda o de
WhatsApp; un enlace a contenido (vídeo, publicación, guía, lead magnet) no se toca en ninguna fase.

### La directiva de zona de `mention` y del tier filtrado

`apps/motor-agente/src/lib/lead-origin.ts`. Decía "tu mensaje es el cierre de residencia fuera de
zona de tu bloque" y va la última del prompt: con eso, quien contesta "Perú" a la pregunta del
país se llevaba el literal 8 al instante, que es justo el corte que su punto 20 prohíbe. Ahora
dice "sigues el camino de fuera de zona que define tu bloque" y "sin enlace de agenda" (antes
"sin enlace", que también vetaba el vídeo). Los veredictos de rechazo (prefijo, "vivo en…") no
cambian: ahí sigue mandando V21.

### Revisión adversarial (mismo día)

Un revisor independiente cruzó el bloque con sus 37 puntos, el Core y las directivas del motor.
Además de lo anterior, entró en el bloque: qué literales van tal cual y cuáles son ejemplos (el de
F5 decía "L5-S1" fijo); la propuesta no repite la explicación de F4; lo que contesta a "de dónde
me escribes?" ya es residencia; el turno en que dice su país no cambia de ritmo; la pregunta de F3
no repregunta lo que le falta si ya lo dijo; "Tú qué me recomiendas?" con el suelo completo es
intención; las plantillas que pescan un sí del propio Core vetadas; matices de CR4/CR5/CR6 en
`coach_special_protocols` (donde el Core los admite); brote de siempre ≠ derivación y emergencia de
ahora = handoff silencioso (CR10); Tania en primera persona en precio y fuera de zona; y se
recuperaron cinco cosas del v27 que su documento no pedía quitar ("gracias por contármelo", el
"me alegra que me lo cuentes" vetado, el miedo a que lo online no funcione, la histéresis de fase
y el caso "Colombia a secas").

## Decisión de Iván sobre la zona (mismo día): por canal y cierre directo

Se le planteó construir un "modo recurso" en el motor para que el punto 17 de Tania (fuera de zona
sin corte en seco, con un recurso) se cumpliera también cuando el país lo detecta el motor. Su
respuesta: **no**. El país se resuelve por canal y el de fuera se descalifica directamente.

- **WhatsApp**: decide el prefijo. El país no se pregunta nunca. Prefijo de fuera → cierre 8 en
  ese turno (V21 + `zone_close_message`, como desde el 26-09).
- **Instagram / Messenger**: no hay teléfono, así que el país se pregunta al principio (primera
  respuesta tras que cuente algo, segundo mensaje como muy tarde), y su respuesta decide igual:
  fuera de zona → cierre 8 en ese turno.

En consecuencia, la ruta de recurso del bloque queda para quien no está preparada, momento médico,
poca apertura o solo ejercicios, no para la zona. La línea de canal de Instagram/Messenger de
`lead-origin.ts` ("si hace falta [el teléfono], hay que pedírselo", contra la CR6) pasa a decir que
falta el país de su número. Los cambios de la directiva `mention` y del Judge se quedan: siguen
siendo correctos (el bloque decide el camino; los vídeos de recurso no se borran en F1-F3).

## Pendiente (decisión de Tania o producto)

1. **Zona**: resuelto por la decisión de arriba; no se construye el modo recurso.
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
6. **Dudas para Tania**: qué contestar a "sería en casa o fuera?" (su punto 31 la nombra y el
   bloque no inventa dónde se entrena); y si quiere que el setter dé la cifra del precio.
7. **Fuera de este trabajo, a revisar**: el literal de IA empieza por "No, soy la asistenta virtual"
   (decisión de Iván del 06-09; ese "No," puede leerse como negar ser una IA).
8. **Configuración**: el turno del enlace son tres burbujas; con `aiMessagesPerTurnMax` < 3 el
   Splitter junta la tercera. Sus frases vetadas de empatía pueden ir además a `forbiddenPhrases`
   (V17, máx. 10 de ≤40 caracteres) si se quiere cumplimiento estricto.

## Carga

**Motor**: en `main` desde `4dcc73b` (2026-10-03, con el OK de Iván), deploy por el CI
`deploy-motor.yml`. Con el v27 aún en BD no cambia el comportamiento del bloque: las focales ceden
a un coach que todavía tiene su recap, y lo de zona por canal vive en el v28.

**Bloque v28**: sin cargar. La sesión cloud no llega a Supabase (la política de red del entorno no
deja pasar `mcp.supabase.com` ni `ppujrqxiizgfqclbuxet.supabase.co`). Se carga desde una máquina
con el `.env.local`, tras `git pull` de `main`:

```bash
node scripts/load-coach-v5-version.mjs --tenant 7 \
  --file prompts/source/coach-v5/tania-duarte-matos.md --version 28 \
  --expect-md5 cf6e774f7a6ec6d7efbdd619b458698b \
  --summary "v28: documento Objetivo de la IA de Tania + zona por canal (WhatsApp prefijo, Instagram pregunta)"
```

El script aborta si la BD no tiene ese md5 (el del v27 del `.md` de `d8f9afe`) o si la última
versión no es la 27. Después, la batería del simulador. Escenarios a meter, con sus ejemplos: el lead de los 7 años (no repreguntar), la
operación (reflejo sin dramatizar), "necesito alguien que sepa de espalda" (explicar, no
repreguntar), Instagram que cuenta su dolor (pregunta del país en el segundo mensaje como muy
tarde), "Perú" como respuesta (cierre 8 directo, sin motivo), WhatsApp +34 (nunca pregunta el
país), WhatsApp +57 (cierre 8 en el primer turno), "sí, me gustaría" (franja, no enlace),
"mañana por la mañana?" (enlace directo), "mañana lo miro" tras el enlace (sin presión),
"qué haces exactamente?" tras la propuesta (explicar, no repetir enlace), pérdida de fuerza nueva
(derivación), y los de la batería v22-v27 (Jenny 15 días, "sí" a secas, Colombia, Venezuela, Lima).
Las focales, el Judge y la directiva de zona nuevos solo están en producción tras el deploy del
motor (push a `main`); cargar el v28 antes del deploy deja el bloque peleando con la F4 vieja.

La captura que acompañó la petición enseñaba las palabras clave de bienvenida de Tania (#27-#29,
"Hola, te doy la bienvenida a esta comunidad"): son las bienvenidas a las que responde el carril
"Abriste tú con la bienvenida" de `coach_phase_massage_fase1`; no cambian nada del bloque.
