# SOP — La IA deja de contestar o Tally avisa de timeouts

**Origen:** 17-20 oct 2026. Tania: "ni Instagram ni WhatsApp". Tres días sin una sola respuesta de
la IA y nada avisó: los webhooks seguían llegando (`last_webhook_at` al día) y `/health` decía OK.
La causa era Redis, que sostiene la cola de respuestas y el antiduplicado: estaba publicado en
`0.0.0.0:6379` sin contraseña, un ataque `REPLICAOF` dejó un binario como `dump.rdb`, Redis se colgó
y, tras un reinicio del VPS, no volvió a arrancar. Efectos en cadena: mensajes duplicados por los
reintentos de YCloud y GHL, 5 envíos del formulario marcados como fallidos en Tally, y conversaciones
cuya ventana de 24 h se cerró sin respuesta. Detalle en
[`docs/knowledge/project_tania_ronda_2026-10-20.md`](../docs/knowledge/project_tania_ronda_2026-10-20.md).

**Desde el 20-oct-2026 (`2c8aafe`) el motor se defiende de lo peor.** Si Redis no contesta:
- los comandos fallan a los 2 s;
- el mensaje se guarda con antiduplicado en BD (migration 080);
- la conversación espera en memoria a que Redis vuelva y el webhook responde 200;
- `/health` da 503;
- a los 15 min sin respuesta llega el email de IA muda.

Lo que sigue haciendo falta a mano está abajo.

## Trigger

- Llega el email «[Fyzon] La IA no contesta en <entrenador>: N conversaciones sin respuesta», de
  `alertas@fyzon.es` a los agency admins. En Gmail cae en la pestaña Notificaciones.
- Un trainer dice que la IA no contesta, en un canal o en todos.
- Tally manda "Your Webhooks integration needs attention" con "timeout of 10000ms exceeded".
- En el panel aparece el mismo mensaje de una lead repetido varias veces (reintentos que entran).

## Pasos

1. **¿Caída o cola de una caída anterior?** `curl -s https://setter.fyzon.es/health`:
   - 503 o `redis_reachable: false`: Redis o Supabase no contestan. Paso 5.
   - `debounce_overdue` > 0: hay conversaciones vencidas que nadie procesa. Paso 5.
   - `debounce_deferred_in_memory` > 0: Redis falló hace poco y el motor guarda esas conversaciones
     en memoria hasta que vuelva. Si el motor se reinicia antes, se pierden: paso 8.
   - Todo en verde, pero la IA genera turnos en las conversaciones del aviso y GHL los rechaza con
     400: es la cola de una caída anterior. Paso 9.
2. **¿La IA está generando respuestas?** Turnos reales por hora frente a mensajes de leads:
   ```sql
   SELECT date_trunc('hour', created_at) AS hora, count(*) AS turnos_ia
   FROM llm_calls
   WHERE tenant_id = <X> AND role = 'generator' AND conversation_id IS NOT NULL
     AND created_at > now() - interval '72 hours'
   GROUP BY 1 ORDER BY 1 DESC;
   ```
   Las llamadas con `conversation_id` nulo son del simulador: no cuentan. Si hay leads escribiendo
   y cero turnos, el problema está antes del modelo: la cola o una pausa (paso 4). Si hay turnos
   pero no salen mensajes, mirar `message_schedules` (`status` y `last_error`). Un
   `GHL POST /conversations/messages failed: HTTP 400` en Instagram o Facebook suele ser la ventana
   de 24 h cerrada. Si fallan las llamadas al modelo, mirar Anthropic (saldo, 429).
3. **¿Llegan y se guardan los mensajes?** `integration_accounts.last_webhook_at` por proveedor y
   mensajes `source='lead'` por hora. Si los webhooks llegan pero no se guarda nada, el handler se
   está quedando colgado o fallando: logs del motor (paso 5).
4. **¿Está en pausa a propósito?** `tenant_configs.ai_enabled` y `conversations.ai_paused_until` de
   los casos concretos. Con `classified_only`, un inbound sin palabra clave activa nace en pausa por
   diseño: revisar qué palabras clave `inbound` están activas antes de hablar de caída. La alerta ya
   descarta las conversaciones en pausa, con handoff o sin integración activa en su canal: si una
   sale en el aviso, no es nada de eso.
5. **El VPS, solo lectura** (`ssh -i ~/.ssh/fyzon_vps_deploy deploy@156.67.29.126`):
   ```bash
   docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}"
   docker logs --tail 40 fyzon-redis
   docker logs fyzon-motor 2>&1 | grep -ciE "redis\] error|dedup skipped|Redis no responde|tickDebounce error"
   ss -ltn | grep 6379
   ```
   Redis tiene que estar `healthy` y escuchando solo en `127.0.0.1`. Desde fuera,
   `timeout 6 bash -c 'echo > /dev/tcp/156.67.29.126/6379'` tiene que fallar. El motor no registra
   `request completed`: para medir una ruta, comparar la primera y la última línea de log de su
   `reqId`.
6. **Si Redis no arranca** ("Wrong signature trying to load DB from file"): mirar qué hay en el
   fichero antes de tocar nada.
   ```bash
   docker run --rm -v fyzon_redis-data:/data:ro alpine:3 sh -c "head -c 16 /data/dump.rdb | od -c"
   docker logs fyzon-redis 2>&1 | grep -c "REPLICAOF [0-9].* enabled"
   ```
   Si empieza por `ELF`, es un ataque: revisar además `docker diff fyzon-redis` (vacío), `last`, las
   claves de `~/.ssh/authorized_keys`, `crontab -l`, procesos y conexiones (`ss -tn`). Con el OK de
   Iván: `docker compose stop redis`, mover `dump.rdb` a `/opt/fyzon/quarantine/` con `chmod 000`,
   comprobar que el compose tiene `127.0.0.1:6379:6379` y `docker compose up -d redis`. El motor se
   reconecta solo.
7. **Antes de que lleguen los reintentos.** Lo que no recibe un 200 vuelve, con el mismo id:
   - **GHL:** a +20 s, 45 s, 2 min, 5 min, 15 min, 30 min, 1 h, 3 h, 6 h y 12 h, y luego cada 24 h
     hasta que recibe un 200. Un mensaje puede volver días después de escribirse.
   - **YCloud:** a +20 s, 1 min, 5 min, 30 min, 1 h, 2 h y 2 h (unas 5 h 40 min), y para.

   El antiduplicado en BD descarta el reintento de un mensaje ya guardado con su
   `provider_message_id`. Quedan dos huecos:
   - **Filas guardadas sin id** (todo lo anterior a la migration 080): de cada mensaje entra una
     copia más, la primera entrega buena, y después GHL para.
   - **La hora de GHL** (resuelto en `767b1f9`, 21-oct): hasta entonces el motor guardaba como
     `sent_at` la hora de la entrega, y un mensaje de hace días entraba como nuevo y despertaba a la
     IA. Ahora guarda `dateAdded`, y lo escrito hace más de 24 h entra en su sitio sin despertarla
     (log `routeGhlInbound: mensaje viejo`). Las filas anteriores conservan la hora de entrega.

   Si una de esas copias puede despertar a la IA en una conversación ya contestada y con la ventana
   abierta, marcar antes el mensaje como recibido: `SET ghl_oauth:<tenant>:<messageId> 1 EX 172800
   NX` en Redis. El `messageId` y el `dateAdded` salen del log `payload received (raw)`. Escribir en
   Redis del VPS necesita una petición explícita de Iván.
8. **Recuperar las conversaciones sin respuesta.** Listar las que tienen IA activa y mensajes de la
   lead después del último mensaje nuestro. **La ventana de 24 h cuenta desde el mensaje original,
   no desde la última copia reenviada.** En GHL es la `sent_at` desde `767b1f9`; en filas
   anteriores, el `dateAdded` del log. Meter en la cola solo las que tienen la ventana abierta, empezando por la que
   cierra antes y con 15 s entre una y otra:
   `docker exec fyzon-redis redis-cli ZADD fyzon:debounce:conversations <ms> <conversation_id>`.
   Comprobar que salen en `message_schedules` (`status='sent'`). Las de ventana cerrada, al trainer:
   Instagram a mano desde la app; WhatsApp necesita plantilla.
9. **La cola de las 24 h siguientes.** Desde `767b1f9` lo escrito hace más de 24 h ya no despierta
   a la IA ni entra en la alerta: este paso vale para reintentos de filas guardadas antes. Al
   restaurar, cada mensaje de GHL que seguía fallando vuelve una vez más, en su siguiente paso del
   calendario. Los que llevaban más de un día fallando vuelven a las 24 h justas de su último
   intento.
   - **Si la conversación tiene la IA activa**, la copia la despierta: un turno de unos 0,15 $.
   - **Con la ventana cerrada**, GHL rechaza el envío con 400. A la lead no le llega nada y al
     trainer no se le avisa: el horario acaba en `failed`, sin notificación.
   - **La alerta lo cuenta como mudo:** como no queda respuesta guardada, a los 15 min manda otro
     email. Como mucho uno cada 30 min por trainer, y cada conversación una vez por mensaje.
   - **Previsión:** qué mensajes volverán, y cuándo como tarde:
   ```sql
   SELECT m.conversation_id, count(*) AS intentos,
          max(m.sent_at) + interval '24 hours' AS vuelve_como_tarde,
          EXISTS (SELECT 1 FROM conversation_messages r
                  WHERE r.conversation_id = m.conversation_id AND r.source IN ('ai','human')
                    AND r.sent_at > <restauracion>) AS contestada
   FROM conversation_messages m
   JOIN conversations c ON c.id = m.conversation_id
   JOIN channels ch ON ch.id = c.channel_id
   WHERE m.tenant_id = <X> AND m.source = 'lead'
     AND ch.channel_type IN ('instagram_dm', 'facebook_messenger')  -- YCloud no reintenta tanto
     AND m.sent_at BETWEEN <restauracion> - interval '24 hours' AND <restauracion>
     AND c.state = 'active' AND c.is_handoff_to_human IS NOT TRUE
     AND (c.ai_paused_until IS NULL OR c.ai_paused_until <= now())
     -- fuera los mensajes que ya tuvieron su entrega buena tras restaurar
     AND NOT EXISTS (SELECT 1 FROM conversation_messages d
                     WHERE d.conversation_id = m.conversation_id AND d.source = 'lead'
                       AND d.sent_at > <restauracion>
                       AND CASE WHEN m.media_url IS NOT NULL THEN d.media_url = m.media_url
                                ELSE d.content IS NOT DISTINCT FROM m.content END)
   GROUP BY 1
   HAVING max(m.sent_at) + interval '24 hours' > now()
   ORDER BY 3;
   ```
   La consulta solo ve los intentos que llegaron a guardarse. Las filas con `contestada = true` son
   las que pueden acabar en una segunda respuesta si la ventana sigue abierta: marcarlas antes
   (paso 7). Las que ya se marcaron siguen saliendo, porque su entrega buena no deja fila: comprobar
   que la clave sigue viva con `redis-cli TTL ghl_oauth:<tenant>:<messageId>`.

   Para distinguir la cola de una caída nueva: `/health` en verde, `debounce processed` en el log
   para esas conversaciones y sus horarios con el 400. La cola termina a las 24 h de restaurar.
10. **Limpiar duplicados**, con OK y copia local en JSON antes. Regla: misma conversación y origen
    que una fila anterior de menos de 25 h, y el mismo texto o, si es un adjunto, la misma URL (la
    descripción que añade el enriquecedor cambia de una copia a otra); se conserva la primera. Las
    copias de GHL llegan a las 24 h justas de la anterior, dentro de la regla. Sacar la lista cuando
    acabe la cola (paso 9), para borrar una sola vez. Antes de borrar, comprobar que de cada fila
    queda un original fuera de la lista. El `DELETE` por MCP pide una confirmación que se ha
    rechazado sola: lo ejecuta Iván en el editor SQL de Supabase.
11. **Tally avisa de timeouts.** Mirar si faltan ids en `lead_form_submissions` en la ventana del
    fallo: si no hay huecos, no se perdió nada y Tally solo marcó tarde la respuesta. La hora del
    primer fallo del email (hora de Madrid) casa con una fila concreta. **No reenviar desde Tally:**
    un aprobado no recibe otra bienvenida (`hasConversationWithSource`), pero un rechazado se
    duplica. Sin Redis de por medio, la ruta tarda 0,3-1,7 s; el cualificador (Sonnet) añade unos 3 s
    a los aprobados. Con Redis caído, desde `2c8aafe` la ruta tarda unos 2 s más, no se cuelga.
12. **Cerrar.** Nota en `docs/knowledge/` (la ronda del tenant) y mensaje al trainer con qué pasó,
    qué se recuperó y qué tiene que hacer a mano.

## Output esperado

- La IA contestando otra vez: turnos con `conversation_id` en la última hora.
- `/health` en verde, con `debounce_overdue` y `debounce_deferred_in_memory` a 0.
- Redis sano y solo en loopback.
- Las conversaciones pendientes contestadas o en manos del trainer, sin dobles respuestas.
- La cola de avisos prevista y explicada.
- Los duplicados fuera, una vez terminada la cola, y el trainer informado.

## Errores que evita

- Buscar el fallo en los canales cuando es la cola interna: los webhooks llegan aunque la IA no
  conteste.
- Reiniciar o vaciar Redis sin mirar qué había en `dump.rdb` (aquí era un ataque).
- Contar la ventana de 24 h desde la última copia, o desde la `sent_at` de las filas de GHL
  anteriores a `767b1f9` (hora de la entrega): dos conversaciones de WhatsApp se dieron por abiertas
  y llevaban horas cerradas.
- Que la IA conteste dos veces al mismo mensaje cuando entran los reintentos tras restaurar.
- Tomar por una caída nueva la cola de avisos de las 24 h siguientes a restaurar.
- Dar por hecho que el antiduplicado en BD frena las copias de lo guardado antes de la migration 080.
- Borrar duplicados antes de que acabe la cola y tener que repetirlo.
- Reenviar desde Tally lo que ya estaba procesado.
- Dejar el compose del repo con `6379:6379`: el siguiente deploy reabre el puerto.

## Próxima revisión

Revisado el 20-oct-2026 tras desplegar la prevención (`2c8aafe`) y el 21-oct con el arreglo de la
hora de GHL (`767b1f9`, migration 081). La siguiente revisión toca en dos momentos:
- tras el primer aviso real que no sea la cola de este incidente;
- si aparecen copias de YCloud fechadas con la hora de entrega: hoy no se lee su `sendTime`.

## Relacionado

- `apps/motor-agente/src/lib/redis.ts`, `lib/debounce-buffer.ts`, `plugins/cron-scheduler.ts`,
  `routes/health.ts`, `routes/automation-lead-form.ts`.
- `services/silent-ai-check.ts` (la alerta), `services/notify-trainer.ts` y `lib/email-templates.ts`
  (el email), `services/ghl-message-router.ts` (la `sent_at` de GHL).
- Migrations `schema/v1/migrations/080-conversation-messages-provider-message-id.sql` y
  `081-conversation-last-message-at-monotonic.sql`.
- SOP [queja de producción sobre el setter](queja-produccion-setter.md).
- Skill `fyzon-security-audit` si hay indicios de intrusión más allá del contenedor.
- Memorias: `project_incidente_redis_expuesto_2026_10`, `reference_git_en_modo_auto`.
