-- 080 — conversation_messages: id del mensaje en el proveedor + antiduplicado en BD (2026-10-20)
--
-- Hasta hoy el antiduplicado de webhooks vivía solo en Redis, con TTL de 60 s.
-- Si Redis cae (17-20 oct, tenant 7) o el proveedor reintenta pasado ese minuto
-- (YCloud reintenta hasta ~5,5 h; GHL hasta +10h54m), cada reintento se guardaba
-- otra vez: 774 filas duplicadas en conversation_messages del tenant 7 durante
-- el incidente, con hasta 20 copias del mismo mensaje.
--
-- Cada mensaje que entra por webhook guarda ahora el id que le da el proveedor,
-- y la base de datos no deja guardarlo dos veces:
--   provider             'ycloud' | 'ghl' | 'manychat' (enum channel_provider)
--   provider_message_id  id del mensaje en YCloud (wamid / id del evento de
--                        mensaje), messageId de GHL, subscriber_id:timestamp de
--                        ManyChat. Si un mismo mensaje del proveedor se guarda en
--                        varias filas (texto + adjuntos de GHL), la fila k>0
--                        lleva el sufijo ':k'.
-- Van los dos o ninguno: las filas de la IA, del panel y el histórico quedan con
-- NULL. Sin backfill: el histórico no guarda el payload del proveedor.
--
-- El índice es UNIQUE completo y no parcial, a propósito. El motor inserta con
-- supabase-js `upsert(..., { onConflict, ignoreDuplicates: true })`, que PostgREST
-- traduce a `ON CONFLICT (cols) DO NOTHING` sin predicado, y Postgres no elige un
-- índice parcial como árbitro si el ON CONFLICT no repite su WHERE (error 42P10).
-- Como los NULL son distintos entre sí (NULLS DISTINCT, el default), las filas
-- sin id nunca chocan: el efecto es el mismo que un parcial
-- `WHERE provider_message_id IS NOT NULL`.
--
-- RLS: la tabla ya tiene RLS + la policy FOR ALL `conversation_messages_tenant_isolation`;
-- añadir columnas no la cambia. Coste: ADD COLUMN sin default es solo metadato;
-- el CREATE UNIQUE INDEX bloquea escrituras mientras se construye (17k filas el
-- 2026-10-20: milisegundos).
--
-- Orden de despliegue: da igual. Si el motor nuevo corre sin esta migración, el
-- insert detecta la columna o el índice ausentes (PGRST204 / 42703 / 42P10),
-- guarda el mensaje sin antiduplicado y lo avisa en el log.
--
-- Rollback:
--   DROP INDEX IF EXISTS public.uniq_msgs_tenant_provider_message;
--   ALTER TABLE public.conversation_messages
--     DROP COLUMN IF EXISTS provider_message_id,
--     DROP COLUMN IF EXISTS provider;

ALTER TABLE public.conversation_messages
  ADD COLUMN IF NOT EXISTS provider public.channel_provider,
  ADD COLUMN IF NOT EXISTS provider_message_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_msgs_tenant_provider_message
  ON public.conversation_messages (tenant_id, provider, provider_message_id);

COMMENT ON COLUMN public.conversation_messages.provider IS
  'Proveedor que entregó el mensaje por webhook (ycloud, ghl, manychat). NULL si no vino de un webhook o el proveedor no da id estable. Va siempre junto a provider_message_id.';

COMMENT ON COLUMN public.conversation_messages.provider_message_id IS
  'Id del mensaje en el proveedor (wamid/id YCloud, messageId GHL, subscriber_id:timestamp ManyChat; sufijo :k para la fila k>0 de un mismo mensaje). Con tenant_id + provider forma el antiduplicado de webhooks (uniq_msgs_tenant_provider_message).';
