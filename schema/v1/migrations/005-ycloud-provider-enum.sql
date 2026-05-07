-- ============================================================================
-- Migration 005: añadir 'ycloud' al enum channel_provider
-- ============================================================================
-- Contexto: el motor incorpora YCloud como segundo proveedor BSP de WhatsApp
-- (paralelo a ManyChat, sustituirá ManyChat a medio plazo cuando llegue GHL).
--
-- ALTER TYPE ... ADD VALUE no admite IF NOT EXISTS de forma reliable en todas
-- las versiones de Postgres < 12, así que envolvemos con DO block que captura
-- duplicate_object como NULL (idempotente).
-- ============================================================================

DO $$
BEGIN
  ALTER TYPE channel_provider ADD VALUE 'ycloud';
EXCEPTION
  WHEN duplicate_object THEN
    -- Ya existe, nada que hacer
    NULL;
END
$$;

-- Verificación
SELECT t.typname, e.enumlabel, e.enumsortorder
FROM pg_type t
JOIN pg_enum e ON t.oid = e.enumtypid
WHERE t.typname = 'channel_provider'
ORDER BY e.enumsortorder;
