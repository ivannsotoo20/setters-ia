-- Migration 071 — RLS: añade OR is_agency_admin a tablas tenant-scoped críticas
--
-- Contexto: el panel del agency admin (Iván) usa cookie `fyzon_impersonate_tenant_id`
-- para cambiar de scope server-side, pero las queries Supabase pasan por RLS que
-- consulta `tenant_id_for_user()` → devuelve siempre el `profile.tenant_id` natural
-- (Fyzon Sandbox = 3), NO el tenant impersonado. Cuando Iván impersona tenant 2
-- (Pablo) y la página `/conversations` ejecuta `.eq('tenant_id', 2)`, la RLS
-- chequea `tenant_id (2) = tenant_id_for_user() (3)` → FALSE → 0 rows.
--
-- Detectado 2026-05-25 tras desbloquear el hang post-Judge de Pablo: el motor
-- procesaba correctamente pero el panel mostraba "0 totales · 0 en vista".
--
-- Patrón ya aplicado en: pipeline_runs, automation_keywords, calendar_accounts,
-- calendar_appointments, tenant_labels, conversation_labels, conversation_notes,
-- pipeline_events, dashboard_widgets, followup_templates, tenant_followup_config,
-- label_automation_rules, notification_events, trainer_preferences,
-- trainer_custom_instructions, tenant_audit_log, pending_invites.
--
-- Faltaban: conversations, leads, conversation_messages, channels,
-- integration_accounts, tenant_tokens, message_schedules.
--
-- Defense in depth: el código del panel SIEMPRE filtra por `tenant_id =
-- effective.tenantId` en las queries; el OR is_agency_admin en RLS es escape
-- válido solo cuando el agency admin necesita atravesar tenants para impersonate.
-- Riesgo de leakage cross-tenant solo si una query olvida el filtro tenant
-- explícito — mismo riesgo que las otras 17+ tablas ya con este patrón.

ALTER POLICY conversations_tenant_isolation ON public.conversations
  USING (
    (tenant_id = public.tenant_id_for_user())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_agency_admin = true)
  );

ALTER POLICY leads_tenant_isolation ON public.leads
  USING (
    (tenant_id = public.tenant_id_for_user())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_agency_admin = true)
  );

ALTER POLICY conversation_messages_tenant_isolation ON public.conversation_messages
  USING (
    (tenant_id = public.tenant_id_for_user())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_agency_admin = true)
  );

ALTER POLICY channels_tenant_isolation ON public.channels
  USING (
    (tenant_id = public.tenant_id_for_user())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_agency_admin = true)
  );

ALTER POLICY integration_accounts_tenant_isolation ON public.integration_accounts
  USING (
    (tenant_id = public.tenant_id_for_user())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_agency_admin = true)
  );

ALTER POLICY tenant_tokens_tenant_isolation ON public.tenant_tokens
  USING (
    (tenant_id = public.tenant_id_for_user())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_agency_admin = true)
  );

ALTER POLICY message_schedules_tenant_isolation ON public.message_schedules
  USING (
    (tenant_id = public.tenant_id_for_user())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_agency_admin = true)
  );
