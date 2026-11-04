-- 083 — Etiqueta de sistema «Profesional» (2026-11-04)
--
-- El gate de intención en la apertura (modo `classified_or_intent`, migración
-- 084; motor `apps/motor-agente/src/services/inbound-intent-gate.ts`) deja en
-- pausa, sin respuesta automática, a quien abre la conversación preguntando si
-- la entrenadora es sanitaria, por su titulación o credenciales, o
-- presentándose como fisio, médico o colega (Tania, tenant 7, 2026-11-04). La
-- conversación queda visible para ella y se marca con esta etiqueta para que la
-- distinga de un vistazo de las pausadas por otra causa.
--
-- `pause_ai_on_apply = TRUE`: aplicarla a mano desde el panel también pausa la
-- IA. Sin `destination_bucket`: la conversación no cambia de columna.
--
-- NUNCA se guarda «profesional» en `conversation_source`: cualquier valor no
-- nulo ahí despierta a la IA si alguien reanuda desde el panel. La intención
-- queda en `conversations.custom_fields.inbound_intent` y en esta etiqueta.
--
-- Patrón de la migración 024/025 (seed a tenants existentes + trigger para los
-- nuevos). La función conserva el `search_path` y el REVOKE de la 053.
--
-- Rollback:
--   DELETE FROM public.tenant_labels WHERE name = 'Profesional' AND is_system = TRUE;
--   y volver a crear `seed_system_labels_on_new_tenant` con la versión de la 025
--   (más `SET search_path` y REVOKE de la 053).

BEGIN;

-- 1) Seed para los tenants existentes. Si un tenant ya tiene una etiqueta
--    propia llamada «Profesional», se respeta la suya (ON CONFLICT DO NOTHING):
--    el motor pausa la IA por su cuenta antes de aplicar la etiqueta, así que
--    una etiqueta propia sin `pause_ai_on_apply` no deja la conversación viva.
INSERT INTO public.tenant_labels
  (tenant_id, name, color, description, is_system, destination_bucket, pause_ai_on_apply)
SELECT t.id, 'Profesional', '#6366f1',
  'Abrio preguntando por la titulacion o presentandose como profesional (fisio, medico, colega). Sin respuesta automatica.',
  TRUE, NULL, TRUE
FROM public.tenants t
ON CONFLICT (tenant_id, name) DO NOTHING;

-- 2) Trigger de alta: los tenants nuevos nacen con la etiqueta.
CREATE OR REPLACE FUNCTION public.seed_system_labels_on_new_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.tenant_labels
    (tenant_id, name, color, description, is_system, destination_bucket, pause_ai_on_apply)
  VALUES
    (NEW.id, 'Hot Lead',        '#ef4444', 'Atencion humana urgente',           TRUE, 'hot',       TRUE),
    (NEW.id, 'Completado',      '#10b981', 'Cerrada o handoff Causa C',         TRUE, 'done',      FALSE),
    (NEW.id, 'Comprado',        '#a855f7', 'Compra confirmada GHL',             TRUE, 'bought',    TRUE),
    (NEW.id, 'Activo',          '#3b82f6', 'En curso',                          TRUE, 'chats',     FALSE),
    (NEW.id, 'Cita cancelada',  '#f59e0b', 'Cita cancelada manual o GHL',       TRUE, 'cancelled', TRUE),
    (NEW.id, 'No-Show',         '#dc2626', 'No aparecio a cita',                TRUE, 'no_show',   TRUE),
    (NEW.id, 'Recontacto',      '#0ea5e9', 'A recontactar mas adelante',        TRUE, 'recontact', FALSE),
    (NEW.id, 'Cierre perdido',  '#64748b', 'Rechazo la oferta',                 TRUE, 'lost',      TRUE),
    (NEW.id, 'Profesional',     '#6366f1', 'Pregunto por la titulacion o es profesional; sin respuesta automatica', TRUE, NULL, TRUE)
  ON CONFLICT (tenant_id, name) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.seed_system_labels_on_new_tenant() FROM PUBLIC, anon, authenticated;

COMMIT;
