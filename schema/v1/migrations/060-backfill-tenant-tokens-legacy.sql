-- ============================================================================
-- Migration 060: backfill de tenant_tokens para tenants legacy
-- ============================================================================
-- Contexto: la RPC provision_tenant_v1 (migration 043) pre-warmea 3 tokens
-- (ycloud_webhook, ghl_webhook, lead_form_webhook) al crear un tenant nuevo
-- desde /admin/tenants/new. Tenants provisionados ANTES de esa migration
-- (p.ej. montefit/Pablo) tienen tokens parciales y faltan algunos.
--
-- Síntoma: el botón "Conectar GHL" del setup redirigía a
-- ${MOTOR}/integrations/oauth/install?tenant_token=<X> con X resuelto on-the-fly
-- en el panel (commit 0b44e57). Pero si el panel en producción aún no había
-- redeployado, el redirect iba SIN token → motor 400 "tenant_token required".
--
-- Este backfill garantiza que TODOS los tenants existentes tengan los 3 tokens
-- activos, sin importar cuándo se provisionaron. Idempotente.
-- ============================================================================

BEGIN;

INSERT INTO public.tenant_tokens (tenant_id, purpose, is_active)
SELECT t.id, p.purpose, TRUE
FROM public.tenants t
CROSS JOIN (VALUES ('ghl_webhook'), ('ycloud_webhook'), ('lead_form_webhook')) AS p(purpose)
WHERE NOT EXISTS (
  SELECT 1 FROM public.tenant_tokens tt
  WHERE tt.tenant_id = t.id
    AND tt.purpose = p.purpose
    AND tt.is_active = TRUE
    AND tt.revoked_at IS NULL
);

COMMIT;

-- Verificación: cada tenant debe tener los 3 tokens activos.
SELECT t.id, t.slug,
       COUNT(*) FILTER (WHERE tt.purpose = 'ghl_webhook' AND tt.is_active AND tt.revoked_at IS NULL) AS ghl,
       COUNT(*) FILTER (WHERE tt.purpose = 'ycloud_webhook' AND tt.is_active AND tt.revoked_at IS NULL) AS ycloud,
       COUNT(*) FILTER (WHERE tt.purpose = 'lead_form_webhook' AND tt.is_active AND tt.revoked_at IS NULL) AS lead_form
FROM public.tenants t
LEFT JOIN public.tenant_tokens tt ON tt.tenant_id = t.id
GROUP BY t.id, t.slug
ORDER BY t.id;
