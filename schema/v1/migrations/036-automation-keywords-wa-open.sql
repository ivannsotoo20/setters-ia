-- 036-automation-keywords-wa-open.sql
-- Hito 10 sub-fase 3 — extender enum de tipos válidos en automation_keywords
-- para permitir el tipo 'wa_open' usado por el gate WA inbound cuando
-- tenant_configs.wa_inbound_mode='keyword'.
--
-- Tipos previos: bienvenida/lm/inbound (consumidos por routeGhlOutbound).
-- Tipo nuevo: wa_open (consumido por webhook-ycloud cuando wa_inbound_mode='keyword').

ALTER TABLE public.automation_keywords
  DROP CONSTRAINT IF EXISTS automation_keywords_type_check;

ALTER TABLE public.automation_keywords
  ADD CONSTRAINT automation_keywords_type_check
    CHECK (type IN ('bienvenida','lm','inbound','wa_open'));

COMMENT ON CONSTRAINT automation_keywords_type_check ON public.automation_keywords IS
  'Tipos válidos. bienvenida/lm/inbound se usan en routeGhlOutbound (IG/FB). wa_open se usa en webhook-ycloud cuando wa_inbound_mode=keyword.';
