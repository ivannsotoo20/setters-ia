-- 045-tenant-health-view.sql
-- Vista de salud por tenant: agrega flags clave del estado de onboarding y
-- recursos provisionados. Consumida desde:
--   - apps/panel/lib/tenant-health.ts (server action)
--   - UI /admin/tenants/[id] (tab health o banner warning si coach está placeholder)
--   - scripts/check-tenant-health.mjs (CLI smoke, futuro)
--
-- Diseño: SECURITY INVOKER (default) — RLS ya filtra por is_agency_admin desde el
-- middleware del panel. Para llamadas vía service_role bypassa RLS naturalmente.

CREATE OR REPLACE VIEW public.v_tenant_health AS
WITH coach_placeholder AS (
  SELECT content AS placeholder_content
  FROM public.tenant_templates
  WHERE key = 'coach_v3_empty'
)
SELECT
  t.id                                                                       AS tenant_id,
  t.slug                                                                     AS slug,
  t.name                                                                     AS name,
  t.is_active                                                                AS is_active,
  t.onboarded_at                                                             AS onboarded_at,
  t.created_at                                                               AS created_at,
  t.created_by                                                               AS created_by,

  -- Filas mínimas obligatorias
  (EXISTS (SELECT 1 FROM public.tenant_configs tc WHERE tc.tenant_id = t.id))        AS has_config,
  (EXISTS (SELECT 1 FROM public.trainer_preferences tp WHERE tp.tenant_id = t.id::int)) AS has_trainer_prefs,
  (EXISTS (SELECT 1 FROM public.prompt_blocks pb
            WHERE pb.tenant_id = t.id AND pb.block_key = 'coach_v3' AND pb.is_active = TRUE))
    AS has_coach_v3,

  -- ¿Es el coach todavía el placeholder vacío?
  (SELECT EXISTS (
    SELECT 1 FROM public.prompt_blocks pb, coach_placeholder cp
    WHERE pb.tenant_id = t.id
      AND pb.block_key = 'coach_v3'
      AND pb.is_active = TRUE
      AND pb.content = cp.placeholder_content
  )) AS coach_v3_is_placeholder,

  -- Tokens webhook (pre-warmed por provision_tenant; manychat queda lazy)
  (SELECT MAX(token) FROM public.tenant_tokens
    WHERE tenant_id = t.id AND purpose = 'ycloud_webhook'    AND is_active = TRUE AND revoked_at IS NULL)
    AS token_ycloud,
  (SELECT MAX(token) FROM public.tenant_tokens
    WHERE tenant_id = t.id AND purpose = 'ghl_webhook'       AND is_active = TRUE AND revoked_at IS NULL)
    AS token_ghl,
  (SELECT MAX(token) FROM public.tenant_tokens
    WHERE tenant_id = t.id AND purpose = 'lead_form_webhook' AND is_active = TRUE AND revoked_at IS NULL)
    AS token_lead_form,
  (SELECT MAX(token) FROM public.tenant_tokens
    WHERE tenant_id = t.id AND purpose = 'manychat_webhook'  AND is_active = TRUE AND revoked_at IS NULL)
    AS token_manychat,

  -- welcome template asignada
  (SELECT tc.welcome_template_id FROM public.tenant_configs tc WHERE tc.tenant_id = t.id)
    AS welcome_template_id,

  -- Integraciones (existe integration_account active por provider)
  (EXISTS (SELECT 1 FROM public.integration_accounts ia
             WHERE ia.tenant_id = t.id AND ia.provider = 'ycloud' AND ia.is_active = TRUE))
    AS ycloud_connected,
  (EXISTS (SELECT 1 FROM public.integration_accounts ia
             WHERE ia.tenant_id = t.id AND ia.provider = 'ghl' AND ia.is_active = TRUE))
    AS ghl_connected,

  -- Keywords mínimas (bienvenida + lm)
  (EXISTS (SELECT 1 FROM public.automation_keywords ak
             WHERE ak.tenant_id = t.id AND ak.type = 'bienvenida' AND ak.is_active = TRUE))
    AS has_keywords_bienvenida,
  (EXISTS (SELECT 1 FROM public.automation_keywords ak
             WHERE ak.tenant_id = t.id AND ak.type = 'lm' AND ak.is_active = TRUE))
    AS has_keywords_leadmagnet,

  -- Plantillas WA aprobadas
  (SELECT COUNT(*) FROM public.followup_templates ft
     WHERE ft.tenant_id = t.id
       AND ft.channel_kind = 'whatsapp'
       AND ft.status = 'approved'
       AND ft.provider IN ('ycloud','meta_cloud'))::int
    AS approved_wa_templates,

  -- Profiles activos (owner / admin / viewer del tenant — NO incluye agency admins)
  (SELECT COUNT(*) FROM public.profiles p
     WHERE p.tenant_id = t.id AND p.is_active = TRUE AND COALESCE(p.is_agency_admin, FALSE) = FALSE)::int
    AS active_members,

  -- ¿Onboarding completo? Agregado de las 4 condiciones del wizard.
  (
    EXISTS (SELECT 1 FROM public.integration_accounts ia
              WHERE ia.tenant_id = t.id AND ia.provider = 'ghl' AND ia.is_active = TRUE)
    AND EXISTS (SELECT 1 FROM public.automation_keywords ak
                  WHERE ak.tenant_id = t.id AND ak.type = 'bienvenida' AND ak.is_active = TRUE)
    AND EXISTS (SELECT 1 FROM public.automation_keywords ak
                  WHERE ak.tenant_id = t.id AND ak.type = 'lm' AND ak.is_active = TRUE)
    AND EXISTS (SELECT 1 FROM public.integration_accounts ia
                  WHERE ia.tenant_id = t.id AND ia.provider = 'ycloud' AND ia.is_active = TRUE)
    AND EXISTS (SELECT 1 FROM public.followup_templates ft
                  WHERE ft.tenant_id = t.id
                    AND ft.channel_kind = 'whatsapp'
                    AND ft.status = 'approved'
                    AND ft.provider IN ('ycloud','meta_cloud'))
    AND EXISTS (SELECT 1 FROM public.tenant_configs tc
                  WHERE tc.tenant_id = t.id AND tc.welcome_template_id IS NOT NULL)
    AND EXISTS (SELECT 1 FROM public.tenant_tokens tt
                  WHERE tt.tenant_id = t.id AND tt.purpose = 'lead_form_webhook'
                    AND tt.is_active = TRUE AND tt.revoked_at IS NULL)
  )
    AS is_onboarding_complete
FROM public.tenants t;

COMMENT ON VIEW public.v_tenant_health IS
  'Salud y completitud del onboarding por tenant. Lo consume tenant-health.ts en el panel.';

GRANT SELECT ON public.v_tenant_health TO authenticated;
GRANT SELECT ON public.v_tenant_health TO service_role;
