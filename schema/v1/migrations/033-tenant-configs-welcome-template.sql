-- Hito 9 — Designación de plantilla bienvenida default por tenant.
--
-- Por qué: el endpoint nuevo POST /automations/lead-form/:tenant_token (sub-fase 3
-- del Hito 9) recibe leads de formularios externos (n8n, GHL automation, Tally,
-- Meta Lead Ads). Cuando llega, debe enviar plantilla WhatsApp YCloud al lead.
-- Necesita saber CUÁL plantilla usar entre las N que el trainer tenga registradas
-- en followup_templates.
--
-- Solución: añadir tenant_configs.welcome_template_id (FK opcional). Si NULL, el
-- endpoint devuelve 409 con error claro. El trainer designa la plantilla desde
-- /settings/followup-templates (sub-fase 5) o vía el wizard onboarding step 4.

BEGIN;

ALTER TABLE public.tenant_configs
  ADD COLUMN IF NOT EXISTS welcome_template_id BIGINT
    REFERENCES public.followup_templates(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.tenant_configs.welcome_template_id IS
  'Plantilla followup designada como bienvenida default. La usa el endpoint /automations/lead-form para enviar la primera plantilla WA al lead que rellena formulario VSL/anuncio Meta. NULL → endpoint devuelve 409.';

COMMIT;
