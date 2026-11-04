-- Migration 086 — RLS: tenant_configs, prompt_blocks y resources pasan a SOLO LECTURA
-- para la sesión de usuario (anon key + JWT). La escritura queda únicamente en
-- service_role, que es quien escribe hoy desde el panel, el motor y los scripts.
--
-- Hallazgo (2026-11-04, leyendo pg_policies en producción): las tres tablas llevaban
-- desde schema-v1.sql §13.2 una única policy
--
--   FOR ALL USING (tenant_id = public.tenant_id_for_user())
--
-- sin WITH CHECK y sin distinguir rol. Sin WITH CHECK, PostgreSQL aplica la misma
-- expresión USING a INSERT y UPDATE, así que cualquier usuario autenticado del tenant
-- (viewer incluido) podía, con la anon key y su JWT, hacer desde el navegador:
--
--   PATCH /rest/v1/tenant_configs?tenant_id=eq.N
--         {"ai_enabled":false,"lead_qualification":{...},"anthropic_api_key_encrypted":...,
--          "ghl_inbound_mode":"all","wa_inbound_mode":"all"}
--   PATCH /rest/v1/prompt_blocks?tenant_id=eq.N&block_key=eq.coach_v5   {"content":"..."}
--
-- saltándose el control de rol que vive en las server actions (setGhlInboundMode y
-- setAnthropicKey exigen owner o agency admin; el editor /admin/cerebro exige agency
-- admin). Además `authenticated` tiene GRANT UPDATE sobre todas las columnas.
--
-- Inventario de escrituras (2026-11-04). NADA escribe en estas tablas con la sesión del
-- usuario. Todo va por service_role (rolbypassrls = true):
--
--   tenant_configs  panel:   apps/panel/lib/actions/{ai-switch,anthropic-key,ghl-inbound-mode,
--                            wa-inbound-mode,welcome-template}.ts → getServiceRoleClient().
--                   motor:   solo lecturas (service_role).
--                   SQL:     provision_tenant() SECURITY DEFINER, owner postgres (bypassrls).
--   prompt_blocks   panel:   apps/panel/lib/actions/prompts.ts (applyDraft, restoreVersion,
--                            regenerateTrainerPrefsBlock, createAdminOverridesBlock) →
--                            cliente service_role propio del fichero.
--                   scripts: scripts/load-core-v5.mjs, load-coach-v5*.mjs (service_role).
--                   SQL:     provision_tenant() (coach_v5 inicial).
--   resources       nadie: ni panel, ni motor, ni scripts.
--
-- La sesión de usuario solo escribe en `profiles` (apps/panel/lib/actions/profile.ts) y en
-- Storage `avatars` (components/settings/ProfileForm.tsx). Por eso NO hace falta policy de
-- escritura para owner/admin: con dejar solo SELECT, panel y motor siguen igual.
--
-- Qué cambia por rol
--   anon               nada: no puede ejecutar tenant_id_for_user() (REVOKE) → 42501 → 401.
--   viewer/admin/owner SELECT de las filas de su tenant, igual que antes.
--                      INSERT/UPDATE/DELETE: de permitidos a denegados.
--   agency admin       además SELECT de cualquier tenant (patrón 071, impersonate).
--                      Escribir, tampoco: solo via server action con service_role.
--   service_role       nada (bypassrls).
--   bloques compartidos (prompt_blocks.tenant_id IS NULL): lectura solo si is_active via
--                      prompt_blocks_core_read, que NO se toca. Escritura: nadie salvo
--                      service_role (antes tampoco — `NULL = x` nunca es true —, ahora
--                      queda explícito con las RESTRICTIVE).
--
-- Patrón: 071 (OR is_agency_admin en la lectura) + 055 (sin policies de escritura para la
-- sesión; service_role bypassa). Las policies RESTRICTIVE son el cinturón además de los
-- tirantes: aunque mañana alguien cree una PERMISSIVE FOR ALL por error, la restrictiva
-- sigue denegando INSERT/UPDATE/DELETE a todo rol sujeto a RLS. Van por comando a
-- propósito: una RESTRICTIVE FOR ALL USING (false) mataría también el SELECT.
--
-- Sin BEGIN/COMMIT explícitos: apply_migration ya lo envuelve en una transacción
-- (misma convención que 071 y 055). DROP + CREATE son atómicos: no hay ventana sin policy.
--
-- Verificación tras aplicar (ver apps/motor-agente/test/security/README.md):
--   node apps/motor-agente/test/security/test-rls-anon-leaks.mjs                       → 0 fail
--   RLS_TEST_USER_JWT=<access_token de un viewer> node apps/motor-agente/test/security/test-rls-anon-leaks.mjs
--     → las sondas "authenticated write" deben salir OK (42501 o 0 filas).
--   SELECT policyname, cmd, permissive FROM pg_policies
--    WHERE tablename IN ('tenant_configs','prompt_blocks','resources') ORDER BY 1;

-- ---------------------------------------------------------------------------
-- tenant_configs
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS tenant_configs_tenant_isolation ON public.tenant_configs;

CREATE POLICY tenant_configs_tenant_read ON public.tenant_configs
  FOR SELECT
  USING (
    tenant_id = public.tenant_id_for_user()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_agency_admin = TRUE)
  );

CREATE POLICY tenant_configs_no_session_insert ON public.tenant_configs
  AS RESTRICTIVE FOR INSERT WITH CHECK (FALSE);
CREATE POLICY tenant_configs_no_session_update ON public.tenant_configs
  AS RESTRICTIVE FOR UPDATE USING (FALSE);
CREATE POLICY tenant_configs_no_session_delete ON public.tenant_configs
  AS RESTRICTIVE FOR DELETE USING (FALSE);

COMMENT ON POLICY tenant_configs_tenant_read ON public.tenant_configs IS
  'Migration 086: lectura para miembros del tenant y agency admin. Escritura SOLO service_role (server actions / motor). Antes era FOR ALL sin WITH CHECK → cualquier miembro podía UPDATE desde el navegador.';
COMMENT ON POLICY tenant_configs_no_session_update ON public.tenant_configs IS
  'Migration 086: RESTRICTIVE. Ninguna sesión de usuario escribe tenant_configs aunque se añada otra policy permisiva por error. service_role bypassa RLS.';

-- ---------------------------------------------------------------------------
-- prompt_blocks
-- ---------------------------------------------------------------------------
-- prompt_blocks_core_read (tenant_id IS NULL AND is_active) se conserva tal cual:
-- es la única vía de lectura de los bloques compartidos del Cerebro.
DROP POLICY IF EXISTS prompt_blocks_tenant_isolation ON public.prompt_blocks;

CREATE POLICY prompt_blocks_tenant_read ON public.prompt_blocks
  FOR SELECT
  USING (
    tenant_id IS NOT NULL
    AND (
      tenant_id = public.tenant_id_for_user()
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_agency_admin = TRUE)
    )
  );

CREATE POLICY prompt_blocks_no_session_insert ON public.prompt_blocks
  AS RESTRICTIVE FOR INSERT WITH CHECK (FALSE);
CREATE POLICY prompt_blocks_no_session_update ON public.prompt_blocks
  AS RESTRICTIVE FOR UPDATE USING (FALSE);
CREATE POLICY prompt_blocks_no_session_delete ON public.prompt_blocks
  AS RESTRICTIVE FOR DELETE USING (FALSE);

COMMENT ON POLICY prompt_blocks_tenant_read ON public.prompt_blocks IS
  'Migration 086: lectura de los bloques del propio tenant (coach_v5, admin_overrides_v1, trainer_prefs_v1) para miembros y agency admin. Los compartidos (tenant_id IS NULL) solo via prompt_blocks_core_read. Escritura SOLO service_role: /admin/cerebro, /settings/preferences y scripts/load-*.mjs ya escriben así.';
COMMENT ON POLICY prompt_blocks_no_session_update ON public.prompt_blocks IS
  'Migration 086: RESTRICTIVE. Ni el coach del tenant ni los bloques compartidos se editan con sesión de usuario; el versionado en prompt_block_versions solo tiene sentido si todo pasa por las server actions.';

-- ---------------------------------------------------------------------------
-- resources
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS resources_tenant_isolation ON public.resources;

CREATE POLICY resources_tenant_read ON public.resources
  FOR SELECT
  USING (
    tenant_id = public.tenant_id_for_user()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_agency_admin = TRUE)
  );

CREATE POLICY resources_no_session_insert ON public.resources
  AS RESTRICTIVE FOR INSERT WITH CHECK (FALSE);
CREATE POLICY resources_no_session_update ON public.resources
  AS RESTRICTIVE FOR UPDATE USING (FALSE);
CREATE POLICY resources_no_session_delete ON public.resources
  AS RESTRICTIVE FOR DELETE USING (FALSE);

COMMENT ON POLICY resources_tenant_read ON public.resources IS
  'Migration 086: lectura para miembros del tenant y agency admin. Hoy nadie escribe resources; cuando exista la feature, escribirá por server action con service_role.';

-- ---------------------------------------------------------------------------
-- Rollback (restaura el estado previo a 086, es decir, reabre el agujero)
-- ---------------------------------------------------------------------------
-- DROP POLICY IF EXISTS tenant_configs_tenant_read        ON public.tenant_configs;
-- DROP POLICY IF EXISTS tenant_configs_no_session_insert  ON public.tenant_configs;
-- DROP POLICY IF EXISTS tenant_configs_no_session_update  ON public.tenant_configs;
-- DROP POLICY IF EXISTS tenant_configs_no_session_delete  ON public.tenant_configs;
-- CREATE POLICY tenant_configs_tenant_isolation ON public.tenant_configs
--   FOR ALL USING (tenant_id = public.tenant_id_for_user());
--
-- DROP POLICY IF EXISTS prompt_blocks_tenant_read         ON public.prompt_blocks;
-- DROP POLICY IF EXISTS prompt_blocks_no_session_insert   ON public.prompt_blocks;
-- DROP POLICY IF EXISTS prompt_blocks_no_session_update   ON public.prompt_blocks;
-- DROP POLICY IF EXISTS prompt_blocks_no_session_delete   ON public.prompt_blocks;
-- CREATE POLICY prompt_blocks_tenant_isolation ON public.prompt_blocks
--   FOR ALL USING (tenant_id = public.tenant_id_for_user());
-- -- prompt_blocks_core_read no se toca en ningún sentido.
--
-- DROP POLICY IF EXISTS resources_tenant_read             ON public.resources;
-- DROP POLICY IF EXISTS resources_no_session_insert       ON public.resources;
-- DROP POLICY IF EXISTS resources_no_session_update       ON public.resources;
-- DROP POLICY IF EXISTS resources_no_session_delete       ON public.resources;
-- CREATE POLICY resources_tenant_isolation ON public.resources
--   FOR ALL USING (tenant_id = public.tenant_id_for_user());
