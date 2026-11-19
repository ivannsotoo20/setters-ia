# Tania (tenant 7): ronda del 2026-11-19, sus siete puntos y la Fase 1 (motor)

Tania mandó siete puntos con ejemplos concretos y preguntó cuándo podrá corregir la IA ella misma
("tardas mínimo una semana"). Diagnóstico medido en la BD de producción el 19-nov. Plan por fases
aprobado por Iván: **Fase 0** (cinco preguntas a Tania), **Fase 1** (cuatro arreglos de motor que no
dependen de ella, esta nota), **Fase 2** (coach v33 con sus respuestas), y después «Mis textos /
Mis recursos», prometidos el 4-nov y sin empezar el 19-nov.

## 1. Lo que pasaba en cada punto

| Punto de Tania | Causa | Capa |
|---|---|---|
| 1. Idiomas (italiano) | `detect-language.ts` solo conocía es/pt/en/fr: el italiano no disparaba nada y el modelo contestaba en italiano (13067 el 7-nov, 13552, 15166, 14820). En 13067 la IA dijo «Tania fa le videochiamate anche in italiano», inventado. | Motor + texto suyo |
| 2. Responder antes de seguir | Precio: su primer literal del 4-nov seguido de la propuesta; ella lo vive como esquivar. «Cómo trabajas»: el v28 dejó la explicación para la F4 (conv. 15317: pedida en el mensaje 1, llegó en el 14). 15234: «¿cómo se hace la videollamada?» → «¿mañana o tarde?». | Coach + Judge (Fase 2) |
| 2. Residencia (tato_flp, 14845) | `evaluateZone` 1b cerraba con la respuesta corta «🇨🇺 Cuba» sin leer «Desde Miami» de la misma tanda; «cubano» está en `country_reject_terms` y «Soy cubano» también cerraba como residencia. | Motor |
| 3. Dolor < 3 meses | El filtro existe, pero un brote de algo anterior cuenta como larga evolución y la hernia diagnosticada lo dispara (14685, 14794). | Coach (Fase 2) |
| 4. Preguntas repetidas (15317) | **Turnos caducados**: la IA genera, programa las burbujas a +30 s y no las cancela si la persona escribe en ese hueco. Del 5 al 19-nov: 110 de 738 turnos (15 %), 43 de 114 conversaciones. Además el turno arranca con un «Exacto» suelto. | Motor |
| 5. Dificultad económica | El coach solo contempla «crisis + sin disposición» para descalificar; lo intermedio no existe (15147, 14900). | Coach (Fase 2) |
| 6. Confirmación de reserva | «Pues ya está reservada 🙌» lo escribía el modelo con un «Listo» (15147), sin mirar `calendar_appointments` y sin fecha ni hora. | Motor + texto suyo |

## 2. Fase 1, motor (rama `feat/tania-ronda-19-nov-fase1`)

- **Turnos caducados** (`services/supersede-ai-turn.ts`, para todos los tenants, sin config):
  - al entrar un mensaje de la persona (webhooks GHL, YCloud y ManyChat), las burbujas pendientes
    del turno de la IA se cancelan si la conversación está activa, y el debounce rehace el turno
    con todo;
  - al terminar de generar, si la conversación volvió a la cola (`isDebouncePending`), el turno no
    se programa (`ProcessDebouncedDeps.isRequeued`, que pasa el cron);
  - un turno que cierra, deriva, pausa o reserva un hueco sale siempre. Coste neutro: el turno
    nuevo se habría generado igual.
- **Zona** (`lib/zone-policy.ts`): la respuesta corta al país y el país suelto solo cierran si nada
  de lo que escribe nombra otro sitio (`statesAnotherPlace`: país de zona, o «Desde Miami» / «en
  Houston»); si lo nombra, queda en mención y el modelo confirma dónde vive. Un gentilicio («Soy
  cubano») es nacionalidad, no residencia.
- **Idiomas** (`lead_qualification.languages`, opt-in): detección ampliada a italiano y alemán en
  `shared-validator` (`detectSpokenLanguage`, sin tocar `detectLeadLanguage`). En un idioma no
  permitido, el motor manda `unsupported_text` tal cual, sin modelo; si sigue en ese idioma, IA
  pausada y aviso a la entrenadora; y ningún turno del modelo sale en un idioma no permitido.
  Medido sobre un mes del tenant 7: 0 falsos positivos en 3.627 mensajes de la IA.
- **Reserva** (`services/booking-confirmation.ts`, `lead_qualification.booking_confirmation`, opt-in):
  - la confirmación la manda el motor cuando el calendario registra la cita (calendar-sync o webhook,
    `conversationMoved`), con fecha, hora y zona horaria de la persona (o la de la entrenadora,
    dicha); nunca con citas pasadas ni reservadas hace más de un día;
  - si la persona dice que ha reservado y aún no consta, el motor consulta el calendario en ese
    turno; si aparece, el turno no contesta aparte;
  - sin cita registrada, el modelo recibe el dato, un turno que la da por hecha sale con
    `pending_text`, y un handoff `A_agenda` se degrada a activa en F6.
- **Simulador** («Probar asistente»): las mismas reglas de idioma y de reserva.

Verificación: typecheck 9/9; tests motor 1.003, pipeline 193, validador 152, composer 81, panel
727. Batería local con el modelo real (`apps/motor-agente/scripts/bateria-fase1-19nov.mts`, sin
commitear, config inyectada en memoria): 5/5 en verde, 0,53 $ (tato con Miami sigue en mención;
italiano → aviso → pausa; italiano → aviso → sigue en castellano; «Listo» sin cita; regresión Madrid).

Activación del tenant 7 tras el deploy: `.tmp/ronda-tania-19-nov/activar-fase1-tenant7.sql` (con
rollback). Sin migraciones.

### 2.b Segundo envío de Tania (19-nov, 13:10), añadido a la Fase 1

| Caso | Causa | Arreglo |
|---|---|---|
| caren.2.20 (15353), frase repetida 17-nov 6:00 | Dos envíos reales: turno 10678 empezó a las 6:59:42, cuando ella escribió «Ahora no trabajo…»; el siguiente repitió la primera burbuja. | Turnos caducados (ya en la Fase 1). |
| mipj02 (14236), respuesta repetida 16-nov 17:04 | Una parte programada (6998) y dos filas enviadas con 0,2 s: dos procesos leyeron el mismo pendiente antes de marcarlo. 4 casos desde octubre en 3.906 mensajes. | `sendNextBatch` reclama con `UPDATE … WHERE status='pending' RETURNING` y solo envía lo reclamado; el tick de salida no se solapa. |
| legadobouso (15363), duración y «Yo estoy en Madrid» repetidos | Turnos caducados (tres veces en la misma conversación). «¿Qué te frena?» → «Ya te dije. El dolor y ardor» es del modelo. | Fase 1; lo segundo, Fase 2. |
| caren.2.20, «qué te ha faltado» tras «Constancia», y «No lo sé» / «No te entiendo» | El coach repite la pregunta del freno y no explica cómo trabaja ante la confusión. | Fase 2. |
| gmma.1971 (11474), Ceuta | La IA no sabía que Ceuta es España; preguntó «¿Ceuta es parte de España o te mueves entre dos países?» y soltó «España cuenta para la videollamada». | Ceuta y Melilla en `zone-config` (ES) y directiva «Dónde vive» cuando contesta a la pregunta del país con un sitio de zona (`lib/turn-context.ts`). Lo de explicar criterios, Fase 2. |
| gmma.1971, «¿estoy hablando con una I.A?» | La IA contestó «**No**, soy la asistenta virtual de Tania»: el «No» niega que sea una IA. | Fase 2 (literal del coach: empezar por el sí). |
| raquel28el (15182), apertura cruzada | La automatización le volvió a mandar la apertura 8 días después dentro de la conversación abierta; «Todo el día» se leyó como respuesta a la duración. 15 de 273 aperturas del 1 al 19-nov cayeron así, 7 contestadas. | Directiva «Apertura repetida» cuando lo último que recibió es una apertura (`source='system'`) tras mensajes de la IA. |
| «SEO» como nombre | No aparece en ningún mensaje ni nombre del tenant 7 desde octubre. | Pedir la conversación a Tania; relacionado con el bug abierto de `captured_lead_name`. |

Verificación del segundo lote: motor 1.016 tests en verde y typecheck; batería 6/6 (0,38 $) con el
caso de Ceuta añadido (no vuelve a preguntar ni comenta el país).

### 2.c Despliegue

- Commit `c31ba17` en main, desplegado el **19-nov a las 15:08 UTC (16:08 hora de España)**; `/health`
  en verde y sin reinicios. Es la hora que se le da a Tania para revisar conversaciones.
- Smoke en producción (`.tmp/ronda-tania-19-nov/smoke-fase1-prod.mjs`, simulador, tenant 7): 3/3
  (Cuba + Miami queda en mención y confirma «vives en Miami»; Ceuta sin repreguntar; Madrid), 0,43 $.
- Idioma y reserva están desplegados pero **apagados** para el tenant 7 hasta aplicar
  `.tmp/ronda-tania-19-nov/activar-fase1-tenant7.sql`; después, `smoke-fase1-prod.mjs --activado`.

## 3. Pendiente

- Fase 0: las cinco preguntas a Tania (texto de otro idioma, qué pasa con < 3 meses y si un brote
  cuenta, rango o no con dificultad económica, primera respuesta al precio, situación laboral en EEUU).
- Fase 2, coach v33: pregunta directa se contesta en ese turno; < 3 meses; económico; el literal
  «Confirma que ha reservado» del coach pasa a no confirmar nada (lo hace el motor); fuera el «Ya
  estoy por aquí 😊» a mitad de conversación; la línea de idioma del coach se alinea con el motor;
  el freno no se repregunta cuando ya lo dijo (o es el propio dolor); ante «no lo sé» / «no te
  entiendo», se explica cómo trabaja en vez de otra pregunta parecida; «¿eres una IA?» empieza por el
  sí; nunca se explica el criterio de zona ni de la videollamada.
- La conversación de «SEO» (Tania).
- «Mis textos / Mis recursos»: los textos de esta ronda (`unsupported_text`, confirmación,
  `pending_text`) nacen ya como config, listos para editarse desde el panel.
