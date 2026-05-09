-- Migration 017 — Fix UNIQUE constraint en prompt_block_drafts para manejar NULL.
--
-- Bug original (migration 016): el constraint UNIQUE (block_key, tenant_id, owner_user_id)
-- en Postgres trata NULL como "no igual a nada", así que dos rows con
-- (core_v4_base, NULL, ivan) NO eran considerados duplicados → cada saveDraft de
-- un bloque global del Cerebro insertaba un row nuevo (en vez de upsert).
--
-- Síntoma: tras varios autosaves, loadActiveBlock con .maybeSingle() fallaba con
--   "JSON object requested, multiple (or no) rows returned"
-- bloqueando completamente la edición del Cerebro. (Bloques scoped a tenant
-- estaban OK porque tenant_id era no-null y el UNIQUE funcionaba bien.)
--
-- Fix: drop el UNIQUE constraint y reemplazar por UNIQUE INDEX que usa COALESCE
-- para tratar NULL como -1 (sentinel que nunca colisiona con tenant_id real,
-- porque tenants.id es BIGSERIAL > 0).
--
-- Side effect en código: PostgREST upsert con onConflict apunta a constraint
-- name (no a index), así que el upsert deja de funcionar. El refactor en
-- apps/panel/lib/actions/prompts.ts:saveDraft hace SELECT→UPDATE/INSERT manual,
-- robusto independientemente del constraint subyacente.

ALTER TABLE public.prompt_block_drafts
  DROP CONSTRAINT IF EXISTS prompt_block_drafts_block_key_tenant_id_owner_user_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS prompt_block_drafts_unique
  ON public.prompt_block_drafts
  (block_key, COALESCE(tenant_id, -1), owner_user_id);
