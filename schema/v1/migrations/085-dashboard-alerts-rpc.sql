-- 085 — Alertas de conversación del dashboard calculadas en SQL (2026-11-04)
--
-- Hasta hoy `loadDashboardData` (apps/panel/lib/actions/dashboard.ts) cargaba
-- TODAS las conversaciones activas del tenant y todas las pasadas a la
-- entrenadora, bajaba sus mensajes por lotes y calculaba en JS quién escribió el
-- último. PostgREST corta cada respuesta en 1.000 filas y la consulta de activas
-- no llevaba `order` ni `range`: el tenant 7 tiene 4.181 activas, así que las
-- alertas se calculaban sobre un subconjunto arbitrario de 1.000. Tania veía
-- «11 personas esperando respuesta» cuando eran 34, y sus conversaciones de
-- Instagram de octubre no aparecían en ninguna alerta.
--
-- Además había un hueco entre las dos alertas: una conversación que abrió la
-- persona (direction='inbound') y que el gate de palabras clave dejó con la IA
-- pausada (`ai_paused_until='infinity'`, sin handoff) no era «esperando
-- respuesta» (exige IA sin pausar) ni «en manos de la entrenadora» (exige
-- handoff). Nadie la atendía y ninguna alerta lo decía. Es la tercera lista.
--
-- Esta función hace el cálculo entero en la base de datos y devuelve un solo
-- jsonb (no un set): PostgREST también corta a 1.000 filas las funciones que
-- devuelven tabla, y la lista inbound del tenant 7 tiene más de 1.000
-- candidatas antes del filtro de apertura.
--
-- Definiciones (las mismas que tenían detectAwaitingReply / detectUnattendedHandoffs
-- / detectStalls en apps/panel/lib/dashboard-query.ts; los umbrales llegan como
-- parámetros desde ALERT_THRESHOLDS para que la fuente única siga en TS):
--
--   último mensaje = DISTINCT ON (conversation_id) ORDER BY sent_at DESC, id DESC
--   leads de prueba = leads.first_name 'ivan' / 'iván' (sin mayúsculas, recortado),
--                     igual que el filtro de `loadTestLeadIds` + `isTestLeadName`.
--
--   awaiting_reply      state='active', sin handoff, ai_paused_until IS NULL,
--                       último mensaje de la persona hace más de p_awaiting_hours.
--   handoff_unattended  is_handoff_to_human, phase_number <> 7, último mensaje de
--                       la persona o de la IA, sin mensaje de la entrenadora igual
--                       o posterior, hace más de p_handoff_hours. Sin filtro por
--                       state: el motor deja la conversación en 'closed' al hacer
--                       el handoff.
--   stalls              («sin respuesta de la persona») state='active', sin
--                       handoff, IA sin pausar, F1-F6, último mensaje de la IA
--                       hace p_stall_days días o más. Se devuelven las
--                       conversaciones con canal, dirección y fase; el panel las
--                       agrupa por canal × fase, quita las que tienen outcome y
--                       aplica el mínimo de 5 por grupo.
--   inbound_unattended  NUEVA: state='active', direction='inbound',
--                       ai_paused_until='infinity', sin handoff, último mensaje de
--                       la persona, sin la etiqueta «Profesional» (migración 083 u otra posterior;
--                       si el tenant no la tiene, no excluye nada). Devuelve el
--                       primer mensaje de la persona (160 caracteres) y la primera
--                       respuesta automática (`source='system'`) para que el panel
--                       aplique `isKeywordFlowOpening` (lib/inbound-opening.ts):
--                       una apertura que es solo la palabra clave o un botón
--                       («Siii😊», «Empezar», «espalda») no es un inbound, y la
--                       regla vive en JS para que la alerta y la tarjeta
--                       «Inbound» del dashboard digan lo mismo.
--
-- Forma del resultado:
--   {
--     "computed_at": "...",
--     "awaiting_reply":     [{ "conversation_id", "last_message_at" }, ...],
--     "handoff_unattended": [{ "conversation_id", "last_message_at" }, ...],
--     "stalls":             [{ "conversation_id", "channel_id", "direction",
--                              "phase_number", "last_message_at" }, ...],
--     "inbound_unattended": [{ "conversation_id", "last_message_at",
--                              "first_lead_text", "first_lead_at",
--                              "first_auto_reply_at" }, ...]
--   }
--   Cada lista va ordenada por last_message_at ascendente: la que más lleva
--   esperando, primero (la URL de la alerta se queda con las 200 primeras).
--
-- Seguridad (regla 8 de CLAUDE.md): SECURITY DEFINER con search_path fijado y
-- EXECUTE solo para service_role. La llama el panel con el cliente service_role
-- (`getServiceRoleClient` en dashboard.ts), que ya bypassa RLS; no se concede a
-- `authenticated` porque la función no comprueba que p_tenant_id sea el del
-- usuario. Si algún día se llama con el cliente del usuario, hay que añadir esa
-- comprobación dentro ANTES de conceder EXECUTE a authenticated.
--
-- Índices que usa: idx_conversations_tenant_state (tenant_id, state) para las
-- vigiladas e idx_msgs_conversation_sent_at (conversation_id, sent_at) para el
-- último y el primer mensaje de cada una. Medido en producción con EXPLAIN
-- ANALYZE sobre el tenant 7 (4.266 vigiladas, 19k mensajes) antes de aplicar.
--
-- Rollback: DROP FUNCTION IF EXISTS public.dashboard_alerts(bigint, integer, integer, integer);

CREATE OR REPLACE FUNCTION public.dashboard_alerts(
  p_tenant_id bigint,
  p_awaiting_hours integer DEFAULT 2,
  p_handoff_hours integer DEFAULT 24,
  p_stall_days integer DEFAULT 3
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
WITH test_leads AS (
  SELECT l.id
  FROM public.leads l
  WHERE l.tenant_id = p_tenant_id
    AND lower(btrim(l.first_name)) IN ('ivan', 'iván')
),
monitored AS (
  SELECT c.id, c.state, c.is_handoff_to_human, c.ai_paused_until,
         c.phase_number, c.direction, c.channel_id
  FROM public.conversations c
  WHERE c.tenant_id = p_tenant_id
    AND (c.state = 'active' OR c.is_handoff_to_human)
    AND NOT EXISTS (SELECT 1 FROM test_leads t WHERE t.id = c.lead_id)
),
last_msg AS (
  SELECT DISTINCT ON (m.conversation_id) m.conversation_id, m.source, m.sent_at
  FROM public.conversation_messages m
  JOIN monitored mo ON mo.id = m.conversation_id
  ORDER BY m.conversation_id, m.sent_at DESC, m.id DESC
),
last_human AS (
  SELECT m.conversation_id, max(m.sent_at) AS sent_at
  FROM public.conversation_messages m
  JOIN monitored mo ON mo.id = m.conversation_id
  WHERE m.source = 'human'
  GROUP BY m.conversation_id
),
awaiting AS (
  SELECT mo.id, lm.sent_at
  FROM monitored mo
  JOIN last_msg lm ON lm.conversation_id = mo.id
  WHERE mo.state = 'active'
    AND NOT mo.is_handoff_to_human
    AND mo.ai_paused_until IS NULL
    AND lm.source = 'lead'
    AND lm.sent_at < now() - make_interval(hours => p_awaiting_hours)
),
handoff AS (
  SELECT mo.id, lm.sent_at
  FROM monitored mo
  JOIN last_msg lm ON lm.conversation_id = mo.id
  LEFT JOIN last_human lh ON lh.conversation_id = mo.id
  WHERE mo.is_handoff_to_human
    AND mo.phase_number <> 7
    AND lm.source IN ('lead', 'ai')
    AND (lh.sent_at IS NULL OR lh.sent_at < lm.sent_at)
    AND lm.sent_at < now() - make_interval(hours => p_handoff_hours)
),
stalls AS (
  SELECT mo.id, mo.channel_id, mo.direction, mo.phase_number, lm.sent_at
  FROM monitored mo
  JOIN last_msg lm ON lm.conversation_id = mo.id
  WHERE mo.state = 'active'
    AND NOT mo.is_handoff_to_human
    AND mo.ai_paused_until IS NULL
    AND mo.phase_number BETWEEN 1 AND 6
    AND lm.source = 'ai'
    AND lm.sent_at <= now() - make_interval(days => p_stall_days)
),
inbound_cand AS (
  SELECT mo.id, lm.sent_at
  FROM monitored mo
  JOIN last_msg lm ON lm.conversation_id = mo.id
  WHERE mo.state = 'active'
    AND mo.direction = 'inbound'
    AND mo.ai_paused_until = 'infinity'::timestamptz
    AND NOT mo.is_handoff_to_human
    AND lm.source = 'lead'
    AND NOT EXISTS (
      SELECT 1
      FROM public.conversation_labels cl
      JOIN public.tenant_labels tl ON tl.id = cl.label_id
      WHERE cl.conversation_id = mo.id
        AND lower(tl.name) = 'profesional'
    )
),
first_lead AS (
  SELECT DISTINCT ON (m.conversation_id) m.conversation_id, m.content, m.sent_at
  FROM public.conversation_messages m
  JOIN inbound_cand ic ON ic.id = m.conversation_id
  WHERE m.source = 'lead'
  ORDER BY m.conversation_id, m.sent_at ASC, m.id ASC
),
first_auto AS (
  SELECT fl.conversation_id, min(m.sent_at) AS sent_at
  FROM first_lead fl
  JOIN public.conversation_messages m
    ON m.conversation_id = fl.conversation_id
   AND m.source = 'system'
   AND m.sent_at >= fl.sent_at
  GROUP BY fl.conversation_id
)
SELECT jsonb_build_object(
  'computed_at', now(),
  'awaiting_reply', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'conversation_id', a.id,
             'last_message_at', a.sent_at
           ) ORDER BY a.sent_at, a.id)
    FROM awaiting a
  ), '[]'::jsonb),
  'handoff_unattended', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'conversation_id', h.id,
             'last_message_at', h.sent_at
           ) ORDER BY h.sent_at, h.id)
    FROM handoff h
  ), '[]'::jsonb),
  'stalls', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'conversation_id', s.id,
             'channel_id', s.channel_id,
             'direction', s.direction,
             'phase_number', s.phase_number,
             'last_message_at', s.sent_at
           ) ORDER BY s.sent_at, s.id)
    FROM stalls s
  ), '[]'::jsonb),
  'inbound_unattended', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
             'conversation_id', ic.id,
             'last_message_at', ic.sent_at,
             'first_lead_text', left(fl.content, 160),
             'first_lead_at', fl.sent_at,
             'first_auto_reply_at', fa.sent_at
           ) ORDER BY ic.sent_at, ic.id)
    FROM inbound_cand ic
    LEFT JOIN first_lead fl ON fl.conversation_id = ic.id
    LEFT JOIN first_auto fa ON fa.conversation_id = ic.id
  ), '[]'::jsonb)
);
$$;

COMMENT ON FUNCTION public.dashboard_alerts(bigint, integer, integer, integer) IS
  'Alertas de conversación del dashboard para un tenant: esperando respuesta, en manos de la entrenadora sin respuesta, sin respuesta de la persona (stalls) e inbound que la IA no atiende. Un jsonb con las cuatro listas y sus ids. Solo service_role; el panel aplica encima el filtro de apertura de palabra clave (lib/inbound-opening.ts).';

REVOKE EXECUTE ON FUNCTION public.dashboard_alerts(bigint, integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_alerts(bigint, integer, integer, integer) TO service_role;
