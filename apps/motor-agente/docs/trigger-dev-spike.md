# Spike Trigger.dev — evaluación 2026-05-19

Spike para decidir si Trigger.dev sustituye los `setInterval` del cron-scheduler interno (`apps/motor-agente/src/plugins/cron-scheduler.ts`). No es código de producción todavía. Todo está detrás de feature flag y se desactiva borrando `TRIGGER_OUTBOUND_ENABLED`.

## Qué hay en el spike

| Archivo | Propósito |
|---|---|
| `apps/motor-agente/trigger.config.ts` | Config base — runtime node, retries, dirs `./src/trigger`. |
| `apps/motor-agente/src/trigger/outbound-batch-tick.ts` | Scheduled task (`cron: */1 * * * *`) que reemplaza `tickOutbound` cuando el flag está activo. Llama a `sendNextBatch` real. |
| `apps/motor-agente/src/trigger/send-scheduled-message.ts` | Task individual (payload `{ scheduleId }`) — demo del patrón "un schedule, un job". Stub: lee + loggea, NO envía. |
| `apps/motor-agente/src/plugins/cron-scheduler.ts` | Skip de `setInterval(tickOutbound, ...)` cuando `TRIGGER_OUTBOUND_ENABLED=true`. Resto de crons intactos. |
| `apps/motor-agente/src/config/env.ts` | Nuevas vars `TRIGGER_OUTBOUND_ENABLED` (boolean, default `false`) y `TRIGGER_PROJECT_REF`. |

> Nota: el cron de Trigger es `*/1 * * * *` (1 minuto, el mínimo que permite cron syntax). El cron interno actual era cada 5 segundos. Para mensajes de WhatsApp con typing-delays de 30-60s entre partes, 1 min de granularidad max-latency es asumible. Si tras el spike vamos a producción, se evalúa pasar al patrón `send-scheduled-message` con `delay` nativo (sub-segundo).

## Cómo arrancar el dev server

### 1. Crear cuenta y proyecto en Trigger.dev

1. Ir a https://trigger.dev y crear cuenta (free tier, 10k runs/mes).
2. New Project → nombrarlo `setters-ia-motor` (o lo que prefieras).
3. Copiar el `project ref` (formato `proj_xxxxxxxx`) — sale tras crear.

### 2. Configurar env vars locales

Añadir a `.env.local` (raíz del repo):

```env
# Spike Trigger.dev
TRIGGER_OUTBOUND_ENABLED=false      # cambiar a true cuando el dev server esté corriendo
TRIGGER_PROJECT_REF=proj_xxxxxxxx
```

> Si quieres también añadirlas a `.env.example` para que queden en repo, hazlo manualmente — el folder protector bloqueó la edición desde Claude.

### 3. Login + dev server

Desde `apps/motor-agente`:

```bash
pnpm exec trigger.dev login      # auth interactiva por browser
pnpm exec trigger.dev dev        # arranca el worker local conectado al cloud
```

Esto detecta `trigger.config.ts`, registra los 2 tasks (`outbound-batch-tick`, `send-scheduled-message`) y abre el dashboard en el browser. Mantener corriendo.

### 4. Activar el flag

En otra terminal:

```bash
# editar .env.local → TRIGGER_OUTBOUND_ENABLED=true
pnpm --filter @fyzon/motor-agente dev
```

El log del motor al arrancar mostrará:

```
cron-scheduler started { outboundMs: 'managed_by_trigger_dev', ... }
```

A partir de ese momento:
- El cron interno NO ejecuta `tickOutbound` (no envía mensajes).
- Trigger.dev ejecuta `outbound-batch-tick` cada minuto → llama a `sendNextBatch` → envía mensajes pending.
- Los logs de cada run aparecen en https://cloud.trigger.dev → tu proyecto.

### 5. Probar el patrón individual

Desde una server action / script / curl al motor, simular trigger del task individual:

```ts
import { tasks } from '@trigger.dev/sdk';
import type { sendScheduledMessage } from './apps/motor-agente/src/trigger/send-scheduled-message';

await tasks.trigger<typeof sendScheduledMessage>('send-scheduled-message', {
  scheduleId: 12345,
});
```

En el dashboard verás el run con su payload, duration, logs, retries si falla.

## Qué evaluar (criterios de adopción)

| Criterio | Cómo se mide | Pass si... |
|---|---|---|
| **Dev experience** | Tiempo desde `trigger.dev dev` hasta ver primer run en dashboard | < 2 min |
| **Hot reload** | Editar `outbound-batch-tick.ts` → ¿se recarga sin re-deploy? | Sí, instantáneo |
| **Visibilidad de errores** | Forzar un fallo (apagar Supabase) → ¿dashboard muestra stack + retry? | Sí, con retries automáticos |
| **Concurrency** | 2 runs solapados del tick → ¿se respeta single-instance? | Trigger por defecto NO solapa por taskId con `--max-concurrency 1` |
| **Latencia real** | Tiempo desde `scheduled_at` hasta envío real | ≤ 60s (cron 1 min) |
| **Coste estimado** | Runs/mes con tráfico actual de Pablo (1 trainer, ~50 schedules/día) | < 2k runs/mes, dentro de free tier holgado |

## Riesgos identificados

1. **Lock-in moderado**: `schedules.task()` y `task()` son API propia de Trigger. Migrar fuera = reescribir 2 archivos. Aceptable.
2. **Dependencia externa**: si Trigger cae, `outboundBatchTick` no ejecuta. Mensajes quedan pending, NO se pierden (los recoge el siguiente tick cuando vuelva, o el cron interno si bajamos el flag).
3. **Free tier vs pago**: 10k runs/mes. Si escalamos a 10 trainers con 50 schedules/día = 15k/mes → plan pago (~$20/mes). Margen razonable.
4. **Cron 1 min vs setInterval 5s**: latencia máxima de envío sube de 5s a 60s. Aceptable para typing-delay UX (30s base). Si no, refactor a task individual con delay (sub-min).

## Si el spike pasa → siguientes pasos

1. Migrar `tickNotify` → `notify-batch-tick` (mismo patrón).
2. Migrar `tickAutoFollowup` → `auto-followup-cron` (encaja bien, frequency 15min).
3. Refactor `sendNextBatch` → `sendSingleSchedule(id)` y sustituir `send-scheduled-message` stub por la implementación real.
4. En `processDebounced`, tras INSERT de schedules, hacer `tasks.trigger('send-scheduled-message', { scheduleId }, { delay })` por cada uno (con delay = `scheduled_at - now`). Elimina el polling del batch tick.
5. Decidir si `tickDebounce` también migra (más delicado, depende de Redis local).

## Si el spike NO pasa → cómo desinstalar

```bash
# 1. Borrar TRIGGER_OUTBOUND_ENABLED y TRIGGER_PROJECT_REF de .env.local
# 2. Apagar el worker dev
# 3. Borrar archivos del spike
rm apps/motor-agente/trigger.config.ts
rm -rf apps/motor-agente/src/trigger
# 4. Revertir cambios en cron-scheduler.ts (el `if (!env.TRIGGER_OUTBOUND_ENABLED)`)
# 5. Revertir cambios en config/env.ts (las 2 vars nuevas)
# 6. Desinstalar deps
cd apps/motor-agente && pnpm remove @trigger.dev/sdk @trigger.dev/build
```

Reversible en < 5 min, sin pérdida de funcionalidad (el cron interno vuelve solo cuando el flag desaparece).
