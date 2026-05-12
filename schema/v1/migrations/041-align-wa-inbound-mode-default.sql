-- 041-align-wa-inbound-mode-default.sql
-- Sprint Iota.3 (Iván 2026-05-12) — alinear default WA con doctrina unificada
-- classified_only ya vigente para GHL inbound (migration 039).
--
-- Doctrina: cualquier inbound de un lead sin source clasificada (bienvenida,
-- lm, inbound, manual) NO dispara IA hasta intervención humana o keyword.
-- Tras un GDPR delete, si el mismo contacto vuelve a escribir, la conv nueva
-- no tendrá source → IA pausada por default.
--
-- Cambios:
--   - default: 'all' → 'form_only' (más restrictivo, alineado classified_only).
--   - backfill: tenants con valor 'all' pasan a 'form_only'.
--   - 'keyword' (modo intermedio) NO se toca: tenants ya en 'keyword' siguen ahí.
--
-- Tenant que necesite seguir abierto a TODOS los inbounds WA debe cambiarlo
-- explícitamente a 'all' vía panel admin tras coordinación (excepción consciente).

ALTER TABLE public.tenant_configs
  ALTER COLUMN wa_inbound_mode SET DEFAULT 'form_only';

UPDATE public.tenant_configs
SET wa_inbound_mode = 'form_only'
WHERE wa_inbound_mode = 'all';

COMMENT ON COLUMN public.tenant_configs.wa_inbound_mode IS
  'Política de apertura WA inbound (YCloud). form_only=solo si lead ya tiene '
  'conv con conversation_source=''bienvenida'' (DEFAULT, alineado classified_only). '
  'keyword=admite primer mensaje matcheando automation_keywords type=''wa_open''. '
  'all=cualquier inbound (legacy, solo escape hatch). Default form_only (Iván 2026-05-12).';
