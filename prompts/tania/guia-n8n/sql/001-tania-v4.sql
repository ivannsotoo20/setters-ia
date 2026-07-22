-- ============================================================================
-- 001-tania-v4.sql — Migración ADITIVA para Tania v4 (setter IA n8n + Anthropic)
--
-- ⚠️  BD DESTINO: el Postgres/Supabase de TANIA — el proyecto al que apunta la
--     credencial "Postgres Supabase" de su instancia n8n (tablas
--     clientes_crm_tania, n8n_chat_histories_tania, prompt_blocks_tania...).
--
-- ⚠️  NO aplicar en la BD del SaaS Fyzon (ppujrqxiizgfqclbuxet) ni vía el MCP
--     supabase-fyzon. Este fichero se ejecuta A MANO en el SQL editor del
--     proyecto Supabase de Tania (o psql contra su BD).
--
-- Todo es aditivo e idempotente (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS):
-- se puede re-ejecutar sin romper nada y NO toca datos existentes.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. clientes_crm_tania — columnas nuevas del modelo v4
-- ----------------------------------------------------------------------------
-- slots               memoria estructurada del lead (solo lo verbalizado);
--                     el workflow SIEMPRE mergea con || (nunca pisa con null)
-- stage_v4            etapa v4 (enum soft, ver CHECK más abajo); la columna
--                     vieja pipeline_stage se mantiene como espejo para GHL
-- fuente_v4           variante de origen del lead: 'ig-inbound' | 'ig-bienvenidas' |
--                     'wa-outbound' | 'wa-inbound-leadform'. Se fija al PRIMER
--                     contacto (COALESCE en los upserts) y ya no cambia: decide
--                     qué dist/system prompt usa el compose para ese lead
-- link_enviado_fecha  fecha del PRIMER envío del link de agenda
-- booking_status      none | booked | cancelled | no_show (webhook booking)
-- proximo_recontacto  cuándo debe mirarlo el workflow de seguimiento (NULL = no tocar)
-- recontacto_motivo   post_link | post_conv | hito | derivado_medico | reagenda | skip_llm
-- followups_enviados  contador de toques desde el último mensaje del lead
--                     (el workflow principal lo resetea a 0 cuando el lead responde)
ALTER TABLE public.clientes_crm_tania
  ADD COLUMN IF NOT EXISTS slots               jsonb       NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS stage_v4            text,
  ADD COLUMN IF NOT EXISTS fuente_v4           text,
  ADD COLUMN IF NOT EXISTS link_enviado_fecha  date,
  ADD COLUMN IF NOT EXISTS booking_status      text        NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS proximo_recontacto  timestamptz,
  ADD COLUMN IF NOT EXISTS recontacto_motivo   text,
  ADD COLUMN IF NOT EXISTS followups_enviados  integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ultimo_followup_at  timestamptz;

-- CHECKs suaves sobre los enums (solo validan filas nuevas: NOT VALID no revisa
-- lo existente, así que aplicar no puede fallar por datos legacy).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clientes_crm_tania_booking_status_chk') THEN
    ALTER TABLE public.clientes_crm_tania
      ADD CONSTRAINT clientes_crm_tania_booking_status_chk
      CHECK (booking_status IN ('none', 'booked', 'cancelled', 'no_show')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clientes_crm_tania_stage_v4_chk') THEN
    ALTER TABLE public.clientes_crm_tania
      ADD CONSTRAINT clientes_crm_tania_stage_v4_chk
      CHECK (stage_v4 IS NULL OR stage_v4 IN (
        'conexion', 'descubrimiento', 'cualificacion', 'puente',
        'llamada_ofrecida', 'link_enviado', 'agendado', 'realizada',
        'derivado_medico', 'en_espera_hito', 'dormido', 'perdido',
        'cliente_activo', 'handoff_humano'
      )) NOT VALID;
  END IF;
END $$;

-- Índice parcial para la query de candidatos del workflow de seguimiento
-- (WHERE proximo_recontacto IS NOT NULL AND proximo_recontacto <= now()).
CREATE INDEX IF NOT EXISTS idx_clientes_crm_tania_proximo_recontacto
  ON public.clientes_crm_tania (proximo_recontacto)
  WHERE proximo_recontacto IS NOT NULL;

-- El historial se lee siempre por sesión y en orden: este índice cubre las
-- lecturas del compose (principal y seguimiento).
CREATE INDEX IF NOT EXISTS idx_n8n_chat_histories_tania_session_id
  ON public.n8n_chat_histories_tania (session_id, id);


-- ----------------------------------------------------------------------------
-- 2. tania_mensajes_procesados — dedup persistente por message_id
-- ----------------------------------------------------------------------------
-- Capa 2 del dedup (la capa 1 es Redis INCR con TTL 1h). El workflow hace
-- INSERT ... ON CONFLICT DO NOTHING RETURNING: si no vuelve fila, el mensaje
-- ya se procesó y la ejecución muere. Sobrevive a flushes/reinicios de Redis.
CREATE TABLE IF NOT EXISTS public.tania_mensajes_procesados (
  message_id   text        PRIMARY KEY,   -- WA: wamid de YCloud; IG: derivado (user_id + hash + minuto)
  session_id   text        NOT NULL,
  canal        text,                       -- 'whatsapp' | 'instagram'
  procesado_at timestamptz NOT NULL DEFAULT now()
);

-- Purga opcional (correr a mano de vez en cuando, o programar; NO es necesario
-- para el funcionamiento — la tabla crece ~1 fila por mensaje entrante):
--   DELETE FROM public.tania_mensajes_procesados WHERE procesado_at < now() - interval '30 days';


-- ----------------------------------------------------------------------------
-- 3. tania_session_locks — lock por sesión (una respuesta a la vez por lead)
-- ----------------------------------------------------------------------------
-- Adquirir  = INSERT ... ON CONFLICT DO NOTHING RETURNING (atómico).
-- Liberar   = DELETE al final del turno (también en la rama de bot apagado).
-- Stale     = el propio workflow borra locks con locked_at > 120s antes de
--             cada intento, así que un crash a mitad de turno se auto-repara.
CREATE TABLE IF NOT EXISTS public.tania_session_locks (
  session_id text        PRIMARY KEY,
  locked_at  timestamptz NOT NULL DEFAULT now()
);


-- ----------------------------------------------------------------------------
-- 4. tania_llm_calls — telemetría de cada llamada a la API Anthropic
-- ----------------------------------------------------------------------------
-- Sirve para: (a) verificar el prompt caching (cache_read_input_tokens > 0 a
-- partir de la 2ª llamada de una conversación), (b) coste por lead/canal,
-- (c) detectar errores de parseo (columna error) sin bucear en ejecuciones n8n.
CREATE TABLE IF NOT EXISTS public.tania_llm_calls (
  id                          bigserial   PRIMARY KEY,
  session_id                  text,
  canal                       text,        -- 'whatsapp' | 'instagram'
  workflow                    text,        -- 'principal' | 'seguimiento'
  model                       text,
  input_tokens                integer,
  output_tokens               integer,
  cache_creation_input_tokens integer,
  cache_read_input_tokens     integer,
  stop_reason                 text,
  stage_v4                    text,
  handoff                     text,
  num_burbujas                integer,
  error                       text,        -- null | sin_tool_use | stage_invalido | handoff_invalido
  created_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tania_llm_calls_session
  ON public.tania_llm_calls (session_id, created_at DESC);


-- ----------------------------------------------------------------------------
-- 5. OPCIONAL (comentado): backfill de stage_v4 desde el pipeline_stage v3
-- ----------------------------------------------------------------------------
-- Si no se ejecuta, no pasa nada: el compose trata stage_v4 NULL como
-- 'conexion' y el primer turno de cada lead lo re-clasifica. Ejecutarlo deja
-- el kanban coherente desde el minuto 1 del corte.
--
-- UPDATE public.clientes_crm_tania
-- SET stage_v4 = CASE pipeline_stage
--   WHEN 'bienvenida'       THEN 'conexion'
--   WHEN 'descubrimiento'   THEN 'descubrimiento'
--   WHEN 'cualificacion'    THEN 'cualificacion'
--   WHEN 'llamada_ofrecida' THEN 'llamada_ofrecida'
--   WHEN 'link_enviado'     THEN 'link_enviado'
--   WHEN 'agendado'         THEN 'agendado'
--   WHEN 'perdido'          THEN 'perdido'
--   ELSE 'conexion'
-- END
-- WHERE stage_v4 IS NULL;


-- ----------------------------------------------------------------------------
-- Verificación post-aplicación (solo lectura)
-- ----------------------------------------------------------------------------
-- SELECT column_name, data_type, column_default
--   FROM information_schema.columns
--  WHERE table_name = 'clientes_crm_tania'
--    AND column_name IN ('slots','stage_v4','fuente_v4','link_enviado_fecha',
--                        'booking_status','proximo_recontacto','recontacto_motivo',
--                        'followups_enviados','ultimo_followup_at');
-- SELECT to_regclass('public.tania_mensajes_procesados'),
--        to_regclass('public.tania_session_locks'),
--        to_regclass('public.tania_llm_calls');
