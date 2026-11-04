-- Migration 088 — RLS: profiles. La sesión de usuario solo edita SU fila y solo las
-- columnas de perfil (full_name, phone, bio, avatar_url). Las columnas de privilegio
-- (is_agency_admin, role, tenant_id, is_active, email, id, invited_*) las escribe
-- únicamente service_role.
--
-- Hallazgo (2026-11-04, leyendo pg_policies e information_schema.column_privileges en
-- producción, al hilo de la migración 086): `profiles` tenía una única policy
--
--   profiles_own_tenant FOR ALL USING (tenant_id = public.tenant_id_for_user())
--
-- sin WITH CHECK, y `authenticated` tenía GRANT UPDATE sobre TODAS las columnas. El
-- panel confía en `profiles.is_agency_admin` (apps/panel/lib/effective-tenant.ts,
-- apps/panel/lib/auth/require-agency-admin.ts) para abrir el impersonate de todos los
-- tenants y /admin/cerebro, y en `profiles.role` para autorizar server actions. Así que
-- cualquier usuario autenticado podía, con la anon key y su JWT:
--
--   PATCH /rest/v1/profiles?id=eq.<su uuid>          {"is_agency_admin": true}
--   PATCH /rest/v1/profiles?id=eq.<uuid de un compañero>  {"role": "owner"} / {"is_active": false}
--
-- Inventario de escrituras a `profiles` (2026-11-04):
--
--   Con la SESIÓN del usuario (anon key + JWT) — las únicas, y siempre sobre la propia fila:
--     apps/panel/lib/actions/profile.ts:99-106   UPDATE full_name, phone, bio   .eq('id', user.id)
--     apps/panel/lib/actions/profile.ts:135-138  UPDATE avatar_url               .eq('id', user.id)
--   Con service_role (bypassrls, no les afecta esta migración):
--     apps/panel/lib/actions/members.ts:233 (full_name/role al invitar), :390 (role), :450 (is_active)
--     apps/panel/lib/actions/admins.ts:185, :231 (is_active de agency admins)
--     apps/panel/lib/actions/invites.ts:451 (INSERT al aceptar invitación)
--     (auth.ts:152 y :220 solo LEEN profiles con service_role para el audit log)
--   Ninguna función SQL ni trigger escribe en profiles (comprobado en pg_proc / pg_trigger;
--   el único trigger es profiles_touch_updated_at y no hay trigger en auth.users).
--   Lecturas con sesión: siempre la propia fila (effective-tenant, require-agency-admin,
--   profile.ts, invites.ts, tenants.ts, auth.ts). La lectura tenant-wide se conserva igual.
--
-- Qué cambia por rol
--   anon               nada: no puede ejecutar tenant_id_for_user() (REVOKE) → 42501 → 401.
--   viewer/admin/owner SELECT de los profiles de su tenant, igual que antes.
--                      UPDATE: solo su propia fila y solo full_name, phone, bio, avatar_url
--                      (antes: cualquier fila del tenant, cualquier columna).
--                      INSERT/DELETE: denegados (antes permitidos dentro del tenant).
--   agency admin       además SELECT de cualquier profile (patrón 071). Escribir, igual que
--                      un miembro: su propia fila, columnas de perfil. Lo demás, service_role.
--   service_role       nada (bypassrls).
--
-- Dos cerrojos independientes:
--   1. RLS: policy UPDATE con USING (id = auth.uid()) y WITH CHECK (id = auth.uid() AND
--      tenant_id = tenant_id_for_user()); RESTRICTIVE para INSERT/DELETE como en la 086.
--   2. Privilegios por columna: REVOKE UPDATE sobre la tabla a anon/authenticated y GRANT
--      UPDATE solo sobre (full_name, phone, bio, avatar_url) a authenticated. Un UPDATE que
--      nombre otra columna falla con 42501 "permission denied for table profiles" antes
--      de llegar a la policy. updated_at NO se concede: lo pone el trigger
--      profiles_touch_updated_at (los triggers no necesitan privilegio de columna).
--   Con cualquiera de los dos cerrojos basta; con los dos, un GRANT futuro por descuido o
--   una policy permisiva nueva no reabren el agujero por sí solos.
--
-- Por qué una función nueva: una policy de `profiles` no puede consultar `profiles`
-- (EXISTS (SELECT 1 FROM profiles ...)) porque PostgreSQL vuelve a aplicar la policy
-- dentro del subquery → "infinite recursion detected in policy for relation profiles".
-- tenant_id_for_user() ya existe por eso mismo. is_agency_admin_for_user() es su gemela:
-- SECURITY DEFINER, STABLE, search_path fijado, EXECUTE revocado a PUBLIC/anon
-- (CLAUDE.md regla 8).
--
-- Sin BEGIN/COMMIT explícitos: apply_migration ya lo envuelve en una transacción.
--
-- Verificación tras aplicar (ver apps/motor-agente/test/security/README.md):
--   node apps/motor-agente/test/security/test-rls-anon-leaks.mjs                       → 0 fail
--   RLS_TEST_USER_JWT=<access_token de un viewer> node apps/motor-agente/test/security/test-rls-anon-leaks.mjs
--     → las sondas "UPDATE profiles ... is_agency_admin / role" deben salir OK (42501 o 0 filas).
--   SELECT has_column_privilege('authenticated','public.profiles','full_name','UPDATE')  → true
--   SELECT has_column_privilege('authenticated','public.profiles','is_agency_admin','UPDATE') → false
--   Humo del panel: /settings/profile → cambiar nombre, bio, teléfono y avatar → guarda.

-- ---------------------------------------------------------------------------
-- 1. Helper sin recursión para "¿el caller es agency admin activo?"
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_agency_admin_for_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    (SELECT p.is_agency_admin AND p.is_active
       FROM public.profiles p
      WHERE p.id = auth.uid()),
    false
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_agency_admin_for_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_agency_admin_for_user() TO authenticated, service_role;

COMMENT ON FUNCTION public.is_agency_admin_for_user() IS
  'Migration 088: true si el usuario autenticado es agency admin activo. SECURITY DEFINER para poder usarse en policies de la propia tabla profiles sin recursión (gemela de tenant_id_for_user()).';

-- ---------------------------------------------------------------------------
-- 2. Policies
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS profiles_own_tenant ON public.profiles;

CREATE POLICY profiles_tenant_read ON public.profiles
  FOR SELECT
  USING (
    tenant_id = public.tenant_id_for_user()
    OR public.is_agency_admin_for_user()
  );

CREATE POLICY profiles_self_update ON public.profiles
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid() AND tenant_id = public.tenant_id_for_user());

CREATE POLICY profiles_no_session_insert ON public.profiles
  AS RESTRICTIVE FOR INSERT WITH CHECK (FALSE);
CREATE POLICY profiles_no_session_delete ON public.profiles
  AS RESTRICTIVE FOR DELETE USING (FALSE);

COMMENT ON POLICY profiles_tenant_read ON public.profiles IS
  'Migration 088: lectura de los profiles del propio tenant para miembros; agency admin lee todos (via is_agency_admin_for_user(), sin recursión).';
COMMENT ON POLICY profiles_self_update ON public.profiles IS
  'Migration 088: la sesión solo actualiza SU fila y no puede moverla de tenant. Qué columnas puede tocar lo fija el GRANT UPDATE por columna (full_name, phone, bio, avatar_url); role, is_agency_admin, tenant_id, is_active, email son solo service_role.';
COMMENT ON POLICY profiles_no_session_insert ON public.profiles IS
  'Migration 088: RESTRICTIVE. Los profiles los crea service_role (invites.ts al aceptar invitación). Ninguna sesión inserta aunque aparezca otra policy permisiva.';

-- ---------------------------------------------------------------------------
-- 3. Privilegios por columna
-- ---------------------------------------------------------------------------
REVOKE UPDATE ON public.profiles FROM anon, authenticated;
GRANT UPDATE (full_name, phone, bio, avatar_url) ON public.profiles TO authenticated;

-- ---------------------------------------------------------------------------
-- Rollback (restaura el estado previo a 088, es decir, reabre el agujero)
-- ---------------------------------------------------------------------------
-- DROP POLICY IF EXISTS profiles_tenant_read        ON public.profiles;
-- DROP POLICY IF EXISTS profiles_self_update        ON public.profiles;
-- DROP POLICY IF EXISTS profiles_no_session_insert  ON public.profiles;
-- DROP POLICY IF EXISTS profiles_no_session_delete  ON public.profiles;
-- CREATE POLICY profiles_own_tenant ON public.profiles
--   FOR ALL USING (tenant_id = public.tenant_id_for_user());
-- REVOKE UPDATE (full_name, phone, bio, avatar_url) ON public.profiles FROM authenticated;
-- GRANT UPDATE ON public.profiles TO anon, authenticated;
-- DROP FUNCTION IF EXISTS public.is_agency_admin_for_user();
