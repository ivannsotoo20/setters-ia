-- 079 — calendar_appointments.match_method admite 'ghl_contact_id' (2026-09-12)
--
-- El matcher (Hito 10.5, appointment-matcher.ts) devuelve `ghl_contact_id`
-- cuando la cita casa por `appointment.contactId ↔ conversations.ghl_contact_id`,
-- pero el CHECK de la migration 048 solo admitía fyzon_uuid / phone / unmatched.
-- Salió a la luz en el primer calendar-sync de Tania: 1 de 12 citas no se pudo
-- guardar ("violates check constraint calendar_appointments_match_method_check").

ALTER TABLE public.calendar_appointments
  DROP CONSTRAINT IF EXISTS calendar_appointments_match_method_check;

ALTER TABLE public.calendar_appointments
  ADD CONSTRAINT calendar_appointments_match_method_check
  CHECK (match_method = ANY (ARRAY['fyzon_uuid'::text, 'ghl_contact_id'::text, 'phone'::text, 'unmatched'::text]));
