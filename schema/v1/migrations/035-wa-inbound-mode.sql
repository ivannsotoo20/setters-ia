-- 035-wa-inbound-mode.sql
-- Hito 10 sub-fase 3 — política de apertura de conversación WA inbound (YCloud).
-- 3 modos: 'all' (default backwards-compat), 'form_only', 'keyword'.
-- No aplica a IG/FB (esos van por GHL routing — `routeGhlInbound`/`routeGhlOutbound`).

ALTER TABLE public.tenant_configs
  ADD COLUMN IF NOT EXISTS wa_inbound_mode TEXT
    NOT NULL DEFAULT 'all'
    CHECK (wa_inbound_mode IN ('form_only','all','keyword'));

COMMENT ON COLUMN public.tenant_configs.wa_inbound_mode IS
  'Política de apertura WA inbound (YCloud). all=cualquier mensaje activa IA (default backwards-compat). form_only=solo si lead ya tiene conv con conversation_source=''bienvenida''. keyword=solo si primer mensaje matchea automation_keywords type=''wa_open''. No aplica a IG/FB.';
