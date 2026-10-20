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
- Prevención (endurecer Redis, antiduplicado en BD, `/health` con Redis, alerta de IA muda): rama
  `claude/admiring-albattani-ce0c91`, pendiente del OK de Iván a la migración 080 y al 503 de `/health`.
- Pendiente: borrar las 114 copias de las 16 conversaciones afectadas. La confirmación del MCP
  rechazó el `DELETE` dos veces; la consulta y la copia de seguridad están en `.tmp/` del worktree.
  Regla usada: misma conversación, origen, texto y adjunto que una fila anterior de menos de 25 h,
  conservando siempre la primera.

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

## 4. Lo hecho en la rama `feat/tania-ronda-20-oct` (sin desplegar)

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

## 5. Pendiente

1. Respuestas de Tania al mensaje de seis preguntas: qué apertura es bienvenida, inbound sin
   palabra clave, precio, cierre con recurso, implicación y qué cambió en los calendarios hacia el
   15-17 oct.
2. Fase 1 restante: recuento del histórico (D3) y aviso de aperturas sin clasificar en `/keywords`.
3. Fase 2: coach v30 (precio, encaje, cierre con recurso) y la comprobación del precio en código (D2).
4. Fase 3: guía, ronda semanal y «Mis textos».
5. Despliegue de la rama: juntar con `main`, push (deploy del motor y del panel) y añadir las tarjetas.
