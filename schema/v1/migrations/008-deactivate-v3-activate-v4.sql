-- ============================================================================
-- Migration 008: desactivar Core v3 + verificar Cerebro v4 activo
-- ============================================================================
-- Contexto: el seed 007-core-v4-blocks.sql ya cargó los 11 bloques del
-- Cerebro v4 con is_active=TRUE. Esta migration desactiva los bloques v3
-- compartidos para que el composer cargue exclusivamente el v4 a partir
-- de ahora.
--
-- Idempotente. Rollback: invertir los UPDATE (activar v3, desactivar v4).
--
-- Decisiones aplicadas: D43–D52 (plan c-users-sotob-downloads-prompt-ejemplo-quirky-puffin.md).
-- ============================================================================

BEGIN;

-- 1. Desactivar todos los bloques v3 compartidos (tenant_id IS NULL)
UPDATE public.prompt_blocks
   SET is_active = FALSE
 WHERE tenant_id IS NULL
   AND (block_key LIKE '%_v3' OR block_key = 'core_v3_base');

-- 2. (Belt & suspenders) Asegurar que los bloques v4 compartidos están activos
UPDATE public.prompt_blocks
   SET is_active = TRUE
 WHERE tenant_id IS NULL
   AND (block_key LIKE '%_v4' OR block_key = 'core_v4_base');

COMMIT;

-- ============================================================================
-- Verificación
-- ============================================================================
-- v3: deben estar todos is_active=FALSE
-- v4: deben estar todos is_active=TRUE
SELECT
  CASE
    WHEN block_key LIKE '%_v3' OR block_key = 'core_v3_base' THEN 'v3'
    WHEN block_key LIKE '%_v4' OR block_key = 'core_v4_base' THEN 'v4'
    ELSE 'otro'
  END AS version,
  is_active,
  COUNT(*) AS num_blocks
FROM public.prompt_blocks
WHERE tenant_id IS NULL
GROUP BY 1, 2
ORDER BY 1, 2;
