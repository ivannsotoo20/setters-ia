# Tania (tenant 7) — ronda del 2026-10-20: caída de Redis, plan por fases, inbound y país a tiempo

Tania escribió "ni Instagram ni WhatsApp". La causa no era de canales: el Redis del VPS estaba
caído. Tras restaurarlo, Iván juntó sus quejas pendientes (bienvenidas e inbound sin contar, país
tarde, corte en seco fuera de zona, precio, encaje, citas fuera de horario y autonomía) y aprobó un
plan por fases con cuatro decisiones. Plan publicado (privado):
https://claude.ai/artifact/9scmjLG21769eL4rKXfLF3

## 1. La caída de Redis (17-20 oct)

- `docker-compose.yml` publicaba Redis en `0.0.0.0:6379` sin contraseña desde el 10 de mayo. Desde
  el 11 de mayo recibió 255 ataques `REPLICAOF` (bots que lo hacen réplica de un servidor suyo para
  colarle un binario). El del 13 oct dejó un ELF como `dump.rdb`. Ningún módulo llegó a cargarse
  (Redis 7 trae `MODULE LOAD` desactivado), el contenedor no tenía ficheros cambiados y el host no
  mostraba nada raro a nivel del usuario `deploy`.
- 17 oct 13:57 UTC: Redis dejó de responder sin log propio. ioredis no tenía `commandTimeout` y el
  motor se colgó en silencio: ni cola de debounce ni inserción de mensajes de IG/WA hasta el
  reinicio del VPS (18 oct 15:37 UTC). Esos mensajes no se recuperan desde nuestra BD.
- Tras el reinicio Redis no arrancaba ("Wrong signature trying to load DB from file", 1.775
  reinicios). Con el antiduplicado caído, los reintentos de YCloud (+20 s, 1 m, 5 m, 30 m, 1 h, 2 h,
  2 h) y de GHL (hasta +10 h 54 m) se guardaron como mensajes nuevos.
- Restaurado el 20 oct 08:44 UTC: puerto solo en `127.0.0.1` (commit `cb29240`, desplegado en el
  run 39408739873), binario en `/opt/fyzon/quarantine/` y Redis limpio. La IA volvió a contestar.
- Ojo al restaurar con Redis vacío: los reintentos pendientes de los proveedores entran como
  mensajes nuevos y disparan la IA. Para evitar doble respuesta se marcaron como recibidos los
  `ghl_oauth:7:<messageId>` pendientes (los `messageId` salen del log `payload received (raw)`).
- Efecto en Tally: un email "Your Webhooks integration needs attention" con 5 envíos del formulario
  marcados como fallidos ("timeout of 10000ms exceeded") desde el 19 oct a las 12:12 (hora de
  Madrid, la `lead_form_submissions` 296). `automation-lead-form.ts` comprueba duplicados en Redis
  antes de nada y, con Redis caído, la respuesta pasaba de los 10 s de Tally. No se perdió ninguno:
  todos están guardados y evaluados. Tras restaurar, cada envío tarda 0,3-1,7 s. No hay que
  reenviarlos desde Tally: un aprobado no recibe otra bienvenida, pero un rechazado se duplicaría.
- Prevención en producción desde el 20 oct, 18:00 UTC (`2c8aafe`, PR #12): Redis falla a los 2 s
  en vez de colgar el motor, antiduplicado en BD (migración 080), `/health` con Redis (503 si cae) y
  alerta de IA muda por email a Iván. El primer aviso llegó a las 18:05 UTC.
- La cola de la caída: GHL reintenta cada webhook fallido con el mismo `messageId` a +20 s, 45 s,
  2 min, 5 min, 15 min, 30 min, 1 h, 3 h, 6 h y 12 h, y luego cada 24 h hasta recibir un 200. El
  motor guardaba la hora de la entrega, así que mensajes del 17-18 oct entraban como nuevos. La IA
  intentaba contestar, GHL lo rechazaba con 400 (ventana de Instagram cerrada) y la alerta mandó
  6 avisos la noche del 20 oct.
- Desde el 21 oct, 03:45 UTC (`767b1f9`), `sent_at` es `dateAdded`, y lo escrito hace más de 24 h
  se guarda sin despertar a la IA ni contar para la alerta. La migración 081 impide que
  `conversations.last_message_at` retroceda.
- Las 8 conversaciones de Instagram del aviso no estaban paradas por un fallo: llevaban días con la
  ventana cerrada y solo Tania puede contestarlas, a mano desde la app.
- Borrado de copias en marcha el 21 oct: se regenera la lista con la regla corregida y Iván ejecuta
  el `DELETE` en Supabase (la confirmación del MCP lo rechazó dos veces). Regla: misma conversación
  y origen que una fila anterior de menos de 25 h, con el mismo texto o, en adjuntos, la misma URL.
  Se conserva siempre la primera.

## 2. Diagnóstico medido el 20 oct

- **Bienvenidas.** El arreglo del 7 oct funciona, pero las aperturas cambiaron. «Holaaa! Vi que
  empezaste a seguirme…» se contó bien (615 conversaciones, del 2 al 23 sep). «Te doy la
  bienvenida a esta comunidad» abrió 107 hasta el 7 oct. **Desde el 8 oct no entra ninguna
  bienvenida a seguidores nuevos.** O se apagó su automatización, o el texto nuevo cae en el Caso C
  de `routeGhlOutbound` (descarte sin guardar). Desde el deploy del 20 oct, el log de descartes
  vuelve a traer el `preview`. Aparte, «Hola, por aquí Tânia 😊 He visto que te interesa…» (502
  conversaciones desde el 25 ago) lleva «espalda» y cuenta como «Palabra clave enviados».
- **Inbound.** El dashboard no tenía tarjeta de dirección inbound. Además, desde el 8 oct 25
  personas escribieron primero por Instagram sin palabra clave activa: 21 sin ninguna respuesta y
  al menos 9 interesadas. Catorce palabras clave `inbound` (hernia, lumbar, dolor, programa,
  precio…) siguen `is_active=false` desde la Fase 0 de agosto.
- **País en Instagram.** 1 de 44 conversaciones lo preguntó en los dos primeros mensajes de la IA;
  de media, en el 10.º; 15 nunca.
- **Precio.** `allowed_price_text` = «entre 600 y 1.200€». Tania corrige: vende un acompañamiento,
  no sesiones, y el rango si insiste es 200–1.200 € según modalidad y duración. Con Elena (9 oct)
  la IA dio la cifra a la primera.
- **Citas a las 01:30 y 06:00.** Las reservaron las leads (+52) desde el widget de GHL de la
  agenda de WhatsApp (`createdBy.source = booking_widget`), no la IA. Los dos calendarios son
  `personal` (disponibilidad del usuario de Tania) y el 20 oct solo ofrecían huecos de 12 a 19 h.
  Se leen con `apps/motor-agente/scripts/diag-calendars-tenant.ts --tenant 7` (solo lectura).
- **Autonomía.** Las instrucciones personalizadas entran en `trainer_prefs_v1` como ajustes de
  estilo por debajo del coach: no pueden cambiar precio, zona ni el camino a la llamada.

## 3. Decisiones de Iván (20 oct)

- **D1.** Fuera de zona: cierre con el recurso que encaja con lo que contó, en un solo turno y
  sin enlace de agenda. Revierte el corte directo del 3 oct.
- **D2.** La cifra del precio solo sale si antes salió el primer literal, comprobado en código.
- **D3.** Recontar el histórico de aperturas según lo que marque Tania, con copia previa.
- **D4.** Ya: guía de lo que puede tocar ella y ronda semanal fija. Después: «Mis textos»
  editables en el panel y probados en el simulador.

## 4. En producción desde el 20 oct (`bd23e50`)

Tarjetas añadidas a su dashboard por canal (`dashboard_widgets` 51-54: recibidos y atendidos de
`ig-in` y `fb`).

- `72bebfb` **Tarjetas de inbound**: `inbound_total` («Inbound recibidos», `direction='inbound'`)
  e `inbound_answered_rate` («Inbound atendidos», `has_team_reply`: algún mensaje `ai` o `human`).
  Con datos de los últimos 7 días: 456 inbound (437 de Facebook) y 39 % atendidos. Al desplegar,
  añadirlas a su dashboard por canal en `dashboard_widgets`.
- `76d022a` **País a tiempo (V23)**: `apps/motor-agente/src/lib/country-ask.ts` y bloque en
  `pipeline.ts`, antes de V22. En Instagram o Messenger, desde el turno 2 de la IA (la apertura
  nuestra no cuenta), si el país no se sabe ni se ha preguntado, el turno lo pregunta. Un
  reintento y nunca tumba el turno. Activo por defecto con `call_gate.require_country`; se ajusta
  con `call_gate.ask_country_by_turn` (0 lo apaga) y `call_gate.ask_country_question`. El
  simulador devuelve `country_ask` y `retries`.
- Batería local con el modelo real (`.tmp/sim-tests/bateria-pais-local.mts`; hay que copiarla a
  `apps/motor-agente/scripts/` para que resuelva módulos): en los 3 casos sin país lo preguntó en el
  turno 2; con «Te escribo desde Madrid» no lo pregunta y declara ES. Visto para el v30: si no
  contesta, lo vuelve a preguntar y a veces dice «para saber si puedo acompañarte».

## 5. Pendiente (al 21 oct)

1. **Respuestas de Tania.** El 21 oct no había contestado.
   - Bienvenidas, inbound y citas de madrugada se le reenvían en un mensaje de tres preguntas.
   - Precio, cierre con recurso e implicación entran en el coach v30, que necesita primero el OK de
     Iván y después el de Tania a las frases.
2. **Sin esperar a Tania: desplegado el 21 oct (rama `feat/tania-fase-1-2` en `main`, migración
   082 aplicada), con el v30 y su configuración SIN cargar.** Lo que actúa ya: el aviso de
   `/keywords` y la regla de la respuesta al país. D1 y D2 están en el código pero dormidos hasta
   que se cargue su configuración.
   - aviso de aperturas sin clasificar en `/keywords` (el motor guarda el Caso C en
     `unmatched_openings`);
   - guía de lo que puede tocar ella (`setters_ia/.tmp/ronda-tania-20-oct/guia-tania.md`, sin
     enviar);
   - D2 en código. La cifra autorizada solo sale si la primera frase ya salió o si ya había
     preguntado el precio en un turno contestado; se busca por sus números, porque V11 no ve
     «€» ni «$». Si la adelanta tras el reintento, sale solo la primera frase (decisión de Iván);
   - D1 en código. `zone_close_resources` guarda las variantes del cierre 8 con su vídeo; el modelo
     escribe el cierre y el motor manda la variante cuya URL eligió. Las directivas dicen «ni
     enlace de agenda» solo a los tenants con recursos;
   - la respuesta corta a nuestra pregunta del país («De Perú», «Soy de Cuba») es residencia
     declarada y la cierra el motor. Antes era mención y el modelo improvisaba: en la batería
     escribió «Cuba está fuera de las zonas donde puedo llevar casos»;
   - coach v30 escrito, con el OK de Iván al contenido, y probado con la batería local (envuelve el
     cliente de Supabase: el bloque y la configuración nuevos sin cargar nada). Configuración a
     cargar con él: `allowed_price_text` «entre 200 y 1.200 €», `price_first_step_text` (el primer
     literal) y `zone_close_resources` (las tres variantes).
3. **Lo que depende de sus respuestas:**
   - recuento del histórico (D3);
   - alta de sus bienvenidas en `/keywords`;
   - activar las palabras clave `inbound`;
   - cargar el v30.
4. **Fase 3:** ronda semanal y «Mis textos».
