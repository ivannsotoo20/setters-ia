/**
 * Router de mensajes GHL (Bloque C.3).
 *
 * Recibe payloads ya parseados (GhlParsedInbound / GhlParsedOutbound) y orquesta:
 *   - Inbound: crea/actualiza lead + conversation + INSERT message source='lead'
 *              + enqueue debounce (con respeto a ai_paused_until).
 *   - Outbound: clasifica el origen via tabla automation_keywords + ZWSP detection.
 *               Si es IA propia (ZWSP) → no-op.
 *               Si es bienvenida/lm/inbound → INSERT source='system' + setea
 *               conversation_source.
 *               Si no matchea ninguno → mensaje humano → INSERT source='human'
 *               + UPDATE conversations.ai_paused_until = 'infinity'.
 *
 * Diseño:
 *   - Funciones puras (depend de supabase + redis + clients vía args).
 *   - El caller (route handler) maneja errores HTTP y responde al webhook.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Redis } from 'ioredis';
import type {
  GhlParsedInbound,
  GhlParsedOutbound,
} from '@fyzon/channel-adapters';
import { GhlClient } from '@fyzon/ghl-client';
import { enqueueDebounce } from '../lib/debounce-buffer.js';
import { logger } from '../lib/logger.js';
import {
  getOrCreateChannel,
  getOrCreateConversation,
  upsertLead,
} from './lead-ingest.js';

// ============================================================================
// loadAutomationKeywords
// ============================================================================

export interface AutomationKeywordRow {
  type: 'bienvenida' | 'lm' | 'inbound';
  pattern: string;
}

export async function loadAutomationKeywords(
  supabase: SupabaseClient,
  tenantId: number,
): Promise<AutomationKeywordRow[]> {
  const { data, error } = await supabase
    .from('automation_keywords')
    .select('type, pattern')
    .eq('tenant_id', tenantId)
    .eq('is_active', true);

  if (error) {
    logger.warn({ tenantId, err: error.message }, 'loadAutomationKeywords failed');
    return [];
  }
  if (!data) return [];
  return data
    .filter(
      (r): r is AutomationKeywordRow =>
        (r.type === 'bienvenida' || r.type === 'lm' || r.type === 'inbound') &&
        typeof r.pattern === 'string' &&
        r.pattern.length > 0,
    )
    .map((r) => ({ type: r.type, pattern: r.pattern }));
}

// ============================================================================
// classifyByKeywords (pure, exported for tests)
// ============================================================================

/**
 * Devuelve el primer tipo cuyo `pattern` aparece (case-insensitive, sin
 * espacios) dentro del `body`. Replica el comportamiento del flow legacy
 * `System - GHL - Bienvenidas a mano` switch.
 */
export function classifyByKeywords(
  body: string,
  keywords: AutomationKeywordRow[],
): 'bienvenida' | 'lm' | 'inbound' | null {
  if (!body || typeof body !== 'string') return null;
  const normalizedBody = normalizeForMatch(body);
  // Ordering: bienvenida > lm > inbound (mismo orden que el switch legacy)
  for (const type of ['bienvenida', 'lm', 'inbound'] as const) {
    const matches = keywords.filter((k) => k.type === type);
    for (const k of matches) {
      const normalizedPattern = normalizeForMatch(k.pattern);
      if (normalizedPattern.length > 0 && normalizedBody.includes(normalizedPattern)) {
        return type;
      }
    }
  }
  return null;
}

function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/\s+/g, '');
}

// ============================================================================
// findExistingConversationByContact
// ============================================================================

export async function findExistingConversationByContact(
  supabase: SupabaseClient,
  tenantId: number,
  ghlContactId: string,
): Promise<{ leadId: number; conversationId: number; channelId: number } | null> {
  const { data: lead } = await supabase
    .from('leads')
    .select('id, channel_id')
    .eq('tenant_id', tenantId)
    .eq('external_id', ghlContactId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!lead) return null;

  const { data: conv } = await supabase
    .from('conversations')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('lead_id', Number(lead.id))
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!conv) return null;

  return {
    leadId: Number(lead.id),
    conversationId: Number(conv.id),
    channelId: Number(lead.channel_id),
  };
}

// ============================================================================
// routeGhlInbound
// ============================================================================

export interface RouteGhlInboundContext {
  supabase: SupabaseClient;
  redis: Redis;
  ghlClient: GhlClient | null;
  inbound: GhlParsedInbound;
  debounceWindowSeconds: number;
}

export interface RouteGhlInboundResult {
  conversationId: number;
  leadId: number;
  messageId: number;
  isAiPaused: boolean;
}

export async function routeGhlInbound(
  ctx: RouteGhlInboundContext,
): Promise<RouteGhlInboundResult> {
  const { supabase, redis, ghlClient, inbound } = ctx;

  // 1) Resolver canal por (tenantId, channel_type, via_provider='ghl')
  const channelType = inbound.channel === 'instagram'
    ? 'instagram'
    : inbound.channel === 'facebook'
      ? 'facebook'
      : 'whatsapp';
  const { channelId } = await getOrCreateChannel({
    supabase,
    tenantId: inbound.tenantId,
    channelType,
    viaProvider: 'ghl',
  });

  // 2) Enriquecer con info GHL del contacto. Preferencia:
  //    a) Si el payload del webhook ya trae first_name/last_name (Workflow
  //       webhook format), usar esos directos — gratis.
  //    b) Si no, fetch GET /contacts/{id} via GhlClient (best-effort).
  const fromPayload = inbound.contactInfo;
  const fromApi =
    !fromPayload && ghlClient ? await tryGetContact(ghlClient, inbound.ghlContactId) : null;

  // 3) Upsert lead
  const { leadId } = await upsertLead({
    supabase,
    tenantId: inbound.tenantId,
    channelId,
    externalId: inbound.ghlContactId,
    firstName: fromPayload?.firstName ?? fromApi?.firstName ?? null,
    lastName: fromPayload?.lastName ?? fromApi?.lastName ?? null,
    phone: fromApi?.phone ?? null,
    email: fromApi?.email ?? null,
  });

  // 4) Get/create conversation
  const { conversationId } = await getOrCreateConversation({
    supabase,
    tenantId: inbound.tenantId,
    leadId,
    channelId,
  });

  // 4.5) Persistir ghl_contact_id + ghl_conversation_id si no están
  await maybeUpdateGhlIds(supabase, conversationId, inbound.ghlContactId, inbound.ghlConversationId);

  // 4.6) Si el Workflow GHL pasó `conversation_source` en customData, lo
  //      respetamos (override). Útil cuando el trainer arma una automation que
  //      ya clasificó el mensaje (ej: keyword "clase" → bienvenida).
  if (inbound.conversationSource) {
    await supabase
      .from('conversations')
      .update({
        conversation_source: inbound.conversationSource,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId);
  }

  // 5) INSERT conversation_messages source='lead'
  const { data: inserted, error: insertErr } = await supabase
    .from('conversation_messages')
    .insert({
      tenant_id: inbound.tenantId,
      conversation_id: conversationId,
      source: 'lead',
      content_type: 'text',
      content: inbound.message,
      sent_at: inbound.timestamp ?? new Date().toISOString(),
    })
    .select('id')
    .single();

  if (insertErr || !inserted) {
    throw new Error(`routeGhlInbound: insert message failed: ${insertErr?.message}`);
  }

  // 6) Verificar si IA está pausada en esta conversación
  const { data: convCheck } = await supabase
    .from('conversations')
    .select('ai_paused_until')
    .eq('id', conversationId)
    .maybeSingle();
  const pausedUntil = convCheck?.ai_paused_until ? new Date(convCheck.ai_paused_until) : null;
  const isAiPaused = pausedUntil !== null && pausedUntil.getTime() > Date.now();

  // 7) Enqueue debounce solo si IA NO está pausada
  if (!isAiPaused) {
    await enqueueDebounce(redis, conversationId, ctx.debounceWindowSeconds);
  } else {
    logger.info(
      { conversationId, tenantId: inbound.tenantId, pausedUntil: pausedUntil?.toISOString() },
      'routeGhlInbound: IA pausada, no se encola debounce',
    );
  }

  return {
    conversationId,
    leadId,
    messageId: Number(inserted.id),
    isAiPaused,
  };
}

// ============================================================================
// routeGhlOutbound
// ============================================================================

export interface RouteGhlOutboundContext {
  supabase: SupabaseClient;
  ghlClient: GhlClient | null;
  outbound: GhlParsedOutbound;
}

export type GhlOutboundClassification =
  | 'self_echo' // ZWSP → mensaje IA propio, no-op
  | 'bienvenida'
  | 'lm'
  | 'inbound'
  | 'manual_human'
  | 'no_conversation_skip'; // outbound humano sin conversación previa → no creamos

export interface RouteGhlOutboundResult {
  classification: GhlOutboundClassification;
  conversationId: number | null;
  isPaused: boolean;
}

export async function routeGhlOutbound(
  ctx: RouteGhlOutboundContext,
): Promise<RouteGhlOutboundResult> {
  const { supabase, ghlClient, outbound } = ctx;

  // 1) ZWSP detection — no-op si es la IA propia volviendo por el webhook
  if (outbound.isAiSelfEcho) {
    logger.debug(
      { tenantId: outbound.tenantId, ghlContactId: outbound.ghlContactId },
      'routeGhlOutbound: ZWSP detected — self echo, ignoring',
    );
    return { classification: 'self_echo', conversationId: null, isPaused: false };
  }

  // 2) Cargar keywords del tenant + clasificar
  const keywords = await loadAutomationKeywords(supabase, outbound.tenantId);
  const matchedType = classifyByKeywords(outbound.message, keywords);

  // 3) Resolver conversación local
  const existing = await findExistingConversationByContact(
    supabase,
    outbound.tenantId,
    outbound.ghlContactId,
  );

  // Caso A: matched keyword y NO hay conversación → crear lead+conv+message
  // (replica el comportamiento del flow legacy que arranca conversaciones a partir
  // de la bienvenida outbound del entrenador).
  if (matchedType && !existing) {
    return await createConversationFromOutbound({
      supabase,
      ghlClient,
      outbound,
      conversationSource: matchedType,
    });
  }

  // Caso B: matched keyword y sí hay conversación → setear conversation_source +
  // INSERT source='system' (auto-bienvenida/lm/inbound)
  if (matchedType && existing) {
    await supabase
      .from('conversations')
      .update({ conversation_source: matchedType, updated_at: new Date().toISOString() })
      .eq('id', existing.conversationId);

    await supabase.from('conversation_messages').insert({
      tenant_id: outbound.tenantId,
      conversation_id: existing.conversationId,
      source: 'system',
      content_type: 'text',
      content: outbound.message,
      sent_at: outbound.timestamp ?? new Date().toISOString(),
    });

    return {
      classification: matchedType,
      conversationId: existing.conversationId,
      isPaused: false,
    };
  }

  // Caso C: NO match keyword y NO hay conversación → caso raro (humano escribe
  // por primera vez sin que el lead haya iniciado y sin patrón de bienvenida).
  // Skipeamos para evitar ruido — cuando el lead responda, se crea normalmente.
  if (!matchedType && !existing) {
    logger.warn(
      { tenantId: outbound.tenantId, ghlContactId: outbound.ghlContactId },
      'routeGhlOutbound: outbound humano sin keyword match y sin conversación previa — skip',
    );
    return { classification: 'no_conversation_skip', conversationId: null, isPaused: false };
  }

  // Caso D: NO match keyword y SÍ hay conversación → mensaje humano genuino →
  // pausar IA + INSERT source='human'.
  await supabase
    .from('conversations')
    .update({
      ai_paused_until: 'infinity',
      conversation_source: existing!.conversationId
        ? undefined // mantener el actual
        : 'manual',
      updated_at: new Date().toISOString(),
    })
    .eq('id', existing!.conversationId);

  await supabase.from('conversation_messages').insert({
    tenant_id: outbound.tenantId,
    conversation_id: existing!.conversationId,
    source: 'human',
    content_type: 'text',
    content: outbound.message,
    sent_at: outbound.timestamp ?? new Date().toISOString(),
  });

  logger.info(
    { tenantId: outbound.tenantId, conversationId: existing!.conversationId },
    'routeGhlOutbound: mensaje humano detectado — IA pausada',
  );

  return {
    classification: 'manual_human',
    conversationId: existing!.conversationId,
    isPaused: true,
  };
}

// ============================================================================
// Helpers privados
// ============================================================================

async function tryGetContact(
  client: GhlClient,
  contactId: string,
): Promise<{ firstName?: string | null; lastName?: string | null; phone?: string | null; email?: string | null } | null> {
  try {
    const c = await client.getContactInfo(contactId);
    if (!c) return null;
    return {
      firstName: c.firstName ?? null,
      lastName: c.lastName ?? null,
      phone: c.phone ?? null,
      email: c.email ?? null,
    };
  } catch (err) {
    logger.warn({ contactId, err: errMsg(err) }, 'getContactInfo failed (best-effort)');
    return null;
  }
}

async function maybeUpdateGhlIds(
  supabase: SupabaseClient,
  conversationId: number,
  ghlContactId: string,
  ghlConversationId: string | null,
): Promise<void> {
  const update: Record<string, unknown> = {};
  // Solo seteamos si están NULL en BD (lectura previa)
  const { data: conv } = await supabase
    .from('conversations')
    .select('ghl_contact_id, ghl_conversation_id')
    .eq('id', conversationId)
    .maybeSingle();
  if (!conv) return;
  if (!conv.ghl_contact_id) update.ghl_contact_id = ghlContactId;
  if (!conv.ghl_conversation_id && ghlConversationId) update.ghl_conversation_id = ghlConversationId;
  if (Object.keys(update).length === 0) return;
  await supabase.from('conversations').update(update).eq('id', conversationId);
}

async function createConversationFromOutbound(args: {
  supabase: SupabaseClient;
  ghlClient: GhlClient | null;
  outbound: GhlParsedOutbound;
  conversationSource: 'bienvenida' | 'lm' | 'inbound';
}): Promise<RouteGhlOutboundResult> {
  const { supabase, ghlClient, outbound, conversationSource } = args;

  // Mismo channel resolution que en inbound
  const channelType =
    outbound.channel === 'instagram' ? 'instagram' : outbound.channel === 'facebook' ? 'facebook' : 'whatsapp';
  const { channelId } = await getOrCreateChannel({
    supabase,
    tenantId: outbound.tenantId,
    channelType,
    viaProvider: 'ghl',
  });

  const contactInfo = ghlClient ? await tryGetContact(ghlClient, outbound.ghlContactId) : null;

  const { leadId } = await upsertLead({
    supabase,
    tenantId: outbound.tenantId,
    channelId,
    externalId: outbound.ghlContactId,
    firstName: contactInfo?.firstName ?? null,
    lastName: contactInfo?.lastName ?? null,
    phone: contactInfo?.phone ?? null,
    email: contactInfo?.email ?? null,
  });

  const { conversationId } = await getOrCreateConversation({
    supabase,
    tenantId: outbound.tenantId,
    leadId,
    channelId,
  });

  await supabase
    .from('conversations')
    .update({
      conversation_source: conversationSource,
      direction: 'outbound',
      ghl_contact_id: outbound.ghlContactId,
      ghl_conversation_id: outbound.ghlConversationId ?? undefined,
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversationId);

  await supabase.from('conversation_messages').insert({
    tenant_id: outbound.tenantId,
    conversation_id: conversationId,
    source: 'system',
    content_type: 'text',
    content: outbound.message,
    sent_at: outbound.timestamp ?? new Date().toISOString(),
  });

  logger.info(
    { tenantId: outbound.tenantId, conversationId, conversationSource },
    'routeGhlOutbound: conversación creada desde outbound clasificado',
  );

  return {
    classification: conversationSource,
    conversationId,
    isPaused: false,
  };
}

function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
