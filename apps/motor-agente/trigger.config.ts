import { defineConfig } from '@trigger.dev/sdk';

/**
 * Trigger.dev config — SPIKE Hito 12+ (2026-05-19).
 *
 * Objetivo del spike: evaluar si Trigger.dev sustituye los setInterval del
 * cron-scheduler interno (tickOutbound, tickDebounce, tickNotify, ...) con
 * tasks durables, retries nativos y dashboard observabilidad.
 *
 * Alcance del spike: 1 scheduled task (outboundBatchTick) + 1 task individual
 * (sendScheduledMessage). El resto de crons internos sigue intacto.
 *
 * Cómo activarlo:
 *   1. Crear cuenta en https://trigger.dev (free tier OK).
 *   2. Crear proyecto, copiar el `project ref` (formato proj_xxxxx).
 *   3. Pegar el ref en `project` abajo.
 *   4. `npx trigger.dev@latest dev` desde apps/motor-agente.
 *   5. En .env.local: TRIGGER_OUTBOUND_ENABLED=true (desactiva el setInterval
 *      interno para evitar envío duplicado).
 *
 * Cómo desactivarlo: TRIGGER_OUTBOUND_ENABLED=false (default). El motor sigue
 * funcionando con su cron interno como hoy.
 */
export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF ?? 'proj_REPLACE_ME',
  runtime: 'node',
  logLevel: 'info',
  maxDuration: 300,
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1_000,
      maxTimeoutInMs: 30_000,
      factor: 2,
      randomize: true,
    },
  },
  dirs: ['./src/trigger'],
});
