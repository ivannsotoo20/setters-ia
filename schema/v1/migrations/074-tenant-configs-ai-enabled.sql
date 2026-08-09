-- 074-tenant-configs-ai-enabled.sql
--
-- Interruptor global del setter, por entrenador.
--
-- POR QUÉ
--   Hasta ahora, apagar el bot de un tenant solo se podía haciendo algo brusco:
--   desactivar la integración (y con ella el envío), o pausar conversación a
--   conversación. No había un "para todo" que el propio entrenador pudiera
--   accionar sin llamarnos.
--
--   Migrar a alguien que viene quemado de otra herramienta exige que pueda
--   frenar sin depender de nadie. Que el botón exista importa más por lo que
--   transmite que por las veces que se usa.
--
-- SEMÁNTICA (importante, no es "desconectar")
--   ai_enabled = false NO deja de recibir. Los webhooks se siguen procesando y
--   los mensajes se siguen guardando: la conversación aparece en el panel con
--   todo su historial. Lo único que no ocurre es que el setter responda.
--   Así, al volver a encender, no se ha perdido ningún lead por el camino.
--
-- DÓNDE SE APLICA
--   - `processDebounced` (apps/motor-agente/src/services/process-debounced.ts):
--     no arranca el pipeline. Cubre TODOS los canales, porque todos desembocan
--     ahí a través del debounce.
--   - `outbound-tick` (apps/motor-agente/src/services/outbound-sender.ts): no
--     envía las partes que quedaran programadas de un turno anterior. Sin esto,
--     apagar el interruptor dejaría salir mensajes durante los segundos
--     siguientes y el entrenador vería que "sigue escribiendo".

ALTER TABLE public.tenant_configs
  ADD COLUMN IF NOT EXISTS ai_enabled BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.tenant_configs.ai_enabled IS
  'Interruptor global del setter. FALSE = se sigue recibiendo y guardando todo, pero el setter no responde ni envía nada pendiente. TRUE por defecto (no cambia el comportamiento de los tenants existentes).';
