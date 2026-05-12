-- 039-tenant-configs-ghl-inbound-mode.sql
-- Gate de IA para inbound GHL (IG/FB) análogo a `wa_inbound_mode` (migration 035).
--
-- Doctrina (decisión Iván 2026-05-12): la IA SOLO debe responder a conversaciones
-- con origen calificado. Familiares/amigos/random que escriban a la página IG
-- no deben disparar respuesta automática.
--
-- 2 modos:
--   - 'classified_only' (DEFAULT NUEVO): IA dispara solo si
--      conv.conversation_source IS NOT NULL (bienvenida outbound, lm via
--      workflow GHL, inbound automation, manual). Lead nuevo sin source
--      clasificada → conv creada + INSERT message source='lead', pero
--      ai_paused_until='infinity' → pipeline NO dispara. Trainer interviene
--      a mano si quiere.
--   - 'all' (escape hatch legacy): comportamiento previo sin gate. Solo se
--      usa para volver atrás temporalmente. NO es default.

ALTER TABLE public.tenant_configs
  ADD COLUMN IF NOT EXISTS ghl_inbound_mode TEXT
    NOT NULL DEFAULT 'classified_only'
    CHECK (ghl_inbound_mode IN ('classified_only', 'all'));

-- Backfill: aplicar default a rows existentes (idempotente: si la columna ya
-- tenía un valor, NOT NULL DEFAULT preservaría ese valor; este UPDATE es por
-- seguridad explícita).
UPDATE public.tenant_configs
SET ghl_inbound_mode = 'classified_only'
WHERE ghl_inbound_mode IS NULL;

COMMENT ON COLUMN public.tenant_configs.ghl_inbound_mode IS
  'Política de apertura GHL inbound (IG/FB via webhook OAuth o workflow custom). '
  'classified_only=IA solo dispara si conv.conversation_source IS NOT NULL '
  '(bienvenida/lm/inbound/manual). all=cualquier inbound dispara IA (legacy). '
  'Default classified_only (doctrina 2026-05-12).';
