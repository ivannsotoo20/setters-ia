# SOP — Volcar y vigilar las citas GHL de un tenant

**Origen:** 2026-09-12. Tania llevaba desde el 24 de agosto con 0 filas en
`calendar_appointments` mientras GHL tenía 12 citas: su cuenta entra por PIT y el webhook
`AppointmentCreate` del app Marketplace nunca le llega. El panel contaba "agendadas" por
enlaces enviados. El primer volcado sacó además un bug del Hito 10.5 (el CHECK de
`match_method` no admitía `ghl_contact_id`) y una cita real reservada por un lead fuera de
zona.

## Trigger

- Alta de un tenant con calendario vinculado (`calendar_accounts`).
- Sospecha de "las citas no llegan": leads que dicen "ya reservé", F7 vacío, o
  `calendar_appointments` sin filas recientes del tenant.
- Cualquier cuenta GHL con `auth_type='pit'` (sin webhook del app, depende del sync).

## Pasos

1. **Cómo entra a GHL.**
   ```sql
   SELECT id, connection_config->>'auth_type' AS auth, is_active
   FROM integration_accounts WHERE tenant_id = <X> AND provider = 'ghl';
   ```
   `pit` → solo el sync periódico trae citas. `oauth` → webhook + sync (los dos son
   idempotentes por `external_appointment_id`).
2. **Calendarios vinculados.**
   ```sql
   SELECT id, external_calendar_id, name, is_default, is_active, channel_kind
   FROM calendar_accounts WHERE tenant_id = <X>;
   ```
   Sin fila activa no hay nada que sondear: vincular desde `/settings/calendars`.
3. **Dry-run desde el worktree** (lee `.env.local`; no escribe nada):
   ```bash
   pnpm --filter @fyzon/motor-agente exec tsx scripts/calendar-sync-once.ts --tenant <X> --dry-run --days-back 30 --days-forward 90
   ```
   Lista citas por calendario con estado, contacto y `dateAdded`. Un 401/403 aquí es el PIT
   sin el scope `calendars/events.readonly`: pedírselo al trainer en GHL → Private
   Integrations. GHL devuelve también las canceladas.
4. **Volcado real, sin emails** (para no inundar al trainer con reservas antiguas):
   ```bash
   pnpm --filter @fyzon/motor-agente exec tsx scripts/calendar-sync-once.ts --tenant <X> --days-back 30 --days-forward 90
   ```
   Leer el resumen: `created`, `updated`, `rematched`, `cancelled`, `unmatched`, `errors`.
   Un `violates check constraint` en `errors` es un valor nuevo de GHL que la tabla no admite:
   migración en `schema/v1/migrations/` (precedente: 079).
5. **Verificar en BD.**
   ```sql
   SELECT ca.external_appointment_id, ca.appointment_status, ca.match_method, ca.booked_at::date,
          ca.start_at, ca.title, c.id AS conv, c.phase_number, c.handoff_cause
   FROM calendar_appointments ca LEFT JOIN conversations c ON c.id = ca.conversation_id
   WHERE ca.tenant_id = <X> ORDER BY ca.start_at;
   ```
   Cada cita casada y viva debe tener su conversación en F7 con `handoff_cause='A_agenda'`.
6. **Las `unmatched`.** Motivos habituales: contacto de Instagram cuyo `ghl_contact_id` no está
   en `conversations` (reserva anterior al alta, o persona que no pasó por el setter), teléfono
   que no casa con ningún lead. El sync las reintenta en cada tick; si son anteriores al alta,
   se dejan y aparecen en el dashboard como "citas sin conversación asociada".
7. **Mirar quién reservó.** Una cita casada con una conversación que no debía llegar al enlace
   (fuera de zona, dolor reciente) es una llamada que el trainer tiene que cancelar a mano:
   avisarle con la fecha y el nombre.
8. **Vigilancia tras el deploy.** El cron corre cada 10 min (`CALENDAR_SYNC_ENABLED`, default
   `true`); en los logs del motor, `calendar-sync completed` con `errors: 0`. Con calendario
   vinculado, **F7 solo lo pone el calendario**: si el modelo decide 7, el motor lo deja en F6
   hasta que la cita aparezca.

## Output esperado

`calendar_appointments` con las citas del rango, conversaciones casadas en F7 + handoff A,
"Citas agendadas" del dashboard con el número real y las huérfanas avisadas aparte.

## Errores que evita

- Contar enlaces enviados como citas (KPI "Agendados" antes del 2026-09-12).
- Un tenant PIT semanas sin una sola cita registrada.
- Dar por hecho que el matcher y el CHECK de la tabla hablan el mismo vocabulario.
- Enviar emails de "cita reservada" por reservas de hace un mes al hacer el volcado.

## Próxima revisión

Cuando GHL sea OAuth/BSP para todos los tenants (Fase 6) o si aparecen rate limits de GHL en
los logs del sync.

## Relacionado

- `docs/ghl-calendar-setup.md` (vinculación y webhook del app Marketplace).
- `apps/motor-agente/src/services/calendar-sync.ts`, `appointment-matcher.ts`,
  `appointment-applier.ts`.
- Memorias: `project_tania_citas_ghl_no_llegan`, `project-tania-ronda-zona-tiempo-citas`.
