-- Sprint Iota.1.b — Toggle "personalizar IG/FB con IA" + texto fijo fallback +
-- ventana materialize al vuelo cuando entras a una conv (previsualización al cargar).

BEGIN;

ALTER TABLE public.tenant_followup_config
  ADD COLUMN IF NOT EXISTS auto_personalize BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS default_followup_text TEXT,
  ADD COLUMN IF NOT EXISTS materialize_lookahead_hours INT NOT NULL DEFAULT 24
    CHECK (materialize_lookahead_hours BETWEEN 0 AND 168);

UPDATE public.tenant_followup_config
SET default_followup_text = 'Hola, ¿pudiste ver mi mensaje? Quería saber si sigues interesado/a 🙂'
WHERE default_followup_text IS NULL;

COMMIT;
