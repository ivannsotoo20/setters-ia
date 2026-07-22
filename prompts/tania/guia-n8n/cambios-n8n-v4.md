# Tania v4 — Guía de cambios en n8n

Guía operativa en dos partes:

- **Parte 0 — Quick wins de la semana 0**: retoques sobre los workflows **actuales** (`Tania`, `Tania WhatsApp`, `seguimiento_tania`), sin migrar nada. Cada uno se puede hacer en minutos y por separado.
- **Parte 1 — Migración v4**: SQL → importar los 3 workflows nuevos → credenciales → pegar prompts → validar → corte por canal con rollback trivial.

Convenciones de esta guía:

- Los nombres entre backticks (`Redis7`, `Edit Fields2`…) son los **nombres reales de los nodos** en los exports vivos `Tania.json` (IG, 106 nodos) y `Tania WhatsApp.json` (124 nodos).
- Todo SQL contra la BD de Tania se ejecuta **a mano en el SQL editor de su Supabase** (el proyecto de la credencial n8n "Postgres Supabase"). Nunca desde el MCP del SaaS Fyzon: son bases de datos distintas.

---

## Parte 0 — Quick wins en los workflows ACTUALES (sin migrar)

### 0.1 Verificar y fijar las URLs de agenda correctas por flujo

**Mapping oficial (confirmado por Iván 2026-07-23; los 3 calendarios verificados en navegador ese día):**

| Flujo | Slug correcto | Nombre en GHL |
|---|---|---|
| Instagram outbound (bienvenidas — Tania abre) | `agenda-de-taniant4o637i8qgc` | "Agenda de Tania Instagram BV" |
| Instagram inbound (el lead escribe primero) | `agenda-de-taniant4o63` | "Agenda de Tania Instagram" |
| WhatsApp (ambos sentidos) | `agenda-de-tania` | "Agenda de Tania WhatsApp" |

⚠️ Contexto: `agenda-de-tania` renderizaba una **página en blanco** el 22-jul (y se envió así durante meses: 233 veces desde abril) y el 23-jul ya funcionaba — probablemente el calendario se (re)creó o publicó ese día. `agenda-de-taniat4o63` (la errata sin la "n") sigue siendo un 404 y NO debe quedar en ningún prompt. Tras cualquier cambio de calendario en GHL, re-abrir las 3 URLs en navegador antes de dar nada por bueno.

**Pasos** (SQL editor del Supabase de Tania):

```sql
-- 1. Ver qué slug envía cada bloque hoy (guardar el resultado como backup del content)
SELECT id, block_key,
       (regexp_matches(content, 'agenda-de-tania[0-9a-z]*', 'g'))[1] AS slug
FROM public.prompt_blocks_tania
WHERE content LIKE '%agenda-de-tania%';

-- 2. Único slug SIEMPRE roto: el 404 con la errata (le falta la 'n').
--    Estaba en el prompt de WhatsApp → se reemplaza por el calendario de WhatsApp.
UPDATE public.prompt_blocks_tania
SET content = regexp_replace(content, 'agenda-de-taniat4o63(?![0-9a-z])', 'agenda-de-tania', 'g')
WHERE content ~ 'agenda-de-taniat4o63(?![0-9a-z])';

-- 3. Verificar que cada bloque envía el slug de SU flujo según la tabla de arriba
--    (bloques de IG bienvenidas → ...t4o637i8qgc; IG inbound → ...t4o63; WA → agenda-de-tania).
--    Si alguno no cuadra, corregirlo con regexp_replace usando lookahead (?![0-9a-z]),
--    porque 'agenda-de-tania' y 'agenda-de-taniant4o63' son prefijos de los slugs largos.
```

### 0.2 Dedup por message_id delante del buffer Redis existente

Hoy, si YCloud o ManyChat reintentan un webhook, el mensaje entra dos veces al buffer y el lead puede recibir doble respuesta. Se añade un dedup atómico en Redis **entre `Edit Fields2` y `Redis7`** (el push al buffer), en **ambos** workflows.

> El nodo Redis de n8n no expone SETNX; el equivalente atómico es **INCR con TTL**: devuelve `1` solo la primera vez que se ve la key.

**En `Tania WhatsApp` (cadena actual: `Edit Fields2` → `Redis7`):**

1. Añadir nodo **Redis** (credencial `Redis account`), nombre `dedup INCR`:
   - Operation: `Incr`
   - Key: `dedup:{{ $('Webhook').first().json.body.whatsappInboundMessage.wamid }}`
   - Expire: ON, TTL: `3600`
2. Añadir nodo **Code** `evaluar dedup` después:
   ```js
   // el INCR devuelve el contador bajo un nombre de propiedad que depende de la key
   const previo = $('Edit Fields2').first().json;
   const raw = $input.first().json || {};
   let count = 1;
   for (const v of Object.values(raw)) {
     const n = Number(v);
     if (!Number.isNaN(n)) { count = n; break; }
   }
   return [{ json: Object.assign({}, previo, { dedup_count: count }) }];
   ```
3. Añadir nodo **If** `¿duplicado?`: condición Number → `{{ $json.dedup_count }}` **larger than** `1`.
4. Recablear: `Edit Fields2` → `dedup INCR` → `evaluar dedup` → `¿duplicado?`; salida **false** → `Redis7`; salida **true** → un NoOp (`fin duplicado`).

**En `Tania` (IG)**: mismos 3 nodos entre `Edit Fields2` y `Redis7`, con una diferencia: ManyChat **no manda id de mensaje**, así que la key se deriva del usuario + texto:

- Key del `dedup INCR`: `dedup:ig:{{ $('Edit Fields10').first().json.ID }}:{{ $json.mensaje ? $json.mensaje.slice(0, 80) : '' }}`
- En el `evaluar dedup`, cambiar `$('Edit Fields2')` si el nodo previo tiene otro nombre (en IG también es `Edit Fields2`).

Probar: reenviar el mismo payload dos veces con "Test workflow" → la segunda debe morir en el NoOp.

### 0.3 Pregunta de país: de proactiva a reactiva

El prompt vivo hace que el setter pregunte el país de forma proactiva (fricción temprana). Cambiarlo a **reactivo**: solo registrar el país si el lead lo menciona, y preguntarlo únicamente si es imprescindible justo antes de agendar.

1. Localizar el bloque:
   ```sql
   SELECT id, block_key, content
   FROM public.prompt_blocks_tania
   WHERE content ILIKE '%país%' OR content ILIKE '%pais%';
   ```
2. Guardar copia del `content` actual (pegarlo en un .md local o en una fila de backup).
3. Editar el `content` en el editor de Supabase sustituyendo la instrucción de preguntar el país por algo del estilo:
   > «El país del lead NO se pregunta de forma proactiva. Solo se registra si el lead lo menciona por sí mismo. Únicamente si es imprescindible para coordinar la videollamada (zona horaria), pregúntalo justo antes de enviar el link de agenda, nunca antes.»
4. Verificar con una conversación de prueba que el setter ya no abre con la pregunta de país.

### 0.4 `seguimiento_tania`: quitar el DELETE a las 72h

Hoy la rama de las 9:00 (`Schedule Trigger6` → `Select rows from a table7` → `Code in JavaScript7` → `Loop Over Items6` → `Select rows from a table3` → `Switch2` → `upsert4`/`upsert5` → **`Delete table or rows`**) **borra** de `seguimiento_tania` los leads IG con más de 72h sin respuesta. Eso destruye la cola de seguimiento (el v4 la sustituye por `stage_v4='dormido'`, sin borrar nunca).

**Pasos** en el workflow `seguimiento_tania`:

1. Añadir un nodo **Postgres** `marcar seguimiento hecho` (credencial `Postgres Supabase`):
   - Operation: `Update`, tabla `seguimiento_tania`, matching column `id`
   - Values: `id = {{ $('Loop Over Items6').item.json.id }}`, `seguimiento = true`
2. Recablear las salidas de `upsert4` y `upsert5` (las dos salidas de cada uno, van ambas al delete) hacia `marcar seguimiento hecho`.
3. Conectar `marcar seguimiento hecho` → `Wait` (el que vuelve a `Loop Over Items6`).
4. **Desactivar o borrar** el nodo `Delete table or rows`.

> Nota colateral detectada: ese mismo workflow toca tablas de OTRO cliente (`seguimiento_khan` en `Delete table or rows2`, y `Select rows from a table1`/`Switch`/`upsert`/`upsert1` sobre datos khan). No tocarlo ahora, pero conviene separar esos flujos en otro workflow.

### 0.5 Los flujos de opener/bienvenida deben INSERTAR el opener en el historial

Hoy la bienvenida se envía pero **no queda en `n8n_chat_histories_tania`**: el cerebro nunca "ve" el primer mensaje de Tania y el lead parece abrir la conversación de la nada.

**En `Tania` (IG)** — la rama de bienvenida es `If2` (true = `body.lead == "Outbound"`), que acaba creando el lead en CRM (`Insert rows in a table1` y también `Insert rows in a table3` en la variante inbound):

1. Añadir un nodo **Postgres** `historial opener (ai)` tras cada insert de CRM de bienvenida:
   - Operation: `Insert`, tabla `n8n_chat_histories_tania`, columnas (define below):
     - `session_id` = `{{ $('Webhook').first().json.body.user_id }}`
     - `message` = `{"type": "ai", "content": {{ JSON.stringify($('Webhook').first().json.body.bienvenida) }}}`
     - `fecha_mensaje` = `{{ $now }}`
   (mismo patrón de columnas que usa `Postgres4` en `seguimiento_tania`)
2. Conectarlo a la salida de `Insert rows in a table1` (y de `Insert rows in a table3` si esa rama también manda opener).

**En `Tania WhatsApp`** — la rama de bienvenida por keyword es `If9` (info/espalda/información...), que crea el contacto GHL (`create1`/`Code in JavaScript`) e inserta el CRM (`Insert rows in a table3` / `Insert rows in a table5`) y envía el texto con `enviar_texto1`:

1. Mismo nodo `historial opener (ai)` con:
   - `session_id` = `{{ $('Webhook').first().json.body.whatsappInboundMessage.from }}`
   - `message` = `{"type": "ai", "content": {{ JSON.stringify(<el MISMO texto literal que envía enviar_texto1>) }}}`
   - `fecha_mensaje` = `{{ $now }}`
2. Conectarlo después de `enviar_texto1` (así solo se registra si el envío no falló).

> En v4 esto ya viene de serie: el workflow principal tiene rama `¿es opener?` → `opener: historial (ai)`.

---

## Parte 1 — Migración v4

### Qué cambia (resumen para tener en la cabeza)

- **Fuera LangChain**: desaparecen `OpenAI Chat Model`, `agente_cerebro1`/`AI Agent`, `Postgres Chat Memory1`, `Structured Output Parser`, `Auto-fixing Output Parser`. El cerebro pasa a ser un `HTTP Request` directo a `https://api.anthropic.com/v1/messages` con `claude-sonnet-5`, tool use forzado (`responder_lead`) y prompt caching (2 breakpoints en system + 1 móvil en historial).
- **Un solo workflow principal** para IG y WA (detección de canal por shape del payload) + un workflow de **seguimiento** con Haiku + un webhook de **booking** desde GHL.
- **El historial sigue en `n8n_chat_histories_tania`** (la misma tabla que usaba el Postgres Chat Memory, así no se pierde ni un turno v3): v4 **escribe texto limpio** y **limpia los turnos v3 al leer** (JSON del agente → `output.mensaje_whatsapp`, prefijos `MENSAJE_USUARIO:`, notas «Le hemos hecho al usuario…», dedup de humans repetidos).
- **Nunca se borra nada**: el descarte v3 (delete a 72h) se sustituye por `stage_v4='dormido'` + caps de followups.

### Paso 1 — Aplicar el SQL

Ejecutar [`sql/001-tania-v4.sql`](sql/001-tania-v4.sql) en el SQL editor del Supabase **de Tania**. Es aditivo e idempotente. Al final del fichero hay queries de verificación.

Opcional recomendado: descomentar y ejecutar el backfill de `stage_v4` desde `pipeline_stage` (sección 5 del SQL) para que el estado inicial sea coherente.

### Paso 2 — Importar los 3 workflows (quedan desactivados)

En n8n → **Workflows → Import from File**, importar en este orden:

1. `workflows/tania-v4-principal.json` (63 nodos)
2. `workflows/tania-v4-seguimiento.json` (26 nodos)
3. `workflows/tania-v4-booking-webhook.json` (17 nodos)

No activarlos todavía. Los tres llevan sticky notes por sección explicando qué hace cada bloque y qué hay que pegar dónde.

> Si en el futuro cambian `responder_lead.schema.json` o `etapas-foco.json`, se pueden regenerar los tres JSON con `node prompts/tania/guia-n8n/scripts/build-workflows.mjs` y re-importar (o re-pegar a mano el trozo en el nodo, como indican los sticky).

### Paso 3 — Credenciales

Las credenciales existentes (`Redis account`, `Postgres Supabase`, `Manychat Tania`) se re-vinculan solas al importar (mismos ids). Crear las 3 nuevas (todas de tipo **Header Auth**):

| Credencial | Header name | Valor | De dónde sale |
|---|---|---|---|
| `Anthropic Tania` | `x-api-key` | `sk-ant-...` | consola Anthropic (crear API key para Tania) |
| `YCloud Tania` | `X-API-Key` | la API key de YCloud | copiarla del nodo `enviar_texto` del workflow vivo `Tania WhatsApp` (hoy está hardcodeada en el header del nodo) |
| `GHL Tania` | `Authorization` | `Bearer pit-...` | copiarlo del nodo `upsert` del workflow vivo (hoy hardcodeado) |

Después revisar los nodos importados que las usan (llamar Anthropic, enviar_texto YCloud, espejo GHL, plantilla) y confirmar que apuntan a la credencial correcta.

> De paso, esto saca las keys hardcodeadas de los nodos: cuando el v4 esté en producción, rotar la key de YCloud y el token pit- de GHL es un cambio de credencial, no de workflow.

### Paso 4 — Pegar los system prompts desde `dist/`

Los system prompts NO viven en los workflows: se pegan desde los ficheros compilados de `prompts/tania/dist/` (shape `{"variante","model","max_tokens":1024,"thinking":{"type":"disabled"},"system":[2 bloques text con cache_control ephemeral ttl 1h]}`). El build genera **4 variantes para el principal** + 1 para seguimiento, y **todas existen ya** en `prompts/tania/dist/`.

1. **`tania-v4-principal`** → abrir el nodo `compose` → pegar el objeto completo de cada fichero en su clave del const `DIST`:

   | Clave en `DIST` | Fichero en `prompts/tania/dist/` | Cuándo se usa |
   |---|---|---|
   | `'ig-inbound'` | `tania-v4-ig-inbound.system.json` | leads IG de flujos outbound/orgánico |
   | `'ig-bienvenidas'` | `tania-v4-ig-bienvenidas.system.json` | leads IG que entran por el flow de bienvenida |
   | `'wa-outbound'` | `tania-v4-wa-outbound.system.json` | leads WA contactados primero por Tania |
   | `'wa-inbound-leadform'` | `tania-v4-wa-inbound-leadform.system.json` | leads WA que escriben primero (formulario/lead magnet) |

   **Cómo elige el compose**: primero mira `clientes_crm_tania.fuente_v4` (la variante queda **fijada al primer contacto** y ya no cambia a mitad de conversación). Si es NULL (lead nuevo), decide por el payload: WA + inbound → `wa-inbound-leadform`; WA outbound → `wa-outbound`; IG con `flujo=bienvenida` → `ig-bienvenidas`; resto IG → `ig-inbound`. El upsert del CRM la persiste con `COALESCE(fuente_v4, <variante>)`.

2. **`tania-v4-seguimiento`** → nodo `compose seguimiento` → pegar `tania-v4-seguimiento.system.json` en `DIST_SEGUIMIENTO`.
3. Mientras alguna clave esté a `null`, el compose lanza error indicando qué fichero falta (imposible activar a medias sin darse cuenta).

El tool schema `responder_lead` ya va inline en el body del nodo `llamar Anthropic (Sonnet)`, y `ETAPAS_FOCO` ya va copiado en los compose. **Regla**: si cambian `prompts/tania/tools/responder_lead.schema.json` o `etapas-foco.json` en el repo, hay que re-pegar (o regenerar con el script) — n8n no lee ficheros.

### Paso 4b — ManyChat: marcar el flow de bienvenida con `"flujo":"bienvenida"`

Para que el compose distinga bienvenidas de outbound en IG, el **flow de bienvenida de ManyChat** debe añadir el campo `"flujo": "bienvenida"` al body del POST que hace al webhook (en la acción External Request, junto a `user_id`, `bienvenida`, etc.). Los demás flows IG no necesitan tocarse (sin `flujo`, el compose asume `ig-inbound`).

Red de seguridad: aunque a un flow se le olvide el campo, si el payload trae `bienvenida` sin `message` el normalizar también lo trata como bienvenida; y en cuanto el lead existe en CRM manda siempre `fuente_v4` (el opener ya la deja fijada a `ig-bienvenidas`).

### Paso 5 — Validar con canal de prueba

1. Activar `tania-v4-principal` (los otros dos aún no).
2. **WA**: desde el panel de YCloud, añadir un webhook endpoint temporal apuntando a `https://ddwebhook.fyzon.es/webhook/tania-v4` y escribir desde un número de prueba. **IG**: duplicar el flujo de ManyChat que hace el POST y apuntarlo a `/webhook/tania-v4` solo para una cuenta de prueba.
3. Comprobar en una conversación de 6-8 turnos:
   - burbujas de 1 a 3, ninguna >300 caracteres, con pausa entre ellas;
   - `n8n_chat_histories_tania`: turnos human/ai con **texto limpio** (nada de JSON);
   - `clientes_crm_tania`: `slots` se van rellenando y **nunca** se pisan con null; `stage_v4` avanza; `proximo_recontacto` se puebla según la regla;
   - `tania_llm_calls`: a partir de la 2ª llamada, `cache_read_input_tokens > 0` (si sigue a 0, algún byte del prefijo cambia entre llamadas: revisar que el dist pegado es idéntico en cada canal);
   - ráfaga: mandar 3 mensajes seguidos → una sola respuesta que responde a los tres;
   - duplicado: re-disparar el mismo payload → muere en `fin: duplicado` / `fin: ya procesado`.
4. Activar `tania-v4-seguimiento` y `tania-v4-booking-webhook`; forzar un candidato (`UPDATE clientes_crm_tania SET proximo_recontacto = now() WHERE id = '<lead de prueba>'`) y verificar el toque + contador; simular un POST de booking con curl y verificar `agendado` + mensaje de confirmación.

### Paso 6 — Regresión

Con el build de prompts generado, correr la regresión golden contra los fixtures:

```bash
node prompts/tania/fixtures/run-regression.mjs
```

Las conversaciones de referencia deben pasar antes de cortar tráfico real. Si el runner aún no existe en el repo, este paso se hace cuando el build de prompts de Tania esté completo — bloquea el corte, no la importación.

### Paso 7 — Corte por canal (gradual, con rollback trivial)

Orden del corte — de menor a mayor riesgo:

1. **IG bienvenidas**: en ManyChat, editar el flujo de bienvenida que hace POST al webhook y cambiar la URL `.../webhook/tania` → `.../webhook/tania-v4`. En esa misma edición, verificar que el body ya incluye `"flujo": "bienvenida"` (Paso 4b).
2. **IG outbound/orgánico** (resto de flujos ManyChat que postean al webhook de IG): misma edición de URL.
3. **WA**: en el panel de YCloud, reapuntar el webhook endpoint `.../webhook/taniawhatsapp` → `.../webhook/tania-v4` (o editar la URL del endpoint existente).

**Rollback** = deshacer el reapunte (volver a poner la URL v3). Los workflows v3 se dejan **activos pero sin tráfico** durante las 2 semanas de transición; pasado ese periodo, desactivarlos (no borrarlos).

Al cortar WA, desactivar también el workflow `seguimiento_tania` viejo (el v4 de seguimiento ya cubre ambos canales y no borra leads).

### Paso 8 — Espejo GHL durante la transición (mapper de stages)

Durante ~2 semanas el espejo a GHL sigue escribiendo los **valores viejos** del custom field, para no romper vistas/automations de GHL. El mapper vive en el nodo `parse` (const `GHL_STAGE_MAP`) del workflow principal:

| stage_v4 (nuevo) | pipeline_stage viejo (custom field GHL) |
|---|---|
| conexion, descubrimiento | descubrimiento |
| cualificacion, puente | cualificacion |
| llamada_ofrecida | llamada_ofrecida |
| link_enviado | link_enviado |
| agendado, realizada | agendado |
| derivado_medico, en_espera_hito, dormido | descubrimiento |
| perdido | perdido |
| cliente_activo, handoff_humano | agendado |

Cuando GHL esté listo para los valores nuevos (ver checklist), sustituir `GHL_STAGE_MAP` por el mapa identidad (cada stage v4 a sí mismo) en el nodo `parse`.

### Paso 9 — Checklist de GHL

Antes del corte:

- [ ] Crear los **valores nuevos** del custom field de pipeline (id `dxMWq0IfosX5dK6VER8W`) en GHL: `conexion`, `puente`, `realizada`, `derivado_medico`, `en_espera_hito`, `dormido`, `cliente_activo`, `handoff_humano` (los demás ya existen). Crearlos antes aunque el mapper siga activo: así el switch al mapa identidad es solo tocar el nodo `parse`.
- [ ] Crear el/los **workflow(s) nativo(s) de GHL** para booking: trigger *Appointment Created / Cancelled / No Show* → acción *Custom Webhook* POST a `https://ddwebhook.fyzon.es/webhook/tania-v4-booking` con body `{ "contact_id": "{{contact.id}}", "start_time": "{{appointment.start_time}}", "tipo": "booked" }` (y `cancelled` / `no_show` en sus triggers).
- [ ] Verificar que el calendario enlazado en el prompt (0.1) es el mismo que dispara esos workflows.
- [ ] Tras el corte + 2 semanas: cambiar `GHL_STAGE_MAP` a identidad y actualizar las vistas de GHL que filtren por los valores viejos.

### Pendientes conocidos (no bloquean la importación)

- **Plantilla WA de seguimiento**: la rama "fuera de ventana de 24h" del seguimiento necesita una plantilla aprobada en Meta (vía YCloud). Hasta entonces esa rama falla de forma controlada y **no** consume cupo de followups. Sustituir `PLANTILLA_SEGUIMIENTO_TANIA` por el nombre real al aprobarla.
- **Notificación de handoff**: el nodo `notificar a Tania (CONFIGURAR)` del principal está desactivado con URL placeholder. Decidir destino (plantilla WA al móvil de Tania, email, Slack) y activarlo.
- **Audio/imagen**: el v4 no transcribe (llegan como `[audio recibido]`). La rama Whisper del v3 se puede portar delante del nodo `normalizar` en una iteración posterior.
- **Número emisor WA**: los envíos usan `from = +34912649668` (observado en los webhooks vivos). Confirmar con Tania antes del corte.
