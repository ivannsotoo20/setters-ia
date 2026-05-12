-- 042-tenant-configs-manychat-inbound-mode.sql
-- Sprint Iota.3 (Iván 2026-05-12) — gate IA para inbound ManyChat (IG/FB legacy).
--
-- Hasta ahora `webhook-manychat.ts` no tenía gate análogo a `ghl_inbound_mode`
-- (GHL) o `wa_inbound_mode` (YCloud): cualquier inbound disparaba IA. Doctrina
-- unificada classified_only requiere también gate aquí.
--
-- Default: 'classified_only' (mismo que GHL). Si conv no tiene source clasificada
-- (bienvenida, lm, inbound, manual), `ai_paused_until='infinity'` antes de
-- enqueue debounce → pipeline NO dispara. Trainer interviene manual si quiere.
--
-- Escape hatch: 'all' para tenants legacy de Pablo que dependan de respuesta IA
-- automática a todo inbound. Configurable vía panel admin tras coordinación.

ALTER TABLE public.tenant_configs
  ADD COLUMN IF NOT EXISTS manychat_inbound_mode TEXT
    NOT NULL DEFAULT 'classified_only'
    CHECK (manychat_inbound_mode IN ('classified_only', 'all'));

UPDATE public.tenant_configs
SET manychat_inbound_mode = 'classified_only'
WHERE manychat_inbound_mode IS NULL;

COMMENT ON COLUMN public.tenant_configs.manychat_inbound_mode IS
  'Política de apertura ManyChat inbound (IG/FB legacy). classified_only=IA solo '
  'dispara si conv.conversation_source IS NOT NULL (bienvenida/lm/inbound/manual). '
  'all=cualquier inbound dispara IA (legacy escape hatch). Default classified_only '
  '(Iván 2026-05-12).';
