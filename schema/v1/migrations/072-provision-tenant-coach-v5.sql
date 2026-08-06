-- 072-provision-tenant-coach-v5.sql
--
-- FIX del alta de tenants tras el big-bang Cerebro v5 (Sprint Iota, 2026-05-18).
--
-- PROBLEMA
--   `provision_tenant` (migration 043) seguía insertando un bloque `coach_v3`
--   desde `tenant_templates.coach_v3_empty`. Desde Iota el composer exige
--   `coach_v5`:
--       packages/prompt-composer/src/builder.ts:31
--       REQUIRED_BLOCK_KEYS = ['core_v5_base', 'coach_v5']
--   → cualquier tenant creado desde /admin/tenants/new arrancaba con un bloque
--     que el motor IGNORA, y `composePrompt` lanzaba
--     "missing required blocks: coach_v5" en el PRIMER mensaje del lead.
--     El placeholder dejó de ser un aviso blando y pasó a ser un crash.
--
-- QUÉ HACE
--   1. Añade `tenant_templates.coach_v5_empty` (placeholder con las sub-secciones
--      canónicas v5 + parada explícita para que, si alguien conecta canales antes
--      de pegar el coach real, la conversación termine en handoff en vez de
--      improvisar en nombre del trainer).
--   2. CREATE OR REPLACE de `provision_tenant`: el paso 5 pasa a insertar
--      block_key='coach_v5'. Resto de la función IDÉNTICO a 043.
--
--   NO toca tenants ya existentes. `coach_v3_empty` se conserva (solo deja de
--   usarse) para no romper nada que lo referencie.
--
-- ROLLBACK
--   Re-aplicar el cuerpo de la migration 043 (bloque coach_v3 + coach_v3_empty).

-- ---------------------------------------------------------------------------
-- 1. Plantilla del coach vacío en formato v5
-- ---------------------------------------------------------------------------

INSERT INTO public.tenant_templates (key, content, description)
VALUES (
  'coach_v5_empty',
  E'## coach_identity\n'
  || E'\n'
  || E'Bloque COACH sin configurar. Este tenant todavía no tiene voz, criterios\n'
  || E'ni programa cargados.\n'
  || E'\n'
  || E'## coach_structural_modifications\n'
  || E'\n'
  || E'PARADA OBLIGATORIA. Mientras este bloque siga sin configurar:\n'
  || E'\n'
  || E'- NO inicies la cualificación ni avances de fase.\n'
  || E'- NO hables en nombre del entrenador ni afirmes nada sobre su método,\n'
  || E'  su programa, sus precios o sus resultados.\n'
  || E'- NO inventes enlaces ni propongas videollamada.\n'
  || E'- Responde con un saludo breve y cierra el turno marcando handoff Tipo C.\n'
  || E'\n'
  || E'El agency admin debe pegar el bloque real en /admin/cerebro (block_key\n'
  || E'`coach_v5`) antes de conectar ningún canal.\n',
  'Placeholder coach_v5 para tenants recién provisionados (migration 072). Sustituye a coach_v3_empty.'
)
ON CONFLICT (key) DO UPDATE
  SET content     = EXCLUDED.content,
      description = EXCLUDED.description,
      updated_at  = now();

-- ---------------------------------------------------------------------------
-- 2. provision_tenant → coach_v5
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.provision_tenant(
  p_slug            text,
  p_name            text,
  p_timezone        text DEFAULT 'Europe/Madrid'::text,
  p_created_by      uuid DEFAULT NULL::uuid,
  p_created_by_email text DEFAULT NULL::text,
  p_internal_notes  text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
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

  -- 5. prompt_blocks coach_v5 desde el template.
  --    (Migration 072: era coach_v3 + coach_v3_empty — el composer v5 exige
  --     block_key='coach_v5' o lanza "missing required blocks".)
  SELECT content INTO v_coach_content
  FROM public.tenant_templates
  WHERE key = 'coach_v5_empty';
  IF v_coach_content IS NULL THEN
    RAISE EXCEPTION 'missing_template: tenant_templates.coach_v5_empty no encontrado'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.prompt_blocks (
    tenant_id, block_key, content, sort_order, version, is_active, created_by
  )
  VALUES (
    v_tenant_id, 'coach_v5', v_coach_content, 5, 1, TRUE, p_created_by
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
      'coach_v5_is_placeholder', TRUE
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
$function$;

-- Hardening (regla dura CLAUDE.md §8): SECURITY DEFINER con search_path fijo
-- + EXECUTE revocado a PUBLIC/anon/authenticated. El panel llama vía
-- service_role (getServiceRoleClient), no desde el browser.
REVOKE EXECUTE ON FUNCTION public.provision_tenant(text, text, text, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provision_tenant(text, text, text, uuid, text, text)
  TO service_role;
