-- 087 — Índices de conversations para la lista del panel y las alertas (2026-11-04)
--
-- La lista de /conversations lee `WHERE tenant_id = X ORDER BY updated_at DESC
-- LIMIT 100` (apps/panel/components/conversation-layout/conversation-layout.tsx)
-- y no había ningún índice con `updated_at`: el plan en producción (EXPLAIN
-- ANALYZE, 2026-11-04) era Seq Scan sobre la tabla entera + top-N heapsort.
-- Hoy la tabla tiene 4.506 filas y tarda 3 ms, así que el índice no se nota
-- todavía; se añade porque la consulta corre en cada apertura de chat y en el
-- refresco de 10 s del hilo, y su coste crece con la tabla mientras que con el
-- índice es un Index Scan parcial constante.
--
-- `(tenant_id, state)` ya existe en producción como idx_conversations_tenant_state
-- (schema-v1.sql); se repite con IF NOT EXISTS para dejar el par documentado y
-- que la migración sea idempotente en un entorno que no lo tuviera. Lo usan la
-- RPC dashboard_alerts (migración 085) para las conversaciones vigiladas y el
-- dashboard para las activas del periodo.
--
-- La RPC lee los mensajes por idx_msgs_conversation_sent_at (conversation_id,
-- sent_at), que también existe ya; no hace falta nada nuevo ahí.
--
-- Coste: CREATE INDEX sin CONCURRENTLY (el MCP aplica la migración dentro de una
-- transacción) sobre ~4.500 filas: milisegundos de bloqueo de escritura.
--
-- Rollback:
--   DROP INDEX IF EXISTS public.idx_conversations_tenant_updated_at;

CREATE INDEX IF NOT EXISTS idx_conversations_tenant_updated_at
  ON public.conversations (tenant_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_tenant_state
  ON public.conversations (tenant_id, state);

COMMENT ON INDEX public.idx_conversations_tenant_updated_at IS
  'Lista de /conversations: WHERE tenant_id ORDER BY updated_at DESC LIMIT n (panel, cada apertura y cada refresco del hilo).';
