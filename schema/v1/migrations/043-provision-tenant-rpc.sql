-- 043-provision-tenant-rpc.sql
-- Infraestructura para creación atómica de sub-cuentas desde admin (/admin/tenants/new).
--
-- Componentes:
--   1. ALTER tenants: añade created_by, created_by_email, CHECK slug.
--   2. CREATE tenant_templates: tabla canónica para plantillas reusables (coach_v3 inicial vacío).
--   3. CREATE FUNCTION provision_tenant: transacción Postgres atómica que crea todo lo mínimo
--      para que un tenant nuevo funcione (tenant + configs + trainer_preferences + coach_v3 +
--      3 tenant_tokens + audit log). Los triggers seed_*_on_new_tenant existentes auto-crean
--      labels, dashboard_widgets y tenant_followup_config en cascada.
--   4. REVOKE EXECUTE FROM PUBLIC; GRANT EXECUTE TO service_role.

-- ============================================================
-- 1. tenants: created_by + CHECK slug
-- ============================================================
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by_email TEXT;

ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS chk_tenants_slug_format;
ALTER TABLE public.tenants
  ADD CONSTRAINT chk_tenants_slug_format
  CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$');

-- ============================================================
-- 2. tenant_templates: plantillas reusables (coach_v3 inicial)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tenant_templates (
  key         TEXT PRIMARY KEY,
  content     TEXT NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.tenant_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_templates_read_all" ON public.tenant_templates;
CREATE POLICY "tenant_templates_read_all" ON public.tenant_templates
  FOR SELECT USING (TRUE);

-- Seed placeholder vacío. Iván pega el coach personalizado después.
INSERT INTO public.tenant_templates (key, content, description)
VALUES (
  'coach_v3_empty',
  E'## Coach pendiente de configurar\n\nEste bloque está vacío. Iván lo pegará desde `/admin/tenants/[id]` cuando termine la auditoría con el trainer.\n\n**No lances conversaciones hasta que este bloque esté completo.**\n',
  'Placeholder mínimo para coach_v3 al crear un tenant nuevo desde admin.'
)
ON CONFLICT (key) DO UPDATE
  SET content = EXCLUDED.content,
      description = EXCLUDED.description,
      updated_at = NOW();

-- ============================================================
-- 3. provision_tenant function
-- ============================================================
CREATE OR REPLACE FUNCTION public.provision_tenant(
  p_slug             TEXT,
  p_name             TEXT,
  p_timezone         TEXT DEFAULT 'Europe/Madrid',
  p_created_by       UUID DEFAULT NULL,
  p_created_by_email TEXT DEFAULT NULL,
  p_internal_notes   TEXT DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_tenant_id     BIGINT;
  v_coach_content TEXT;
  v_coach_id      BIGINT;
  v_tokens        jsonb := '{}'::jsonb;
  v_token_row     RECORD;
  v_settings      jsonb;
  v_reserved      TEXT[] := ARRAY[
    'admin','api','app','panel','fyzon','www','dashboard',
    'login','accept-invite','auth','signup','onboarding',
    'conversations','contacts','pipeline','settings','keywords',
    'labels','webhook','webhooks','health','public','static',
    'motor','setter','setters','vercel'
  ];
BEGIN
  -- 1. Validaciones de input.
  IF p_slug IS NULL OR p_slug !~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$' THEN
    RAISE EXCEPTION 'invalid_slug_format: slug debe ser kebab-case 3-40 chars sin tildes ni espacios'
      USING ERRCODE = '22023';
  END IF;
  IF p_slug = ANY(v_reserved) THEN
    RAISE EXCEPTION 'reserved_slug: slug pertenece a la lista reservada'
      USING ERRCODE = '22023';
  END IF;
  IF p_name IS NULL OR length(trim(p_name)) < 2 THEN
    RAISE EXCEPTION 'invalid_name: nombre del tenant debe tener al menos 2 caracteres'
      USING ERRCODE = '22023';
  END IF;
  IF length(trim(p_name)) > 80 THEN
    RAISE EXCEPTION 'invalid_name: nombre del tenant no debe exceder 80 caracteres'
      USING ERRCODE = '22023';
  END IF;
  IF p_timezone IS NULL OR length(p_timezone) = 0 THEN
    p_timezone := 'Europe/Madrid';
  END IF;

  -- 2. INSERT tenants. Triggers existentes (024 seed_system_labels,
  --    026 seed_dashboard_widgets, 028 seed_followup_config) corren en cascada.
  v_settings := jsonb_build_object('created_via', 'admin_form');
  IF p_internal_notes IS NOT NULL AND length(trim(p_internal_notes)) > 0 THEN
    v_settings := v_settings || jsonb_build_object(
      'internal_notes', trim(p_internal_notes)
    );
  END IF;

  INSERT INTO public.tenants (
    name, slug, is_active, created_by, created_by_email, settings
  )
  VALUES (
    trim(p_name), p_slug, TRUE, p_created_by, p_created_by_email, v_settings
  )
  RETURNING id INTO v_tenant_id;

  -- 3. tenant_configs (sobreescribimos timezone si se pasó, resto defaults).
  INSERT INTO public.tenant_configs (tenant_id, timezone)
  VALUES (v_tenant_id, p_timezone);

  -- 4. trainer_preferences row vacío. tenant_id en esta tabla es INTEGER (legacy),
  --    cast explícito desde el BIGINT del tenant nuevo.
  INSERT INTO public.trainer_preferences (tenant_id, preferences, updated_by)
  VALUES (v_tenant_id::int, '{}'::jsonb, p_created_by);

  -- 5. prompt_blocks coach_v3 desde el template.
  SELECT content INTO v_coach_content
  FROM public.tenant_templates
  WHERE key = 'coach_v3_empty';
  IF v_coach_content IS NULL THEN
    RAISE EXCEPTION 'missing_template: tenant_templates.coach_v3_empty no encontrado'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.prompt_blocks (
    tenant_id, block_key, content, sort_order, version, is_active, created_by
  )
  VALUES (
    v_tenant_id, 'coach_v3', v_coach_content, 5, 1, TRUE, p_created_by
  )
  RETURNING id INTO v_coach_id;

  -- 6. Snapshot inicial v1 en prompt_block_versions (para soportar rollback / historial).
  INSERT INTO public.prompt_block_versions (
    prompt_block_id, version_number, content, change_summary, was_applied, changed_by, changed_at
  )
  VALUES (
    v_coach_id, 1, v_coach_content, 'initial provision (empty placeholder)', TRUE, p_created_by, NOW()
  );

  -- 7. tenant_tokens pre-warmeados (3 webhooks). manychat_webhook queda lazy.
  FOR v_token_row IN
    INSERT INTO public.tenant_tokens (tenant_id, purpose, is_active)
    VALUES
      (v_tenant_id, 'ycloud_webhook',    TRUE),
      (v_tenant_id, 'ghl_webhook',       TRUE),
      (v_tenant_id, 'lead_form_webhook', TRUE)
    RETURNING token, purpose
  LOOP
    v_tokens := v_tokens || jsonb_build_object(v_token_row.purpose, v_token_row.token);
  END LOOP;

  -- 8. Audit log.
  INSERT INTO public.tenant_audit_log (
    tenant_id, actor_user_id, actor_email, action, metadata
  )
  VALUES (
    v_tenant_id,
    p_created_by,
    p_created_by_email,
    'tenant.created',
    jsonb_build_object(
      'slug', p_slug,
      'name', trim(p_name),
      'timezone', p_timezone,
      'source', 'admin_form',
      'coach_v3_is_placeholder', TRUE
    )
  );

  -- 9. Return.
  RETURN jsonb_build_object(
    'tenant_id', v_tenant_id,
    'slug', p_slug,
    'tokens', v_tokens,
    'coach_block_id', v_coach_id
  );
END
$fn$;

-- Lockdown: SOLO service_role puede invocar.
REVOKE EXECUTE ON FUNCTION public.provision_tenant(TEXT, TEXT, TEXT, UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provision_tenant(TEXT, TEXT, TEXT, UUID, TEXT, TEXT) TO service_role;
