-- Migration 030 — Sprint Iota.1.d
--
-- Añade la FK message_schedules.template_id → followup_templates.id que
-- faltaba desde Sprint Iota.1 (migration 028). Sin esta FK, el cliente
-- supabase-js NO puede resolver el join automático
-- `select(..., followup_templates(name))` y devuelve error → la action
-- listScheduledFollowups falla y el panel del chat muestra "sin programar"
-- aunque haya schedules pendientes en BD (bug detectado en smoke Iota.1.d).
--
-- ON DELETE SET NULL: si se borra una plantilla, los schedules ya creados
-- mantienen el body materializado y simplemente pierden la referencia.

ALTER TABLE public.message_schedules
ADD CONSTRAINT message_schedules_template_id_fkey
FOREIGN KEY (template_id)
REFERENCES public.followup_templates(id)
ON DELETE SET NULL;
