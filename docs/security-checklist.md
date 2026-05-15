# Security checklist Setters IA

> Última actualización: 2026-05-15 tras audit "verifica-muy-bien-que-ticklish-patterson".

Lista que Iván debe completar antes de exponer el SaaS a clientes reales (más allá de Pablo en staging). Items resueltos por el audit marcados [x]. Pendientes externos marcados [ ].

## Base de datos (Supabase ppujrqxiizgfqclbuxet)

- [x] RLS habilitado en TODAS las tablas con tenant_id (verificado vía supabase advisors security)
- [x] v_tenant_health declarada WITH (security_invoker = true) (migration 052)
- [x] 10 funciones SECURITY DEFINER con search_path = public, pg_temp (migration 053)
- [x] REVOKE EXECUTE FROM PUBLIC/anon/authenticated en funciones SECURITY DEFINER trigger (migration 053)
- [x] Bucket avatars sin policy SELECT amplia (migration 053)
- [x] prompt_block_drafts policy valida tenant_id además de owner (migration 054)
- [x] prompt_block_versions denies INSERT/UPDATE/DELETE desde anon/authenticated (migration 055)
- [ ] **Habilitar Leaked Password Protection** en Supabase Dashboard -> Auth -> Settings (requiere acción manual UI)
- [ ] **Backup CREDENTIALS_ENCRYPTION_KEY** offline en password manager (32 bytes hex). Si se pierde, todas las credenciales encriptadas dejan de descifrarse.

## Motor (apps/motor-agente)

- [x] Bearer tokens comparados con timingSafeEqual en /internal/* endpoints
- [x] CREDENTIALS_ENCRYPTION_KEY validada al boot (assertEncryptionKey)
- [x] CORS origin: false (motor no recibe browser requests legítimos)
- [x] safeLogBody() aplicado a todos los request.log de webhook payloads
- [x] Dedup TTL extendido a 10min en webhook calendar (anti-replay)
- [x] appointment-applier idempotente en pipeline_events (check pre-INSERT)
- [x] URL builder de booking NO incluye PII (phone/firstName) por defecto
- [ ] **PRODUCCIÓN**: GHL_WEBHOOK_VERIFY_MODE=enforce en .env del motor (default warn en dev/staging)
- [ ] **PRODUCCIÓN**: YCLOUD_WEBHOOK_VERIFY_MODE=enforce
- [ ] **PRODUCCIÓN**: LEAD_FORM_VERIFY_MODE=enforce
- [ ] **PRODUCCIÓN**: INTERNAL_STATS_TOKEN 32+ bytes random (verificar openssl rand -hex 32)
- [ ] Verificar que TODOS los tenants activos tienen integration_accounts.webhook_secret poblado ANTES de pasar a enforce

## Panel (apps/panel)

- [x] /api/dev-login gating multi-condición: NODE_ENV='development' + NOT Vercel + NOT Railway + host=localhost + ENABLE_DEV_LOGIN=1 + email whitelist
- [x] AlertDialog en applyDraft de bloques shared (tenant_id IS NULL) con confirmation phrase
- [x] AlertDialog en GDPR export (contact-gdpr-actions.tsx)
- [x] AlertDialog en unlinkCalendar y discardDraft (reemplaza window.confirm)
- [x] Headers seguridad: HSTS, X-Frame-Options DENY, X-Content-Type-Options, Referrer-Policy, Permissions-Policy
- [x] assertHttpsUrl validation en widget_base_url (calendars.ts)
- [x] tenant_audit_log entry en unlinkCalendar
- [ ] **PRODUCCIÓN**: borrar apps/panel/app/api/dev-login/route.ts antes de deploy o setear ENABLE_DEV_LOGIN NUNCA en producción
- [ ] CSP header — pendiente sprint dedicado con report-only mode

## ManyChat (deuda asumida)

- [x] Documentado en docs/manychat-security.md
- [x] Token URL aleatorio (UUID v4)
- [x] Dedup Redis 60s
- [ ] **Roadmap**: migrar tenants a YCloud/GHL para cerrar deuda HMAC (Fase 6 plan maestro)

## Operativa

- [ ] **Logs**: grep logs del último 7 días por accessToken|refreshToken|apiKey|password|webhook_secret -> ningún hit en producción
- [ ] **Rotación**: documentar procedure de rotación para cada token (panel /admin/tenants/[id] tiene UI)
- [ ] **Audit**: tenant_audit_log review mensual: acciones admin sobre tenants (impersonate, override, calendar unlink, integration delete)
- [ ] **2FA / TOTP** para agency_admin — pendiente sprint dedicado
- [ ] **Backup Supabase** verificado: snapshot diario + retención 30 días

## Tests de regresión

- [x] Unit tests: isValidBearer, safeLogBody (vitest)
- [x] E2E script: test-rls-anon-leaks.mjs (15/15 pass empírico)
- [ ] CI: integrar test-rls-anon-leaks.mjs en GitHub Actions tras cada PR que toque migrations o RLS

## Cuando algo va mal

-> Ver docs/security-incidents.md (playbook de respuesta a incidentes).
