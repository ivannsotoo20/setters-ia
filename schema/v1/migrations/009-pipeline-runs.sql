-- ============================================================================
-- Migration 009: pipeline_runs (Hardening 1.3 — observabilidad)
-- ============================================================================
-- Una fila por ejecucion de runPipeline (Generator + Judge + Validator + Splitter)
-- en processDebounced. Permite agregar costes, latencias, error rate y outcome
-- distribution por tenant para alimentar /internal/stats.
--
-- correlation_id es generado en processDebounced (no propagado desde el webhook)
-- para mantener este bloque acotado. Anadir correlation_id a conversation_messages
-- y message_schedules queda como deuda explicita.
--
-- Idempotente.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.pipeline_runs (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  conversation_id BIGINT REFERENCES public.conversations(id) ON DELETE SET NULL,
  correlation_id UUID NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  duration_ms INTEGER,
  -- Stage metrics (Generator)
  generator_model TEXT,
  generator_tokens_in INTEGER,
  generator_tokens_out INTEGER,
  generator_cost_usd NUMERIC(10, 6),
  -- Stage metrics (Judge)
  judge_model TEXT,
  judge_tokens_in INTEGER,
  judge_tokens_out INTEGER,
  judge_cost_usd NUMERIC(10, 6),
  judge_decision TEXT, -- 'pass' | 'fix' | 'reject'
  -- Stage metrics (Splitter)
  splitter_model TEXT,
  splitter_tokens_in INTEGER,
  splitter_tokens_out INTEGER,
  splitter_cost_usd NUMERIC(10, 6),
  splitter_parts INTEGER,
  -- Validator
  validator_violations JSONB,
  -- Totales
  total_cost_usd NUMERIC(10, 6),
  total_tokens_in INTEGER,
  total_tokens_out INTEGER,
  -- Outcome
  outcome TEXT NOT NULL DEFAULT 'in_progress', -- 'success' | 'judge_reject' | 'validator_error' | 'pipeline_error' | 'in_progress'
  error_message TEXT,
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_runs_tenant_started
  ON public.pipeline_runs(tenant_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_pipeline_runs_correlation
  ON public.pipeline_runs(correlation_id);

CREATE INDEX IF NOT EXISTS idx_pipeline_runs_outcome
  ON public.pipeline_runs(tenant_id, outcome, started_at DESC);

COMMENT ON TABLE public.pipeline_runs IS
  'One row per runPipeline execution. Aggregations feed /internal/stats endpoint.';
COMMENT ON COLUMN public.pipeline_runs.correlation_id IS
  'UUID generated in processDebounced. Logged via pino for trace correlation.';
COMMENT ON COLUMN public.pipeline_runs.outcome IS
  'in_progress (initial), success (parts scheduled), judge_reject, validator_error, pipeline_error.';

COMMIT;

-- ============================================================================
-- Verificacion
-- ============================================================================
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'pipeline_runs'
ORDER BY ordinal_position;
