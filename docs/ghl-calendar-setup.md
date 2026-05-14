# Setup Calendarios GHL (Hito 10)

Guía operativa para conectar los calendarios de Go High Level (GHL) del trainer al SaaS Setters IA: el setter manda la URL trackable en F6, el lead reserva, y el SaaS pasa automáticamente la conversación a **F7 · Cita agendada** con trazabilidad por canal de origen.

## Pre-requisitos

- App Marketplace GHL instalada en la sub-cuenta del trainer (OAuth completado).
- OAuth con scopes `calendars.readonly` y `calendars.events.readonly` aprobados. Si el OAuth original no los pidió, el trainer debe **re-autorizar** desde `/settings/integrations` (botón "Reautorizar" cuando se detecta scope insuficiente).
- Al menos un calendario creado en GHL del trainer (`Settings → Calendars`).
- Variables en `.env.local` del motor:
  - `INTERNAL_STATS_TOKEN` (32 bytes hex generado con `openssl rand -hex 32`).
  - `CREDENTIALS_ENCRYPTION_KEY` (32 bytes hex).
- Variables en `.env.local` del panel:
  - `MOTOR_INTERNAL_URL` (URL interna del motor, p.ej. `http://localhost:3001` en dev).
  - `INTERNAL_STATS_TOKEN` (mismo valor que en motor).

## 1. Suscribir el app Marketplace a los eventos de calendar

En el panel del app Marketplace GHL (developer.gohighlevel.com), abrir tu app y entrar a la sección **Webhook events**. Suscribir:

- `AppointmentCreate`
- `AppointmentUpdate`
- `AppointmentDelete`

URL de webhook: la que ya tiene tu app instalada (la misma que recibe `InboundMessage` / `OutboundMessage`). Es `https://<motor-host>/integrations/webhook/oauth` en producción.

Esto es config **manual una vez por app** (no por trainer). Tras hacerlo, todos los tenants que tengan tu app instalada empezarán a enviar los eventos al motor.

## 2. Sincronizar desde el panel del trainer

1. El trainer abre el SaaS → `Configuración → Calendarios` (sidebar).
2. Click en **Sincronizar desde GHL**. El panel llama al motor `/internal/calendars/sync`, que:
   - Refresca el OAuth access_token GHL (auto-refresh si quedan <5min).
   - Crea (idempotente) el custom field `fyzon_lead_uuid` (TEXT, contact) en la location. Cachea el ID en `tenant_configs.ghl_fyzon_uuid_field_id`.
   - Lista los calendars de la location y los devuelve al panel.
3. Aparece un dialog con los calendarios. El trainer pulsa **Vincular** en cada uno que quiera traer al SaaS.

## 3. Designar el calendar default

El trainer marca uno como **default** (botón estrella en la tabla). Ese es el que el setter usa en F6: cuando el `composePrompt` resuelve el placeholder `{{tracked_calendar_url|fallback}}` del bloque `fase_6_v4`, lee el `calendar_accounts` default activo del tenant y construye la URL trackable.

Sin default → el setter cae al `closingResourceUrl` legacy de `trainer_preferences` (URL fija sin tracking).

## 4. Mecanismo de tracking híbrido

La URL trackable que envía el setter al lead en F6 es:

```
https://api.leadconnectorhq.com/widget/booking/<calendarId>?fyzon_lead_uuid=<slug>&phone=<E.164_encoded>&prefill=true&firstName=<first_name>
```

Donde:
- `fyzon_lead_uuid=<slug>` — slug opaco de 16 chars derivado del leadId vía HMAC-SHA256. GHL guarda este valor automáticamente en el custom field `fyzon_lead_uuid` del contacto cuando el lead reserva.
- `phone=<E.164>&prefill=true` — pre-rellena el campo phone del widget. Fallback si el slug se pierde.

Cuando el lead reserva, GHL dispara webhook AppointmentCreate. El motor:

1. Lee `customFields` del payload. Si tiene `fyzon_lead_uuid` → matchea por `leads.tracking_uuid` (confianza 100).
2. Si no, hace `GET /contacts/{contactId}` y lee los custom fields del contacto. Mismo match.
3. Si tampoco, fallback a match por `phone` E.164 (confianza 80).
4. Si nada matchea → booking huérfano (`lead_id=NULL` en `calendar_appointments`). Aparece en `/calendars` con badge "sin asociar".

Tras matchear, el motor:
- UPSERT en `calendar_appointments`.
- UPDATE en `conversations`: `phase_number=7`, `call_scheduled_at`, `is_handoff_to_human=TRUE`, `handoff_cause='A_agenda'`, `ai_paused_until='infinity'`, `last_appointment_id`.
- INSERT en `pipeline_events` con `event_type='phase_change'`, `to_value='F7'`, `source='calendar_webhook'`.

## 5. Vistas del trainer

- **`/calendars`** (sidebar principal): tabs Lista + Calendario. Filtros por estado, calendar, futuro/pasado. Click en una cita abre Sheet con detalle del lead y link a la conversación.
- **`/settings/calendars`**: gestión de qué calendarios están vinculados, designación de default, desvinculación.
- **`/pipeline`**: columna **F7 · Cita agendada** ya existente (Sprint Kappa) — ahora se llena automáticamente.

## 6. Smoke booking (manual, una vez)

1. Crear un lead test desde `/contacts` (manual) o mandar un mensaje real al setter.
2. Avanzar el lead a F6 conversando (o forzar `phase_number=6` vía MCP SQL).
3. Verificar que el siguiente mensaje del setter incluye una URL con `?fyzon_lead_uuid=` y `&phone=`.
4. Abrir la URL en otra pestaña, reservar una cita en GHL.
5. Volver al panel → `/calendars`: la cita aparece con badge verde "UUID" (match por slug).
6. Verificar `/pipeline`: la conversación está en la columna **F7 · Cita agendada**.
7. Verificar en la ficha del lead que `is_handoff_to_human=TRUE`, `handoff_cause='A_agenda'`.

## 7. Troubleshooting

### Booking huérfano (sin asociar)
- Verifica que el custom field `fyzon_lead_uuid` existe en GHL del trainer (Settings → Custom Fields). Si no → vuelve a sincronizar desde `/settings/calendars`.
- Verifica que el setter envió un mensaje en F6 con URL trackable (no el `closingResourceUrl` legacy).
- Si el lead cambió phone al reservar y no usó el link directo → match falla por diseño. Booking huérfano se puede asociar manualmente desde la BD (script).

### La cita no llega al SaaS
- Verifica que el app Marketplace tiene suscritos los eventos `AppointmentCreate/Update/Delete`.
- Verifica `integration_accounts.last_webhook_at` para esa cuenta GHL — si no se actualiza al reservar, no llega el webhook. Revisa logs del motor.
- Verifica `GHL_WEBHOOK_VERIFY_MODE`: si está en `enforce` y la firma falla → 401. Pasa a `warn` para debug.

### Calendar no aparece en sync
- Verifica que el OAuth tiene scopes `calendars.readonly` y `calendars.events.readonly`. Si el OAuth se completó antes del Hito 10, el trainer debe **reautorizar** la app.
- Verifica que el calendar está activo en GHL.

### El setter no usa la URL trackable
- Verifica que existe un `calendar_accounts` con `is_default=TRUE AND is_active=TRUE` para el tenant.
- Verifica que `prompts/source/core-v4/07-fase-6.md` y `prompt_blocks.fase_6_v4` tienen el placeholder `{{tracked_calendar_url|...}}`.
- Verifica que el composer está compilado (`pnpm --filter @fyzon/prompt-composer build`).

## Variables operativas

| Var | Default | Notas |
|---|---|---|
| `GHL_WEBHOOK_VERIFY_MODE` | `warn` | Pasar a `enforce` en producción tras smoke. |
| `INTERNAL_STATS_TOKEN` | (sin default) | Generar `openssl rand -hex 32`. Mismo valor en motor + panel. |
| `MOTOR_INTERNAL_URL` | (sin default) | URL interna del motor desde el panel. |

## Roadmap futuro

- Bidireccional: crear/editar/cancelar citas desde el SaaS (sprint posterior).
- Multi-calendar inteligente: Coach v3 decide qué calendar mandar según contexto.
- Dashboard show-rate / noshow-rate por canal y calendar.
- Recordatorios automáticos WA pre-llamada.
