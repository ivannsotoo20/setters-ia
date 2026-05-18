-- ============================================================================
-- Migration 059: Cerebro v5 coaches — desactivar coach_v3 + verificar coach_v5
-- ============================================================================
-- Contexto (Sprint Iota.2, 2026-05-18):
--
-- Tras desactivar los 11 bloques v4 shared en migration 058 + cargar el
-- core_v5_base + output_contract_v5 shared, esta migration:
--
--   1. Desactiva todos los coach_v3 existentes (los 2 tenants productivos:
--      'montefit' Pablo + 'ivan-dev' sandbox).
--   2. Verifica idempotentemente que los coach_v5 cargados están is_active=TRUE.
--      Los seeds 009/010/011 cargan los coach_v5 antes de esta migration:
--        - schema/v1/seeds/009-coach-v5-pablo-montenegro.sql  → tenant slug 'montefit'
--        - schema/v1/seeds/010-coach-v5-ivan-dev.sql           → tenant slug 'ivan-dev'
--        - schema/v1/seeds/011-coach-v5-montefit.sql           → tenant slug 'maria-lluc'
--          (solo si el tenant 'maria-lluc' existe; si no, el seed da error y
--          esta migration ignora la fila inexistente vía el join al tenants)
--
-- Decisiones de arquitectura:
--   - Big-bang: coach_v3 queda inactivo definitivamente. No coexistencia.
--   - Si en producción algún tenant nuevo todavía no tiene coach_v5 cargado,
--     el composer fallará (REQUIRED_BLOCK_KEYS = ['core_v5_base', 'coach_v5']).
--   - El admin_overrides_v1 y trainer_prefs_v1 no se tocan.
--
-- Plan vigente:
--   ~/.claude/plans/c-users-sotob-downloads-bloques-1-md-c-iterative-kitten.md
--
-- Idempotente. Rollback: invertir is_active (activar coach_v3, desactivar coach_v5).
-- ============================================================================

BEGIN;

-- 1. Desactivar todos los coach_v3 (cualquier tenant)
UPDATE public.prompt_blocks
   SET is_active = FALSE,
       updated_at = now()
 WHERE block_key = 'coach_v3'
   AND is_active = TRUE;

-- 2. (Belt & suspenders) Asegurar que los coach_v5 cargados están activos.
--    Si el seed correspondiente no se aplicó, este UPDATE no toca nada y el
--    composer fallará al no encontrar coach_v5 para ese tenant.
UPDATE public.prompt_blocks
   SET is_active = TRUE,
       updated_at = now()
 WHERE block_key = 'coach_v5';

COMMIT;

-- ============================================================================
-- Verificación
-- ============================================================================
-- coach_v3: todos is_active=FALSE.
-- coach_v5: 1 fila por tenant productivo (montefit + ivan-dev + maria-lluc si existe), is_active=TRUE.
SELECT
  pb.block_key,
  t.slug AS tenant_slug,
  pb.is_active,
  LENGTH(pb.content) AS chars,
  pb.updated_at
FROM public.prompt_blocks pb
JOIN public.tenants t ON t.id = pb.tenant_id
WHERE pb.block_key IN ('coach_v3', 'coach_v5')
ORDER BY pb.block_key, t.slug;

-- Snapshots iniciales coach_v5
SELECT
  pb.block_key,
  t.slug AS tenant_slug,
  pbv.version_number,
  pbv.change_summary,
  pbv.changed_at
FROM public.prompt_block_versions pbv
JOIN public.prompt_blocks pb ON pb.id = pbv.prompt_block_id
JOIN public.tenants t ON t.id = pb.tenant_id
WHERE pb.block_key = 'coach_v5'
ORDER BY t.slug, pbv.version_number;
