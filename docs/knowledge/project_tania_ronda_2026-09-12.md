# Tania (tenant 7) — ronda del 2026-09-12: zona por prefijo, tiempo del dolor, citas reales, inbound

Cuatro quejas de Tania/Iván sobre el setter en producción, con diagnóstico medido en su
BD y la solución aplicada. Todo lo de código vive en el commit de esa fecha; aquí queda
el porqué y lo que se decidió.

## 1. Llevó a videollamada a una persona con 15 días de dolor (conv 11705, Instagram)

**Qué pasó.** La lead dijo "15 días", el setter hizo la validación del bloque ("esto es
algo reciente o ya lo habías tenido antes?"), ella contestó "yo pienso que fue que me
resbalé" y el setter, en vez de cerrar, preguntó "antes de esa caída habías tenido
molestias alguna vez, aunque fuera leve?". Un "Si" de una palabra a esa pregunta se leyó
como "brote de algo previo". Ocho turnos después, con un dolor que "va a mejor gracias a
Dios", estaba en la propuesta de videollamada. El bloque tenía la regla pero también
"ante la duda, el sesgo es CUALIFICAR" y no decía qué cuenta como antecedente.

**Qué se cambió (coach_v5 v22, snapshot en `prompt_block_versions`).**
- TIEMPO: la validación es UNA y abierta; cuenta como antecedente un episodio anterior
  descrito con sustancia; un "sí" a secas, y menos a una pregunta que lleva la respuesta
  dentro, no cuenta; caída/resbalón/mal gesto reciente sin episodio anterior = dolor agudo
  → cierre 1 en ese turno, con más razón si va a mejor. Con el ❌→✅ de la conversación real.
- "Quiere cambiarlo" (una de las tres cosas de F2 antes de proponer) se verbaliza con sus
  palabras; un "sí" a "¿quieres seguir cuidándolo?" es cortesía.
- F3: si va a mejor y no ha buscado nada, no hay disposición que confirmar.
- El sesgo a cualificar queda para columna y detalles; sobre el tiempo, la duda se
  resuelve con la única validación y sin episodio descrito no se cualifica.

## 2. Sigue llevando a personas de El Salvador, Guatemala, Venezuela… (zona)

**Qué pasó.** Dos fugas medidas: por WhatsApp, un +502 (Guatemala) llegó a F6 y recibió el
enlace (conv 11660) — y reservó de verdad para el 14-09 (cita `dp2PdZLpbjiP03kDTk3p`,
"Oscar Leonel Escobar Solares"): **Tania tiene que cancelarla a mano**. Por Instagram,
"Colombia" a secas (conv 10792) y "ak dónde yo vivo en Venezuela" (conv 10260) llegaron
al enlace. La regla vivía solo en el coach, como criterio reactivo, y el modelo no la
aplicaba.

**Decisión de Iván:** "con el simple hecho de ver el prefijo ya tiene que ser más que
suficiente; o si lo dice en la conversación en caso de que no lo sepas".

**Qué se construyó.**
- `apps/motor-agente/src/lib/phone-country.ts` (prefijo → país) y `zone-policy.ts`
  (política por tenant en `tenant_configs.lead_qualification.no_contact_countries`,
  ISO-2, + los `country_reject_terms` que ya usaba el formulario). Veredictos:
  `reject_by_prefix`, `in_zone_by_prefix`, `mention` (término de la lista escrito por la
  persona), `clear`.
- La directiva runtime (`lead-origin.ts`, sección "Zona geográfica") lo declara al setter
  como HECHO; el cierre sigue siendo del coach (literal 8, sin país ni motivo).
- **V20** (`shared-validator`): con `zoneRejected` ningún turno puede llevar una URL; el
  orquestador reintenta una vez pidiendo el cierre y si vuelve con enlace tumba el turno.
- El motor deja la fase en ≤F4 si el modelo propone a alguien rechazado por prefijo.
- Coach v22: el teléfono decide solo (excepción: si ella dice residir fuera de la lista,
  handoff B para que lo confirme Tania); en el chat, una pista obliga a UNA pregunta de
  residencia antes de proponer; sin pista y sin teléfono, normalidad.
- Config cargada para el tenant 7: VE, CU, DO, CO, BO, EC, GT, SV, AR.

## 3. "Las llamadas agendadas siguen siendo los enlaces enviados"

**Qué pasó.** El KPI "Agendados" contaba F6/F7 (`phase_change`), y F7 lo ponía el modelo
cuando la persona decía "ya reservé". Tania entra a GHL por PIT, así que el webhook
`AppointmentCreate` del app Marketplace nunca le llega: 0 filas en `calendar_appointments`
en toda su historia mientras GHL tenía 12 citas en el último mes.

**Qué se construyó.**
- `apps/motor-agente/src/services/calendar-sync.ts` + tick cada 10 min en el cron del
  motor (`CALENDAR_SYNC_ENABLED`, default on): lista las citas de cada calendario vinculado
  con el cliente GHL del tenant (PIT → OAuth), aplica las nuevas como `AppointmentCreate`
  (F7 + handoff A + email a la entrenadora), los cambios de estado como `Update` y las
  desaparecidas como `Delete`. Script de volcado inicial:
  `apps/motor-agente/scripts/calendar-sync-once.ts` (con `--dry-run`).
- Primer volcado de Tania (2026-09-12): 12 citas, 11 guardadas (7 casadas por teléfono,
  4 sin conversación), 3 conversaciones movidas a F7. La 12ª falló por el CHECK de
  `match_method` (no admitía `ghl_contact_id`, bug del Hito 10.5) → migration 079.
- `calendar_appointments.booked_at` (migration 078): cuándo se reservó, para contar por
  periodo.
- Dashboard: "Agendados" se parte en **Enlaces enviados** (F6/F7, el proxy de siempre) y
  **Citas agendadas** (reservas reales del calendario, por conversación; las sin
  conversación se avisan aparte). Widgets `link_sent` y `scheduled`, drill-down incluido.
- F7 solo lo confirma el calendario cuando el tenant tiene uno vinculado: el motor deja
  en F6 la decisión del modelo hasta que la cita aparezca.
- GHL SÍ devuelve las canceladas en `/calendars/events` (el comentario del backfill
  antiguo decía lo contrario); la reconciliación por ausencia se mantiene como red.

## 4. "Se está contabilizando como inbound desde bienvenidas a respuestas a palabras clave"

**Qué pasó.** `conversation_source='inbound'` es el TIPO de la palabra clave, no quién
abrió: el router de GHL lo escribe también cuando la automatización contesta primero
(141 conversaciones de Instagram con el primer mensaje nuestro), y el Caso B pisaba una
bienvenida con 'inbound' cuando la automatización contestaba dentro (18 casos). Encima,
la directiva runtime le decía al setter "te escribió ella, por iniciativa propia" y abría
con la rama equivocada del coach. `direction` sí es fiable (verificado contra el primer
mensaje de las 1.662 conversaciones).

**Qué se cambió.**
- Motor: el origen se deriva de `conversation_source` + `direction` (`welcome`,
  `keyword_outbound`, `inbound`…); el Caso B ya no pisa un origen existente; las 18
  bienvenidas se restauraron a mano.
- Panel: `lib/conversation-origin.ts` es el único sitio que traduce los dos campos a
  "Inbound (escribió ella) / Bienvenida / Palabra clave / Lead magnet / Manual"; el filtro
  de origen de contactos usa esas claves (y acepta los valores viejos en enlaces guardados).

## Pendiente / vigilar

- Cancelar la cita del +502 (14-09 16:00 CEST) — decisión de Tania.
- Las 4 citas sin conversación: 3 de Instagram (contactos sin `ghl_contact_id` en el SaaS,
  o reservas anteriores al alta) y 1 de WhatsApp (Joel García, el teléfono no casa con
  ningún lead). El sync las re-intenta cada tick.
- El deploy (push a main → CI motor + Vercel panel) es lo único que falta para que el
  prefijo, V20, el sync periódico y el dashboard nuevo estén en producción. El coach v22, la
  config de zona, las citas volcadas y la reparación de las 18 bienvenidas ya están.
