-- ============================================================================
-- Migration 058: Cerebro v5 shared blocks — desactivar v4 + snapshot v5
-- ============================================================================
-- Contexto (Sprint Iota.1, 2026-05-18):
--
-- El Cerebro del Setter pasa de 11 bloques shared fragmentados (v4) a 2
-- bloques shared consolidados (v5):
--   - core_v5_base       (sort=0)   — todo el cerebro narrativo unificado
--   - output_contract_v5 (sort=100) — schema técnico del output (SEPARADO)
--
-- Esta migration asume que el SEED 008 (schema/v1/seeds/008-core-v5-blocks.sql)
-- YA SE APLICÓ ANTES vía MCP execute_sql. El seed inserta los 2 bloques v5
-- con is_active=TRUE y version=1.
--
-- Esta migration entonces:
--   1. Desactiva los 11 bloques v4 shared (era el cerebro anterior).
--   2. Asegura idempotentemente que los 2 v5 quedan is_active=TRUE.
--   3. Crea snapshot inicial v=1 en prompt_block_versions (idempotente).
--
-- Decisiones de arquitectura:
--   - Big-bang: no hay tenant_configs.prompt_schema_version. v4 queda inactivo
--     definitivamente. Las conversaciones existentes eran de testeo (no producción).
--   - output_contract separado del CORE narrativo (decisión arquitectónica
--     Cerebro v5 — JSON schema técnico no debe mezclarse con voz conversacional).
--
-- Plan vigente:
--   ~/.claude/plans/c-users-sotob-downloads-bloques-1-md-c-iterative-kitten.md
--
-- Idempotente. Rollback: invertir is_active (activar v4, desactivar v5).
-- ============================================================================

BEGIN;

-- 1. Desactivar bloques v4 shared (los 11 que componían el Cerebro v4)
UPDATE public.prompt_blocks
   SET is_active = FALSE,
       updated_at = now()
 WHERE tenant_id IS NULL
   AND block_key IN (
     'core_v4_base',
     'fase_1_v4', 'fase_2_v4', 'fase_3_v4', 'fase_4_v4', 'fase_5_v4', 'fase_6_v4',
     'objeciones_v4', 'descualificacion_v4', 'handoff_v4',
     'output_contract_v4'
   );

-- 2. (Belt & suspenders) Asegurar que los 2 bloques v5 shared están activos.
--    Si el seed 008 no se aplicó, este UPDATE no toca nada y el composer fallará
--    al no encontrar core_v5_base. Verificar con el SELECT al final.
UPDATE public.prompt_blocks
   SET is_active = TRUE,
       updated_at = now()
 WHERE tenant_id IS NULL
   AND block_key IN ('core_v5_base', 'output_contract_v5');

-- 3. Snapshot inicial v=1 en prompt_block_versions (auditoría histórica)
--    ON CONFLICT DO NOTHING: si el seed 008 ya creó snapshot, este no duplica.
INSERT INTO public.prompt_block_versions (
  prompt_block_id, version_number, content, change_summary, was_applied, changed_at
)
SELECT
  pb.id,
  1,
  pb.content,
  'Cerebro v5 — consolidación inicial (Sprint Iota.1)',
  TRUE,
  now()
FROM public.prompt_blocks pb
WHERE pb.tenant_id IS NULL
  AND pb.block_key IN ('core_v5_base', 'output_contract_v5')
  AND pb.is_active = TRUE
ON CONFLICT (prompt_block_id, version_number) DO NOTHING;

COMMIT;

-- ============================================================================
-- Verificación
-- ============================================================================
-- v4 shared: deben estar todos is_active=FALSE
-- v5 shared: deben estar 2 bloques is_active=TRUE (core_v5_base, output_contract_v5)
SELECT
  CASE
    WHEN block_key = 'core_v5_base' OR block_key = 'output_contract_v5' THEN 'v5_shared'
    WHEN block_key LIKE '%_v4' OR block_key = 'core_v4_base' THEN 'v4_shared'
    WHEN block_key = 'coach_v3' THEN 'coach_v3'
    WHEN block_key = 'coach_v5' THEN 'coach_v5'
    WHEN block_key = 'admin_overrides_v1' THEN 'admin_overrides'
    WHEN block_key = 'trainer_prefs_v1' THEN 'trainer_prefs'
    ELSE 'otro'
  END AS bucket,
  is_active,
  COUNT(*) AS num_blocks,
  COALESCE(SUM(LENGTH(content)), 0) AS total_chars
FROM public.prompt_blocks
GROUP BY 1, 2
ORDER BY 1, 2;

-- Snapshots iniciales registrados
SELECT
  pb.block_key,
  pbv.version_number,
  pbv.change_summary,
  pbv.was_applied,
  pbv.changed_at
FROM public.prompt_block_versions pbv
JOIN public.prompt_blocks pb ON pb.id = pbv.prompt_block_id
WHERE pb.tenant_id IS NULL
  AND pb.block_key IN ('core_v5_base', 'output_contract_v5')
ORDER BY pb.block_key, pbv.version_number;
