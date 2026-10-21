-- 082 — Aperturas que no casan con ninguna palabra clave (2026-10-21)
--
-- Cuando la entrenadora, o su automatización de GHL, escribe primero a alguien con
-- un texto que no casa con ninguna palabra clave y no hay conversación previa,
-- `routeGhlOutbound` lo descarta sin guardar nada (Caso C). Hasta hoy solo quedaba
-- una línea en el log del motor, que se pierde en cada deploy. Caso real
-- (tenant 7): desde el 8 oct no entró ninguna bienvenida a seguidores nuevos y no
-- había forma de saber qué texto se estaba usando.
--
-- Una fila por descarte, con el principio del texto (hasta 300 caracteres). El
-- panel las agrupa por texto y las lista en /keywords («Aperturas que no se
-- reconocen») con un botón para darlas de alta como bienvenida.
--
-- Escribe SOLO el motor (service_role, bypassa RLS). El panel lee filtrando por
-- el tenant efectivo. `preview` es texto de la entrenadora, no de la lead.
--
-- Orden de despliegue: antes que el motor que escribe aquí, o a la vez. Si el
-- motor corre sin la tabla, el insert falla, queda en el log y el webhook sigue
-- igual. El panel sin la tabla muestra la lista vacía.
--
-- Rollback: DROP TABLE IF EXISTS public.unmatched_openings;

CREATE TABLE IF NOT EXISTS public.unmatched_openings (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel TEXT,
  ghl_contact_id TEXT,
  preview TEXT NOT NULL,
  seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_unmatched_openings_tenant_seen
  ON public.unmatched_openings (tenant_id, seen_at DESC);

COMMENT ON TABLE public.unmatched_openings IS
  'Mensajes con los que la entrenadora abre una conversación y que no casan con ninguna palabra clave (Caso C de routeGhlOutbound: no se crea la conversación). Lo escribe el motor; el panel lo lista en /keywords para darlos de alta.';
COMMENT ON COLUMN public.unmatched_openings.preview IS
  'Principio del mensaje de la entrenadora (hasta 300 caracteres).';
COMMENT ON COLUMN public.unmatched_openings.seen_at IS
  'Cuándo se escribió el mensaje (dateAdded de GHL; si no viene, la hora de la entrega).';

-- RLS: mismo patrón que 077 (tenant member: su tenant; agency admin: todos;
-- service_role del motor bypassa RLS).
ALTER TABLE public.unmatched_openings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS unmatched_openings_tenant_isolation ON public.unmatched_openings;
CREATE POLICY unmatched_openings_tenant_isolation ON public.unmatched_openings
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

COMMENT ON POLICY unmatched_openings_tenant_isolation ON public.unmatched_openings IS
  'Tenant member: solo su tenant_id. Agency admin: todos. Service_role bypassa RLS.';
