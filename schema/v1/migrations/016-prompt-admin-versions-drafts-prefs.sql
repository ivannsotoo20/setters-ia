-- Migration 016 — Vista admin para editar Cerebro/Coach/Overrides + prefs trainer (Sprint Alpha, 2026-05-09)
--
-- Añade 3 tablas para soportar el editor de prompts en panel admin:
--   1. prompt_block_versions — histórico de cada cambio de un prompt_blocks row
--      (snapshot pre-edición). Permite restore en 1 click + auditoría.
--   2. prompt_block_drafts — borradores en curso por (block_key, tenant_id, owner_user_id).
--      Autosave del editor mientras Iván redacta, antes de Apply.
--   3. trainer_preferences — preferencias estructuradas por tenant (jsonb) que el
--      trainer toggle/slider en /settings/preferences. Se serializan a markdown
--      en prompt_blocks.block_key='trainer_prefs_v1' al guardar.
--
-- Plan: ~/.claude/plans/admin-edita-cerebro-coach-prefs-2026-05-09.md
-- Decisiones: edit BD + reescribir .md fuente; staging draft→preview→apply;
-- admin overrides solo añaden (no overrides de coach); prefs trainer toggles fijos.

-- ============================================================================
-- 1. prompt_block_versions — histórico de versiones aplicadas
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.prompt_block_versions (
  id BIGSERIAL PRIMARY KEY,
  prompt_block_id BIGINT NOT NULL REFERENCES public.prompt_blocks(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  content TEXT NOT NULL,
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  change_summary TEXT,
  was_applied BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (prompt_block_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_prompt_block_versions_block_changed
  ON public.prompt_block_versions(prompt_block_id, changed_at DESC);

COMMENT ON TABLE public.prompt_block_versions IS
  'Histórico de versiones aplicadas de cada prompt_blocks row. Una fila por cada Apply desde el panel (o desde Claude vía MCP). Permite Restore en 1 click + auditoría de quién cambió qué cuándo.';
COMMENT ON COLUMN public.prompt_block_versions.version_number IS
  'Número incremental por prompt_block_id. La versión actual de prompt_blocks NO está aquí: aquí están las anteriores y la actual snapshot al aplicar.';
COMMENT ON COLUMN public.prompt_block_versions.was_applied IS
  'true = se aplicó (UPDATE prompt_blocks). false = solo guardado como snapshot sin aplicar (caso edge: rollback inmediato).';
COMMENT ON COLUMN public.prompt_block_versions.change_summary IS
  'Resumen humano del cambio (ej: "Suavizo R5 sobre menores"). Opcional pero recomendado.';

-- ============================================================================
-- 2. prompt_block_drafts — borradores en curso
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.prompt_block_drafts (
  id BIGSERIAL PRIMARY KEY,
  block_key TEXT NOT NULL,
  tenant_id INTEGER REFERENCES public.tenants(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  base_version INTEGER NOT NULL,
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (block_key, tenant_id, owner_user_id)
);

CREATE INDEX IF NOT EXISTS idx_prompt_block_drafts_owner
  ON public.prompt_block_drafts(owner_user_id, updated_at DESC);

COMMENT ON TABLE public.prompt_block_drafts IS
  'Borradores en curso del editor admin. Uno por (block_key, tenant_id, owner_user_id). Autosave del editor cada N segundos. Se borra al Apply o al Discard. tenant_id NULL = bloque global del Cerebro.';
COMMENT ON COLUMN public.prompt_block_drafts.base_version IS
  'Última version_number aplicada cuando se inició el draft. Al Apply se compara contra la versión actual de prompt_blocks: si difiere → 409 Conflict (otro usuario aplicó un cambio mientras tanto).';

-- ============================================================================
-- 3. trainer_preferences — preferencias estructuradas del trainer
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.trainer_preferences (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.trainer_preferences IS
  'Preferencias de superficie del trainer (toggles/sliders del UI /settings/preferences). Esquema cerrado validado con Zod en server. Al guardar, se serializan a markdown y se UPSERT en prompt_blocks(block_key=''trainer_prefs_v1'', tenant_id=X, sort_order=110).';
COMMENT ON COLUMN public.trainer_preferences.preferences IS
  'JSONB con toggles tipados. Schema actual (extensible): {double_question_mark:bool, emoji_density:0-3, extra_questions_before_call:0-2, prefer_voice_notes_acknowledgment:bool}.';

-- ============================================================================
-- RLS — coherente con el resto del proyecto (RLS activo, policies abren al
-- usuario dueño + service role bypassea para flujos admin/impersonate).
-- ============================================================================
ALTER TABLE public.prompt_block_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prompt_block_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trainer_preferences ENABLE ROW LEVEL SECURITY;

-- prompt_block_versions: leer si tu profile.is_agency_admin (todos los blocks) o
-- si el bloque pertenece a tu tenant. INSERT/UPDATE solo via service role
-- (server actions admin) — no se exponen policies de write a anon/authenticated.
CREATE POLICY "agency admin reads all versions"
  ON public.prompt_block_versions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.is_agency_admin = true
    )
  );

CREATE POLICY "tenant member reads own tenant versions"
  ON public.prompt_block_versions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.prompt_blocks pb
      JOIN public.profiles p ON p.tenant_id = pb.tenant_id
      WHERE pb.id = prompt_block_id AND p.id = auth.uid()
    )
  );

-- prompt_block_drafts: el dueño del draft puede leer/escribir el suyo.
-- Service role gestiona drafts globales del Cerebro (tenant_id IS NULL) si hay
-- agency admins.
CREATE POLICY "owner reads own draft"
  ON public.prompt_block_drafts FOR SELECT
  USING (owner_user_id = auth.uid());

CREATE POLICY "owner writes own draft"
  ON public.prompt_block_drafts FOR ALL
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

-- trainer_preferences: trainer del tenant lee su prefs; agency admin lee todas.
CREATE POLICY "tenant member reads own prefs"
  ON public.trainer_preferences FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.tenant_id = trainer_preferences.tenant_id OR p.is_agency_admin = true)
    )
  );

CREATE POLICY "tenant member writes own prefs"
  ON public.trainer_preferences FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.tenant_id = trainer_preferences.tenant_id OR p.is_agency_admin = true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.tenant_id = trainer_preferences.tenant_id OR p.is_agency_admin = true)
    )
  );

-- ============================================================================
-- updated_at triggers (estilo del proyecto: trigger que setea updated_at en
-- cualquier UPDATE).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.set_updated_at_now()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prompt_block_drafts_set_updated_at ON public.prompt_block_drafts;
CREATE TRIGGER prompt_block_drafts_set_updated_at
  BEFORE UPDATE ON public.prompt_block_drafts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();

DROP TRIGGER IF EXISTS trainer_preferences_set_updated_at ON public.trainer_preferences;
CREATE TRIGGER trainer_preferences_set_updated_at
  BEFORE UPDATE ON public.trainer_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();
