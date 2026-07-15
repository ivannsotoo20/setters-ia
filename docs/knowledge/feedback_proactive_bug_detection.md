---
name: Proactive bug detection during smokes and audits
description: Ivan valora que durante smokes/auditorías levantes activamente bugs colaterales o anomalías que no son la tarea principal pero que aparecen en los datos. Confirmado tras encontrar message_schedules.id=80 failed (conv huérfana sin ghl_contact_id) durante smoke IG el 2026-05-11.
type: feedback
originSessionId: fa96b30c-a172-4fcf-b854-a892618b18d5
---
Cuando estés haciendo smokes E2E, auditorías de BD/logs, o cualquier tarea de verificación: aparte de cumplir el criterio principal, escanea activamente los datos colaterales y reporta anomalías que detectes (rows con `status=failed`, errores recurrentes en logs, gaps de sequence, conv huérfanas, schedules atascados, etc.). Si la anomalía no es la tarea actual y arreglarla aquí desbloquearía scope creep, ábrele una tarea aparte con `spawn_task` y sigue con lo principal.

**Why:** Iván es founder solo + asistente Claude, no tiene equipo QA. Las anomalías que no levante alguien activamente se acumulan y luego pegan en producción real con clientes. Cuando Iván te paga sesión de smoke o auditoría, quiere doble valor: cierras el item + descubres lo que él no sabía. Confirmado explícitamente el 2026-05-11: "Ese tal carlos fue en una prueba anterior... gracias por fijarte quiero que hagas eso más a menudo".

**How to apply:**
- En CUALQUIER smoke E2E (no solo IG, también WA, GHL, ManyChat, etc.): post-verificación principal, hacer 1-2 queries adicionales para escanear el contexto: `message_schedules WHERE status='failed'`, `pipeline_runs WHERE outcome='error'`, `notification_events WHERE status='failed'`, `integration_accounts WHERE last_webhook_at IS NULL AND is_active=true`, etc.
- En auditorías de panel/motor: mirar también logs Vercel + Supabase advisors al pasar.
- Cuando detectes una anomalía: (1) reporta brevemente en el mensaje final con severidad (🔴 crítico / 🟡 sucio / 🟢 doc), (2) si requiere fix independiente, `spawn_task` con título imperativo + prompt self-contained.
- NO desviar la sesión actual para fixear todo. Reportar + spawn task + seguir con lo pedido.
