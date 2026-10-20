# SOP — La IA deja de contestar o Tally avisa de timeouts

**Origen:** 17-20 oct 2026. Tania: "ni Instagram ni WhatsApp". Tres días sin una sola respuesta de
la IA y nada avisó: los webhooks seguían llegando (`last_webhook_at` al día) y `/health` decía OK.
La causa era Redis, que sostiene la cola de respuestas y el antiduplicado: estaba publicado en
`0.0.0.0:6379` sin contraseña, un ataque `REPLICAOF` dejó un binario como `dump.rdb`, Redis se colgó
y, tras un reinicio del VPS, no volvió a arrancar. Efectos en cadena: mensajes duplicados por los
reintentos de YCloud y GHL, 5 envíos del formulario marcados como fallidos en Tally, y conversaciones
cuya ventana de 24 h se cerró sin respuesta. Detalle en
[`docs/knowledge/project_tania_ronda_2026-10-20.md`](../docs/knowledge/project_tania_ronda_2026-10-20.md).

## Trigger

- Un trainer dice que la IA no contesta, en un canal o en todos.
- Tally manda "Your Webhooks integration needs attention" con "timeout of 10000ms exceeded".
- En el panel aparece el mismo mensaje de una lead repetido varias veces (reintentos que entran).

## Pasos

1. **¿La IA está generando respuestas?** Turnos reales por hora frente a mensajes de leads:
   ```sql
   SELECT date_trunc('hour', created_at) AS hora, count(*) AS turnos_ia
   FROM llm_calls
   WHERE tenant_id = <X> AND role = 'generator' AND conversation_id IS NOT NULL
     AND created_at > now() - interval '72 hours'
   GROUP BY 1 ORDER BY 1 DESC;
   ```
   Las llamadas con `conversation_id` nulo son del simulador: no cuentan. Si hay leads escribiendo
   y cero turnos, el problema está antes del modelo: la cola o una pausa (paso 3). Si hay turnos
   pero no salen mensajes, mirar `message_schedules` (`status='failed'`, `last_error`). Si las
   llamadas fallan, mirar Anthropic (saldo, 429).
2. **¿Llegan y se guardan los mensajes?** `integration_accounts.last_webhook_at` por proveedor y
   mensajes `source='lead'` por hora. Si los webhooks llegan pero no se guarda nada, el handler se
   está quedando colgado; lo primero que toca es Redis (antiduplicado).
3. **¿Está en pausa a propósito?** `tenant_configs.ai_enabled` y `conversations.ai_paused_until` de
   los casos concretos. Con `classified_only`, un inbound sin palabra clave activa nace en pausa por
   diseño: revisar qué palabras clave `inbound` están activas antes de hablar de caída.
4. **El VPS, solo lectura** (`ssh -i ~/.ssh/fyzon_vps_deploy deploy@156.67.29.126`):
   ```bash
   docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
   docker logs --tail 40 fyzon-redis
   docker logs fyzon-motor 2>&1 | grep -ciE "redis\] error|tickDebounce error|MaxRetriesPerRequest"
   ss -ltn | grep 6379
   ```
   Redis tiene que estar `healthy` y escuchando solo en `127.0.0.1`. Desde fuera,
   `timeout 6 bash -c 'echo > /dev/tcp/156.67.29.126/6379'` tiene que fallar. El motor no registra
   `request completed`: para medir una ruta, comparar la primera y la última línea de log de su
   `reqId`.
5. **Si Redis no arranca** ("Wrong signature trying to load DB from file"): mirar qué hay en el
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
6. **Antes de que lleguen los reintentos.** Con Redis vacío, los reintentos pendientes de GHL (hasta
   +10 h 54 m) y de YCloud (hasta ~5 h 40 m) entran como mensajes nuevos y despiertan la IA, también
   en conversaciones ya contestadas. Si se va a contestar a mano o con la cola, marcar antes como
   recibidos los `ghl_oauth:<tenant>:<messageId>` pendientes (salen del log `payload received
   (raw)`) con `SET … EX 172800 NX`. Escribir en Redis del VPS necesita una petición explícita de
   Iván.
7. **Recuperar las conversaciones sin respuesta.** Listar las que tienen IA activa y mensajes de la
   lead después del último mensaje nuestro. **La ventana de 24 h cuenta desde el mensaje original,
   no desde la última copia reenviada.** Meter en la cola solo las que tienen la ventana abierta,
   empezando por la que cierra antes y con 15 s entre una y otra:
   `docker exec fyzon-redis redis-cli ZADD fyzon:debounce:conversations <ms> <conversation_id>`.
   Comprobar que salen en `message_schedules` (`status='sent'`). Las de ventana cerrada, al trainer:
   Instagram a mano desde la app; WhatsApp necesita plantilla.
8. **Limpiar duplicados**, con OK y copia local en JSON antes. Regla: misma conversación, origen,
   texto y adjunto que una fila anterior de menos de 25 h; se conserva la primera. Antes de borrar,
   comprobar que de cada fila queda un original fuera de la lista. El `DELETE` por MCP pide una
   confirmación que se ha rechazado sola: lo ejecuta Iván en el editor SQL de Supabase.
9. **Tally avisa de timeouts.** Mirar si faltan ids en `lead_form_submissions` en la ventana del
   fallo: si no hay huecos, no se perdió nada y Tally solo marcó tarde la respuesta. La hora del
   primer fallo del email (hora de Madrid) casa con una fila concreta. **No reenviar desde Tally:**
   un aprobado no recibe otra bienvenida (`hasConversationWithSource`), pero un rechazado se
   duplica. Sin Redis de por medio, la ruta tarda 0,3-1,7 s; el cualificador (Sonnet) añade unos 3 s
   a los aprobados.
10. **Cerrar.** Nota en `docs/knowledge/` (la ronda del tenant) y mensaje al trainer con qué pasó,
    qué se recuperó y qué tiene que hacer a mano.

## Output esperado

La IA contestando otra vez (turnos con `conversation_id` en la última hora), Redis sano y solo en
loopback, las conversaciones pendientes contestadas o en manos del trainer, sin dobles respuestas,
los duplicados fuera y el trainer informado.

## Errores que evita

- Buscar el fallo en los canales cuando es la cola interna: los webhooks llegan y `/health` dice OK.
- Reiniciar o vaciar Redis sin mirar qué había en `dump.rdb` (aquí era un ataque).
- Contar la ventana de 24 h desde la última copia: dos conversaciones de WhatsApp se dieron por
  abiertas y llevaban horas cerradas.
- Que la IA conteste dos veces al mismo mensaje cuando entran los reintentos tras restaurar.
- Reenviar desde Tally lo que ya estaba procesado.
- Dejar el compose del repo con `6379:6379`: el siguiente deploy reabre el puerto.

## Próxima revisión

Cuando esté desplegada la rama de prevención (`commandTimeout` en ioredis, antiduplicado en BD,
`/health` con Redis y alerta de IA muda): los pasos 1-2 los hará la alerta y el 8 dejará de hacer
falta.

## Relacionado

- `apps/motor-agente/src/lib/redis.ts`, `lib/debounce-buffer.ts`, `plugins/cron-scheduler.ts`,
  `routes/automation-lead-form.ts`.
- SOP [queja de producción sobre el setter](queja-produccion-setter.md).
- Skill `fyzon-security-audit` si hay indicios de intrusión más allá del contenedor.
- Memorias: `project_incidente_redis_expuesto_2026_10`, `reference_git_en_modo_auto`.
