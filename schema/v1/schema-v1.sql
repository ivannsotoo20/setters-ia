-- ============================================================
-- Fyzon SaaS Setters IA — Schema v1 (greenfield)
-- ============================================================
-- Target Supabase: ppujrqxiizgfqclbuxet
-- Ejecutar en SQL Editor de Supabase Studio (usa service_role por defecto)
-- Orden: extensiones → enums → tablas → FKs → indexes → RLS → triggers → seeds
--
-- Principios de diseño:
--   - Multi-tenant shared con RLS strict (D1)
--   - BYO LLM: api keys encriptadas a nivel aplicación antes de INSERT (D12)
--   - ManyChat como adapter principal de canales (D16/D17)
--   - Sistema de prompts 3 bloques v3 (Core+Coach+Nicho, con carga dinámica por fase)
--   - Fases F0-F7 canónicas (8 fases)
--   - Typing delay + debounce preservados del n8n actual
--   - GHL sync como backbone CRM (cada mensaje se replica allí)
-- ============================================================

BEGIN;

-- ============================================================
-- 1. Extensiones
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";       -- gen_random_uuid
CREATE EXTENSION IF NOT EXISTS "pg_trgm" SCHEMA extensions;  -- trigram search en mensajes/leads
CREATE EXTENSION IF NOT EXISTS "citext"  SCHEMA extensions;  -- email case-insensitive
CREATE EXTENSION IF NOT EXISTS "vector"  SCHEMA extensions;  -- embeddings en coach_knowledge

-- ============================================================
-- 2. Enums
-- ============================================================
CREATE TYPE profile_role        AS ENUM ('owner','admin','viewer');
CREATE TYPE channel_type        AS ENUM ('whatsapp','instagram_dm','facebook_messenger');
CREATE TYPE channel_provider    AS ENUM ('manychat','meta_cloud','ghl','other');
CREATE TYPE llm_provider        AS ENUM ('anthropic','openai','google','azure_openai','custom');
CREATE TYPE llm_role            AS ENUM ('generator','judge','splitter','transcriber','embedder');
CREATE TYPE llm_call_status     AS ENUM ('success','error','fallback');
CREATE TYPE conversation_state  AS ENUM ('active','paused','stopped','closed');
CREATE TYPE conversation_priority AS ENUM ('alta','media','baja');
CREATE TYPE conversation_direction AS ENUM ('inbound','outbound','untagged');
CREATE TYPE message_source      AS ENUM ('lead','ai','system');
CREATE TYPE message_content_type AS ENUM ('text','audio','image','video','file','mixed');
CREATE TYPE schedule_message_kind AS ENUM ('message','follow_up','resource');
CREATE TYPE schedule_status     AS ENUM ('pending','processing','sent','failed','cancelled');
CREATE TYPE resource_type       AS ENUM ('pdf','video','image','audio','link','document','other');
CREATE TYPE handoff_cause       AS ENUM ('A_agenda','B_derivacion','C_descualificado','D_espera','E_error');

-- ============================================================
-- 3. Tablas core
-- ============================================================

-- 3.1 tenants — cada trainer es un tenant
CREATE TABLE public.tenants (
  id            BIGSERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,                      -- identificador URL-friendly
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  onboarded_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settings      JSONB NOT NULL DEFAULT '{}'::jsonb        -- config blanda (branding, prefs)
);

-- 3.2 profiles — usuarios del dashboard (ligados a auth.users de Supabase)
CREATE TABLE public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id   BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  email       CITEXT NOT NULL,
  full_name   TEXT,
  role        profile_role NOT NULL DEFAULT 'owner',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, email)
);

-- 3.3 tenant_configs — configuración operativa del motor por tenant
CREATE TABLE public.tenant_configs (
  tenant_id                   BIGINT PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  active_conversation_delay   INTERVAL NOT NULL DEFAULT '30 seconds',   -- typing delay si conv <1h
  idle_conversation_delay     INTERVAL NOT NULL DEFAULT '5 minutes',    -- si conv >1h
  debounce_window_seconds     INT NOT NULL DEFAULT 25,                  -- ventana acumulador
  timezone                    TEXT NOT NULL DEFAULT 'Europe/Madrid',
  max_messages_per_conversation INT NOT NULL DEFAULT 22,                -- hard cap setter
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3.4 tenant_schedules — ventanas de follow-up por día
CREATE TABLE public.tenant_schedules (
  id             BIGSERIAL PRIMARY KEY,
  tenant_id      BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  schedule_type  TEXT NOT NULL DEFAULT 'follow_up',        -- follow_up | business_hours | ...
  day_of_week    SMALLINT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  start_time     TIME NOT NULL,
  end_time       TIME NOT NULL,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 4. Canales e integraciones
-- ============================================================

-- 4.1 channels — qué canales tiene activos cada tenant
CREATE TABLE public.channels (
  id              BIGSERIAL PRIMARY KEY,
  tenant_id       BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel_type    channel_type NOT NULL,
  via_provider    channel_provider NOT NULL DEFAULT 'manychat',   -- extensible a meta_cloud cuando BSP llegue
  label           TEXT,                                           -- ej. "IG @mariadelluc", "WhatsApp +34..."
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, channel_type, via_provider, label)
);

-- 4.2 integration_accounts — credenciales por canal/proveedor
-- credentials se guardan encriptadas a nivel app (AES-256-GCM) antes de INSERT
CREATE TABLE public.integration_accounts (
  id                BIGSERIAL PRIMARY KEY,
  tenant_id         BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel_id        BIGINT NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  provider          channel_provider NOT NULL,
  credentials       JSONB NOT NULL DEFAULT '{}'::jsonb,     -- ENCRIPTADO: apiKey, tokens
  connection_config JSONB NOT NULL DEFAULT '{}'::jsonb,     -- NO encriptado: accountId, pageId, locationId
  webhook_secret    TEXT NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),  -- HMAC verification
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.3 tenant_tokens — tokens únicos por tenant para rutas webhook plug-and-play
-- Ejemplo: https://motor.fyzon.com/webhook/manychat/{tenant_token} → mapea a tenant_id sin exponerlo
CREATE TABLE public.tenant_tokens (
  id          BIGSERIAL PRIMARY KEY,
  tenant_id   BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  purpose     TEXT NOT NULL DEFAULT 'webhook',
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at  TIMESTAMPTZ
);

-- ============================================================
-- 5. Leads y conversaciones
-- ============================================================

-- 5.1 leads — personas que contactan al trainer
CREATE TABLE public.leads (
  id              BIGSERIAL PRIMARY KEY,
  tenant_id       BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel_id      BIGINT NOT NULL REFERENCES public.channels(id) ON DELETE RESTRICT,
  external_id     TEXT NOT NULL,                          -- ID del lead en ManyChat/Meta
  source_channel  TEXT,                                   -- 'instagram'/'whatsapp' redundante pero histórico
  first_name      TEXT,
  last_name       TEXT,
  username        TEXT,
  phone           TEXT,
  email           CITEXT,
  location        TEXT,
  notes           TEXT,                                   -- inferido por el agente
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT leads_unique_external UNIQUE (tenant_id, channel_id, external_id)
);

-- 5.2 lead_external_ids — bind lead ↔ integration_account (un lead puede tener varias cuentas externas)
CREATE TABLE public.lead_external_ids (
  id                        BIGSERIAL PRIMARY KEY,
  tenant_id                 BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  lead_id                   BIGINT NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  integration_account_id    BIGINT NOT NULL REFERENCES public.integration_accounts(id) ON DELETE CASCADE,
  external_user_id          TEXT NOT NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (lead_id, integration_account_id)
);

-- 5.3 conversations — un hilo de conversación por (lead, canal)
CREATE TABLE public.conversations (
  id                            BIGSERIAL PRIMARY KEY,
  tenant_id                     BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  lead_id                       BIGINT NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  channel_id                    BIGINT NOT NULL REFERENCES public.channels(id) ON DELETE RESTRICT,
  state                         conversation_state NOT NULL DEFAULT 'active',
  is_qualified                  BOOLEAN,                                -- null hasta que se decida
  phase_number                  SMALLINT NOT NULL DEFAULT 0 CHECK (phase_number BETWEEN 0 AND 7),
  phase_message_count           INT NOT NULL DEFAULT 0,
  next_action                   TEXT,
  priority                      conversation_priority,
  direction                     conversation_direction NOT NULL DEFAULT 'untagged',
  -- estado handoff
  is_handoff_to_human           BOOLEAN NOT NULL DEFAULT FALSE,
  handoff_cause                 handoff_cause,
  handoff_reason                TEXT,
  handoff_at                    TIMESTAMPTZ,
  -- agenda
  is_call_scheduling_link_sent  BOOLEAN NOT NULL DEFAULT FALSE,
  call_scheduled_at             TIMESTAMPTZ,
  -- inferidos por el agente IA
  general_context               TEXT,
  current_context               TEXT,
  emotion                       TEXT,
  general_motivation            TEXT,
  goal                          TEXT,
  problem                       TEXT,
  urgency                       TEXT,
  custom_fields                 JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- timeline
  last_message_at               TIMESTAMPTZ,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, lead_id, channel_id)
);

-- 5.4 conversation_messages — historial completo
CREATE TABLE public.conversation_messages (
  id              BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  tenant_id       BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  source          message_source NOT NULL,
  content         TEXT,                                   -- puede ser null si solo media
  content_type    message_content_type NOT NULL DEFAULT 'text',
  media_url       TEXT,
  media_mime      TEXT,
  transcription   TEXT,                                   -- si content_type=audio|video
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5.5 message_schedules — cola de mensajes programados (typing delay + follow-ups)
CREATE TABLE public.message_schedules (
  id                      BIGSERIAL PRIMARY KEY,
  tenant_id               BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  conversation_id         BIGINT NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  integration_account_id  BIGINT NOT NULL REFERENCES public.integration_accounts(id) ON DELETE RESTRICT,
  message                 TEXT,
  message_type            schedule_message_kind NOT NULL DEFAULT 'message',
  status                  schedule_status NOT NULL DEFAULT 'pending',
  scheduled_at            TIMESTAMPTZ NOT NULL,
  has_attachment          BOOLEAN NOT NULL DEFAULT FALSE,
  attachment_url          TEXT,
  resource_id             BIGINT,                         -- FK a resources (añadido abajo con ALTER)
  resource_type           resource_type,
  attempts                INT NOT NULL DEFAULT 0,
  last_error              TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at                 TIMESTAMPTZ
);

-- ============================================================
-- 6. Sistema de prompts v3 (Core + Coach + Nicho + Fases)
-- ============================================================

-- 6.1 phases — catálogo canónico de fases F0-F7
CREATE TABLE public.phases (
  number        SMALLINT PRIMARY KEY CHECK (number BETWEEN 0 AND 7),
  name          TEXT NOT NULL,
  description   TEXT,
  max_messages  SMALLINT NOT NULL DEFAULT 5
);

-- 6.2 prompt_blocks — bloques del prompt 3 capas con versionado
-- tenant_id = NULL → bloque compartido (Core Fyzon, tenant_id=0 en el schema viejo)
CREATE TABLE public.prompt_blocks (
  id            BIGSERIAL PRIMARY KEY,
  tenant_id     BIGINT REFERENCES public.tenants(id) ON DELETE CASCADE,  -- NULL = Core compartido
  channel_override channel_type,                          -- D8: override por canal si aplica
  block_key     TEXT NOT NULL,                            -- 'core_v3', 'coach_v3', 'nicho_v3', 'fase_1_v3', 'objeciones_v3', 'handoff_v3', 'pipeline_v3', 'cualificacion_v3'
  content       TEXT NOT NULL,
  sort_order    INT NOT NULL DEFAULT 0,
  version       INT NOT NULL DEFAULT 1,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, channel_override, block_key, version)
);

-- 6.3 coach_ai_knowledge — KB vectorial por coach (preservada del schema anterior)
CREATE TABLE public.coach_ai_knowledge (
  id          BIGSERIAL PRIMARY KEY,
  tenant_id   BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  title       TEXT,
  content     TEXT NOT NULL,
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
  embedding   vector(1536),                                -- text-embedding-3-small (ajustable)
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 7. Recursos (lead magnets, follow-ups)
-- ============================================================

-- 7.1 resources — lead magnets, vídeos, PDFs
CREATE TABLE public.resources (
  id             BIGSERIAL PRIMARY KEY,
  tenant_id      BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  description    TEXT,
  resource_type  resource_type NOT NULL,
  mime_type      TEXT,
  url            TEXT,                                     -- URL pública si aplica
  storage_path   TEXT,                                     -- path en Supabase Storage
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Añado FK de message_schedules.resource_id ahora que resources ya existe
ALTER TABLE public.message_schedules
  ADD CONSTRAINT message_schedules_resource_id_fkey
  FOREIGN KEY (resource_id) REFERENCES public.resources(id) ON DELETE SET NULL;

-- 7.2 follow_ups — plantillas de follow-up programadas
CREATE TABLE public.follow_ups (
  id                      BIGSERIAL PRIMARY KEY,
  tenant_id               BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name                    TEXT NOT NULL,
  message_template        TEXT NOT NULL,
  follow_up_delay         INTERVAL NOT NULL,
  attachment_resource_id  BIGINT REFERENCES public.resources(id) ON DELETE SET NULL,
  is_active               BOOLEAN NOT NULL DEFAULT TRUE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 8. LLM configs, credenciales BYO y audit trail
-- ============================================================

-- 8.1 llm_configs — modelos habilitados por tenant y rol (generator/judge/splitter)
-- api_key_encrypted va encriptada a nivel app (AES-256-GCM)
CREATE TABLE public.llm_configs (
  id                           BIGSERIAL PRIMARY KEY,
  tenant_id                    BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  role                         llm_role NOT NULL DEFAULT 'generator',
  provider                     llm_provider NOT NULL DEFAULT 'anthropic',
  model                        TEXT NOT NULL,                       -- ej 'claude-sonnet-4-5', 'claude-haiku-4-5'
  api_key_encrypted            TEXT NOT NULL,                       -- BYO LLM D12
  price_input_per_1m           NUMERIC(10,4),
  price_output_per_1m          NUMERIC(10,4),
  price_cached_input_per_1m    NUMERIC(10,4),
  is_active                    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, role, provider, model)
);

-- 8.2 llm_calls — audit trail de cada llamada LLM
CREATE TABLE public.llm_calls (
  id                BIGSERIAL PRIMARY KEY,
  tenant_id         BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  conversation_id   BIGINT REFERENCES public.conversations(id) ON DELETE SET NULL,
  role              llm_role NOT NULL,
  provider          llm_provider NOT NULL,
  model             TEXT NOT NULL,
  status            llm_call_status NOT NULL,
  request_payload   JSONB,
  response_payload  JSONB,
  latency_ms        INT,
  tokens_in         INT,
  tokens_out        INT,
  tokens_in_cached  INT,
  cost              NUMERIC(12,6),                         -- en USD
  error_message     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 9. Utilidades operativas
-- ============================================================

-- 9.1 ignored_users — blacklist por tenant
CREATE TABLE public.ignored_users (
  id                BIGSERIAL PRIMARY KEY,
  tenant_id         BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel_id        BIGINT REFERENCES public.channels(id) ON DELETE CASCADE,
  external_user_id  TEXT NOT NULL,
  reason            TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, channel_id, external_user_id)
);

-- 9.2 conversation_events — event sourcing ligero (fases, handoffs, etc.)
CREATE TABLE public.conversation_events (
  id              BIGSERIAL PRIMARY KEY,
  tenant_id       BIGINT NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  conversation_id BIGINT NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  event_type      TEXT NOT NULL,                          -- 'phase_changed' | 'handoff' | 'link_sent' | ...
  event_data      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 10. Índices (aparte de PK y UNIQUE)
-- ============================================================

-- Leads: búsqueda por trainer + canal + external
CREATE INDEX idx_leads_tenant_channel ON public.leads (tenant_id, channel_id);
CREATE INDEX idx_leads_updated_at     ON public.leads (updated_at DESC);

-- Conversations: vista dashboard
CREATE INDEX idx_conversations_tenant_state      ON public.conversations (tenant_id, state);
CREATE INDEX idx_conversations_last_message_at   ON public.conversations (last_message_at DESC);
CREATE INDEX idx_conversations_phase             ON public.conversations (tenant_id, phase_number);

-- Messages: acceso por conversación + trigram search
CREATE INDEX idx_msgs_conversation_sent_at  ON public.conversation_messages (conversation_id, sent_at);
CREATE INDEX idx_msgs_content_trgm          ON public.conversation_messages USING gin (content extensions.gin_trgm_ops);

-- Schedules: cron lee pendientes
CREATE INDEX idx_schedules_status_scheduled_at ON public.message_schedules (status, scheduled_at)
  WHERE status = 'pending';

-- Prompt blocks: lookup por tenant + block_key
CREATE INDEX idx_prompt_blocks_tenant_key_active
  ON public.prompt_blocks (tenant_id, block_key, is_active)
  WHERE is_active = TRUE;

-- LLM calls: conversaciones + tiempo
CREATE INDEX idx_llm_calls_tenant_created ON public.llm_calls (tenant_id, created_at DESC);

-- Coach knowledge: vector similarity search (pendiente de concretar función de distancia)
CREATE INDEX idx_coach_knowledge_embedding
  ON public.coach_ai_knowledge
  USING ivfflat (embedding extensions.vector_cosine_ops)
  WITH (lists = 100);

-- ============================================================
-- 11. Funciones de utilidad
-- ============================================================

-- 11.1 tenant_id_for_user — helper RLS: del auth.jwt() al tenant_id
CREATE OR REPLACE FUNCTION public.tenant_id_for_user()
RETURNS BIGINT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
$$;

-- 11.2 set_updated_at — trigger helper
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- 11.3 update_last_message_at — al insertar msg, actualiza conversations.last_message_at
CREATE OR REPLACE FUNCTION public.update_conversation_last_message_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.conversations
     SET last_message_at = NEW.sent_at,
         updated_at = NOW()
   WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

-- ============================================================
-- 12. Triggers
-- ============================================================

-- updated_at triggers
CREATE TRIGGER trg_tenants_updated_at
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_tenant_configs_updated_at
  BEFORE UPDATE ON public.tenant_configs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_integration_accounts_updated_at
  BEFORE UPDATE ON public.integration_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_lead_external_ids_updated_at
  BEFORE UPDATE ON public.lead_external_ids
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_conversations_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_prompt_blocks_updated_at
  BEFORE UPDATE ON public.prompt_blocks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_llm_configs_updated_at
  BEFORE UPDATE ON public.llm_configs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_coach_ai_knowledge_updated_at
  BEFORE UPDATE ON public.coach_ai_knowledge
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- último mensaje en conversations
CREATE TRIGGER trg_conversation_messages_last
  AFTER INSERT ON public.conversation_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_conversation_last_message_at();

-- ============================================================
-- 13. Row Level Security
-- ============================================================

-- 13.1 Habilitar RLS en TODAS las tablas con tenant_id
ALTER TABLE public.tenants                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_configs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_schedules        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channels                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_accounts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_tokens           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_external_ids       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_messages   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_schedules       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phases                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prompt_blocks           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_ai_knowledge      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resources               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follow_ups              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.llm_configs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.llm_calls               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ignored_users           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_events     ENABLE ROW LEVEL SECURITY;

-- 13.2 Policies — patrón "tenant_isolation" para usuarios autenticados
-- Authenticated users solo ven/tocan su tenant. Service role bypasa RLS automáticamente.

-- tenants: user ve su propio tenant
CREATE POLICY "tenants_own_tenant" ON public.tenants
  FOR SELECT USING (id = public.tenant_id_for_user());

-- profiles: user ve profiles de su tenant
CREATE POLICY "profiles_own_tenant" ON public.profiles
  FOR ALL USING (tenant_id = public.tenant_id_for_user());

-- Tablas con tenant_id directo: SELECT/INSERT/UPDATE/DELETE restringido a tu tenant
DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'tenant_configs','tenant_schedules','channels','integration_accounts','tenant_tokens',
    'leads','lead_external_ids','conversations','conversation_messages','message_schedules',
    'prompt_blocks','coach_ai_knowledge','resources','follow_ups',
    'llm_configs','llm_calls','ignored_users','conversation_events'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY "%I_tenant_isolation" ON public.%I FOR ALL USING (tenant_id = public.tenant_id_for_user())',
      tbl, tbl
    );
  END LOOP;
END $$;

-- phases: catálogo público read-only
CREATE POLICY "phases_read_all" ON public.phases FOR SELECT USING (TRUE);

-- prompt_blocks: excepción — los bloques compartidos (tenant_id IS NULL = Core Fyzon) son SOLO LECTURA para todos
-- (la policy anterior tenant_isolation no les aplicaría, así que añado una extra)
CREATE POLICY "prompt_blocks_core_read" ON public.prompt_blocks
  FOR SELECT USING (tenant_id IS NULL AND is_active = TRUE);

-- ============================================================
-- 14. Seeds — datos iniciales imprescindibles
-- ============================================================

-- 14.1 phases — las 8 fases canónicas
INSERT INTO public.phases (number, name, description, max_messages) VALUES
  (0, 'Pre-contacto',        'Antes del primer mensaje real. Lead magnet entregado.',                2),
  (1, 'Conexión',             'Romper el hielo, conexión humana, sin extracción de datos.',          5),
  (2, 'Profundización',       'Situación + Resultado + Obstáculos. Fase más larga.',                  6),
  (3, 'Cualificación',        'Soluciones + Importancia + Urgencia.',                                 4),
  (4, 'Puente',               'Resumen en sus palabras + confirmación.',                              1),
  (5, 'Propuesta llamada',    'Invita a videollamada con el closer del coach.',                       2),
  (6, 'Envío enlace agenda',  'Envía link Calendly + confirma reserva.',                              2),
  (7, 'Cierre / Handoff',     'Hand-off humano (agenda, derivación, descualificado, espera).',        2);

-- 14.2 Core v3 placeholder — se rellena con el prompt real cuando Ivan lo pegue
-- Por ahora un placeholder de registro para mantener la estructura
-- (los INSERT reales del Core los hacemos cuando conectemos y copiemos desde el Supabase viejo o desde los archivos que pasó Ivan)

-- ============================================================
-- FIN del schema v1
-- ============================================================
COMMIT;

-- Verificación post-deploy:
-- SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name;
-- SELECT * FROM public.phases ORDER BY number;
