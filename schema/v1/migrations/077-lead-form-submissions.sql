-- 077 — Registro de formularios recibidos por lead-form (2026-09-03).
--
-- Hasta hoy la decisión del filtro de cualificación (lead-qualifier.ts) solo
-- quedaba en el log del motor: la entrenadora no podía ver qué formularios
-- habían llegado, a quién se rechazó ni por qué. Esta tabla guarda UNA fila por
-- formulario procesado por POST /automations/lead-form/:tenant_token con el
-- veredicto (aprobado / rechazado / sin_filtro), quién decidió (reglas / ia /
-- ninguno), el motivo, y — si se aprobó — el lead y la conversación creados y
-- si la plantilla de bienvenida llegó a salir. El panel la lista en
-- /leads/formularios.
--
-- Escribe SOLO el motor (service_role, bypassa RLS): INSERT al obtener el
-- veredicto y UPDATE al terminar el envío. El panel lee filtrando por el
-- tenant efectivo. `answers` son las respuestas de la persona (PII): no salen
-- de aquí a ningún log.
--
-- No se registran los reenvíos que el endpoint ya descarta antes de cualificar
-- (dedup Redis 60s y "ya tiene bienvenida activa").

CREATE TABLE IF NOT EXISTS public.lead_form_submissions (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  phone TEXT,
  first_name TEXT,
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  decision TEXT NOT NULL
    CHECK (decision IN ('aprobado', 'rechazado', 'sin_filtro')),
  motivo TEXT,
  evaluado_por TEXT NOT NULL
    CHECK (evaluado_por IN ('reglas', 'ia', 'ninguno')),
  lead_id BIGINT REFERENCES public.leads(id) ON DELETE SET NULL,
  conversation_id BIGINT REFERENCES public.conversations(id) ON DELETE SET NULL,
  welcome_sent BOOLEAN NOT NULL DEFAULT false,
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_lead_form_submissions_tenant_received
  ON public.lead_form_submissions (tenant_id, received_at DESC);

COMMENT ON TABLE public.lead_form_submissions IS
  'Un registro por formulario recibido en POST /automations/lead-form (Tally, GHL Workflow…) con el veredicto del filtro de cualificación (lead-qualifier.ts), quién decidió, el lead/conversación creados si se aprobó y si la bienvenida WA salió. Lo escribe el motor; el panel lo lista en /leads/formularios.';
COMMENT ON COLUMN public.lead_form_submissions.decision IS
  'aprobado | rechazado | sin_filtro (el tenant no tiene filtro activo o el payload no traía respuestas que cualificar).';
COMMENT ON COLUMN public.lead_form_submissions.evaluado_por IS
  'reglas (deterministas: dolor reciente, país) | ia (evaluador con criterios del entrenador) | ninguno.';
COMMENT ON COLUMN public.lead_form_submissions.answers IS
  'Respuestas del formulario aplanadas label → valor. PII de la persona: no loguear.';
COMMENT ON COLUMN public.lead_form_submissions.error IS
  'Si se aprobó pero la bienvenida no salió: causa corta (reason + mensaje).';

-- RLS: mismo patrón que 050/051 (tenant member: su tenant; agency admin: todos;
-- service_role del motor bypassa RLS).
ALTER TABLE public.lead_form_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lead_form_submissions_tenant_isolation ON public.lead_form_submissions;
CREATE POLICY lead_form_submissions_tenant_isolation ON public.lead_form_submissions
  FOR ALL
  USING (
    tenant_id = public.tenant_id_for_user()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_agency_admin = TRUE
    )
  )
  WITH CHECK (
    tenant_id = public.tenant_id_for_user()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_agency_admin = TRUE
    )
  );

COMMENT ON POLICY lead_form_submissions_tenant_isolation ON public.lead_form_submissions IS
  'Tenant member: solo su tenant_id. Agency admin: todos. Service_role bypassa RLS.';
