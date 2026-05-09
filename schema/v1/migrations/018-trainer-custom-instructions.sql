-- Migration 018 — trainer_custom_instructions (Sprint Gamma 2.3 reformulado)
--
-- Cada trainer puede añadir instrucciones individuales para el setter, una por
-- una, editables y borrables independientemente. Reemplaza el approach de
-- textarea grande "customInstructions" del commit c9c23d6 (Gamma 2.2).
--
-- UX: el trainer escribe línea por línea ("usa tono formal con corporativos",
-- "menciona descuento del libro", etc). Cada línea = 1 row. Lista visual con
-- editar/eliminar inline. Las activas se concatenan como bullets en el
-- markdown del bloque trainer_prefs_v1.

CREATE TABLE IF NOT EXISTS public.trainer_custom_instructions (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (length(content) > 0 AND length(content) <= 500),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trainer_custom_instructions_tenant
  ON public.trainer_custom_instructions(tenant_id, is_active, sort_order, id);

COMMENT ON TABLE public.trainer_custom_instructions IS
  'Instrucciones libres del trainer, una por row. El trainer las añade desde /settings/preferences (Card 3). Cada cambio (CRUD o toggle) regenera el markdown del bloque trainer_prefs_v1.';
COMMENT ON COLUMN public.trainer_custom_instructions.content IS
  'Texto de la instrucción (max 500 chars). Sanitizado anti-injection antes de persistir.';
COMMENT ON COLUMN public.trainer_custom_instructions.sort_order IS
  'Orden de aparición en el prompt (más bajo = más arriba). Default 0.';

-- RLS: trainer del tenant + agency admin
ALTER TABLE public.trainer_custom_instructions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant member reads own instructions"
  ON public.trainer_custom_instructions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.tenant_id = trainer_custom_instructions.tenant_id OR p.is_agency_admin = true)
    )
  );

CREATE POLICY "tenant member writes own instructions"
  ON public.trainer_custom_instructions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.tenant_id = trainer_custom_instructions.tenant_id OR p.is_agency_admin = true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (p.tenant_id = trainer_custom_instructions.tenant_id OR p.is_agency_admin = true)
    )
  );

-- Trigger updated_at
DROP TRIGGER IF EXISTS trainer_custom_instructions_set_updated_at
  ON public.trainer_custom_instructions;
CREATE TRIGGER trainer_custom_instructions_set_updated_at
  BEFORE UPDATE ON public.trainer_custom_instructions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_now();
