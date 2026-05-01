-- ============================================================
-- Seed 001 — Primer tenant: Fyzon (dev) + profile de Ivan
-- ============================================================
-- PRERREQUISITO: Ivan debe haber creado su cuenta en Supabase Auth
--   Dashboard → Authentication → Users → Add User
--   Email: sotobautistaivan@gmail.com
--   Password: (el que elija Ivan)
--   Auto Confirm User: ON (importante para saltar email verification)
--
-- Este script es IDEMPOTENTE: se puede ejecutar múltiples veces sin romper nada.
-- ============================================================

DO $$
DECLARE
  v_user_id   UUID;
  v_tenant_id BIGINT;
  v_email     TEXT := 'sotobautistaivan@gmail.com';
BEGIN
  -- 1. Buscar el user_id de Ivan en auth.users
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = v_email;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION
      'Usuario con email % no existe en auth.users. Créalo primero en Dashboard → Authentication → Users → Add User (Auto Confirm ON).',
      v_email;
  END IF;

  -- 2. Crear/obtener tenant "Fyzon (dev)"
  INSERT INTO public.tenants (name, slug, is_active, onboarded_at, settings)
  VALUES (
    'Fyzon (dev)',
    'fyzon-dev',
    TRUE,
    NOW(),
    jsonb_build_object(
      'is_internal', true,
      'notes', 'Tenant de desarrollo de Ivan/Fyzon para pruebas del setter IA'
    )
  )
  ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    settings = EXCLUDED.settings,
    updated_at = NOW()
  RETURNING id INTO v_tenant_id;

  -- 3. Crear/actualizar profile vinculando user_id ↔ tenant_id
  INSERT INTO public.profiles (id, tenant_id, email, full_name, role)
  VALUES (v_user_id, v_tenant_id, v_email, 'Ivan Soto', 'owner')
  ON CONFLICT (id) DO UPDATE SET
    tenant_id = EXCLUDED.tenant_id,
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    role = 'owner';

  -- 4. Crear tenant_config con defaults del schema (active_delay=30s, idle=5min, debounce=25s, max=22)
  INSERT INTO public.tenant_configs (tenant_id)
  VALUES (v_tenant_id)
  ON CONFLICT (tenant_id) DO NOTHING;

  -- 5. Log informativo
  RAISE NOTICE E'\n==========================================\nTENANT CREADO CORRECTAMENTE\n==========================================\n  tenant_id:   %\n  tenant name: Fyzon (dev)\n  user_id:     %\n  email:       %\n  role:        owner\n==========================================',
    v_tenant_id, v_user_id, v_email;
END $$;

-- ============================================================
-- Verificación final — debe devolver 1 fila
-- ============================================================
SELECT
  t.id          AS tenant_id,
  t.name        AS tenant_name,
  t.slug        AS tenant_slug,
  t.is_active   AS tenant_active,
  p.id          AS user_id,
  p.email       AS user_email,
  p.full_name   AS user_name,
  p.role        AS user_role,
  tc.active_conversation_delay,
  tc.idle_conversation_delay,
  tc.debounce_window_seconds,
  tc.timezone,
  t.created_at
FROM public.tenants t
JOIN public.profiles p ON p.tenant_id = t.id
LEFT JOIN public.tenant_configs tc ON tc.tenant_id = t.id
WHERE p.email = 'sotobautistaivan@gmail.com';
