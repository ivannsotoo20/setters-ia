-- 073-tenant-health-coach-v5.sql
--
-- PROBLEMA
--   `v_tenant_health` seguía comprobando `block_key='coach_v3'` y comparando
--   contra `tenant_templates.coach_v3_empty`. El Sprint Iota (2026-05-18)
--   desactivó todos los coach_v3 (migration 059), así que desde entonces:
--
--     - `has_coach_v3` devolvía FALSE para TODOS los tenants, incluido Pablo,
--       que tiene un coach_v5 de 24k chars en producción.
--     - `coach_v3_is_placeholder` devolvía FALSE siempre → el banner de
--       /admin/tenants/[id] que avisa "este tenant tiene el coach sin
--       configurar, no lances conversaciones" lleva callado desde el 18-may.
--       Justo el aviso que habría saltado hoy al provisionar el tenant 7.
--
-- QUÉ HACE
--   Recrea la vista apuntando a `coach_v5` / `coach_v5_empty` (migration 072) y
--   RENOMBRA las dos columnas a nombres que no mientan:
--       has_coach_v3          → has_coach
--       coach_v3_is_placeholder → coach_is_placeholder
--   Consumidores actualizados en el mismo cambio: apps/panel/lib/tenant-health.ts
--   y apps/panel/app/(app)/admin/tenants/[id]/page.tsx. Hay que regenerar
--   packages/db/src/types.generated.ts (pnpm db:generate-types).
--
-- ⚠️ CUIDADO AL TOCAR ESTA VISTA
--   Expone token_ycloud / token_ghl / token_lead_form / token_manychat y tiene
--   SELECT concedido a `anon` (grant por defecto del schema public en Supabase).
--   Lo único que impide una fuga de tokens es `security_invoker = true`, que
--   hace que la vista respete la RLS de las tablas subyacentes. Recrearla sin
--   ese flag la convertiría en una vista security-definer que salta RLS.
--   VERIFICAR SIEMPRE tras cualquier cambio:
--     SELECT reloptions FROM pg_class WHERE relname = 'v_tenant_health';
--     node apps/motor-agente/test/security/test-rls-anon-leaks.mjs

DROP VIEW IF EXISTS public.v_tenant_health;

CREATE VIEW public.v_tenant_health
WITH (security_invoker = true)
AS
WITH coach_placeholder AS (
  SELECT tenant_templates.content AS placeholder_content
  FROM tenant_templates
  WHERE tenant_templates.key = 'coach_v5_empty'::text
)
SELECT
  id AS tenant_id,
  slug,
  name,
  is_active,
  onboarded_at,
  created_at,
  created_by,
  (EXISTS (SELECT 1 FROM tenant_configs tc WHERE tc.tenant_id = t.id)) AS has_config,
  (EXISTS (SELECT 1 FROM trainer_preferences tp WHERE tp.tenant_id = t.id::integer)) AS has_trainer_prefs,
  (EXISTS (
    SELECT 1 FROM prompt_blocks pb
    WHERE pb.tenant_id = t.id AND pb.block_key = 'coach_v5'::text AND pb.is_active = true
  )) AS has_coach,
  (SELECT (EXISTS (
    SELECT 1 FROM prompt_blocks pb, coach_placeholder cp
    WHERE pb.tenant_id = t.id
      AND pb.block_key = 'coach_v5'::text
      AND pb.is_active = true
      AND pb.content = cp.placeholder_content
  )) AS "exists") AS coach_is_placeholder,
  (SELECT max(tenant_tokens.token) AS max
     FROM tenant_tokens
    WHERE tenant_tokens.tenant_id = t.id AND tenant_tokens.purpose = 'ycloud_webhook'::text
      AND tenant_tokens.is_active = true AND tenant_tokens.revoked_at IS NULL) AS token_ycloud,
  (SELECT max(tenant_tokens.token) AS max
     FROM tenant_tokens
    WHERE tenant_tokens.tenant_id = t.id AND tenant_tokens.purpose = 'ghl_webhook'::text
      AND tenant_tokens.is_active = true AND tenant_tokens.revoked_at IS NULL) AS token_ghl,
  (SELECT max(tenant_tokens.token) AS max
     FROM tenant_tokens
    WHERE tenant_tokens.tenant_id = t.id AND tenant_tokens.purpose = 'lead_form_webhook'::text
      AND tenant_tokens.is_active = true AND tenant_tokens.revoked_at IS NULL) AS token_lead_form,
  (SELECT max(tenant_tokens.token) AS max
     FROM tenant_tokens
    WHERE tenant_tokens.tenant_id = t.id AND tenant_tokens.purpose = 'manychat_webhook'::text
      AND tenant_tokens.is_active = true AND tenant_tokens.revoked_at IS NULL) AS token_manychat,
  (SELECT tc.welcome_template_id FROM tenant_configs tc WHERE tc.tenant_id = t.id) AS welcome_template_id,
  (EXISTS (SELECT 1 FROM integration_accounts ia
            WHERE ia.tenant_id = t.id AND ia.provider = 'ycloud'::channel_provider AND ia.is_active = true)) AS ycloud_connected,
  (EXISTS (SELECT 1 FROM integration_accounts ia
            WHERE ia.tenant_id = t.id AND ia.provider = 'ghl'::channel_provider AND ia.is_active = true)) AS ghl_connected,
  (EXISTS (SELECT 1 FROM automation_keywords ak
            WHERE ak.tenant_id = t.id AND ak.type = 'bienvenida'::text AND ak.is_active = true)) AS has_keywords_bienvenida,
  (EXISTS (SELECT 1 FROM automation_keywords ak
            WHERE ak.tenant_id = t.id AND ak.type = 'lm'::text AND ak.is_active = true)) AS has_keywords_leadmagnet,
  ((SELECT count(*) AS count
      FROM followup_templates ft
     WHERE ft.tenant_id = t.id AND ft.channel_kind = 'whatsapp'::channel_type
       AND ft.status = 'approved'::text
       AND (ft.provider = ANY (ARRAY['ycloud'::text, 'meta_cloud'::text]))))::integer AS approved_wa_templates,
  ((SELECT count(*) AS count
      FROM profiles p
     WHERE p.tenant_id = t.id AND p.is_active = true
       AND COALESCE(p.is_agency_admin, false) = false))::integer AS active_members,
  (EXISTS (SELECT 1 FROM integration_accounts ia
            WHERE ia.tenant_id = t.id AND ia.provider = 'ghl'::channel_provider AND ia.is_active = true))
  AND (EXISTS (SELECT 1 FROM automation_keywords ak
                WHERE ak.tenant_id = t.id AND ak.type = 'bienvenida'::text AND ak.is_active = true))
  AND (EXISTS (SELECT 1 FROM automation_keywords ak
                WHERE ak.tenant_id = t.id AND ak.type = 'lm'::text AND ak.is_active = true))
  AND (EXISTS (SELECT 1 FROM integration_accounts ia
                WHERE ia.tenant_id = t.id AND ia.provider = 'ycloud'::channel_provider AND ia.is_active = true))
  AND (EXISTS (SELECT 1 FROM followup_templates ft
                WHERE ft.tenant_id = t.id AND ft.channel_kind = 'whatsapp'::channel_type
                  AND ft.status = 'approved'::text
                  AND (ft.provider = ANY (ARRAY['ycloud'::text, 'meta_cloud'::text]))))
  AND (EXISTS (SELECT 1 FROM tenant_configs tc
                WHERE tc.tenant_id = t.id AND tc.welcome_template_id IS NOT NULL))
  AND (EXISTS (SELECT 1 FROM tenant_tokens tt
                WHERE tt.tenant_id = t.id AND tt.purpose = 'lead_form_webhook'::text
                  AND tt.is_active = true AND tt.revoked_at IS NULL)) AS is_onboarding_complete
FROM tenants t;

-- Restaurar los grants que tenía la vista antes del DROP.
GRANT SELECT ON public.v_tenant_health TO anon, authenticated, service_role;
