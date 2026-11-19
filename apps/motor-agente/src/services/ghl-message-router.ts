/**
 * Router de mensajes GHL (Bloque C.3).
 *
 * Recibe payloads ya parseados (GhlParsedInbound / GhlParsedOutbound) y orquesta:
 *   - Inbound: crea/actualiza lead + conversation + INSERT message source='lead'
 *              + enqueue debounce (con respeto a ai_paused_until y salvo que el
 *              mensaje se escribiera hace más de GHL_STALE_INBOUND_MS).
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

import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Redis } from 'ioredis';
import type {
  GhlParsedInbound,
  GhlParsedOutbound,
} from '@fyzon/channel-adapters';
import { GhlClient } from '@fyzon/ghl-client';
import { enqueueDebounceOrDefer } from '../lib/debounce-buffer.js';
import { cancelSupersededAiTurn } from './supersede-ai-turn.js';
import { isAiPausedFromDb } from '../lib/ai-pause.js';
import { logger } from '../lib/logger.js';
import {
  getOrCreateChannel,
  getOrCreateConversation,
  insertWebhookMessageRows,
  providerMessageColumns,
  upsertLead,
} from './lead-ingest.js';
import { buildSourceTags, type TagChannel } from '../lib/source-tags.js';
import { recordUnmatchedOpening } from './unmatched-openings.js';
import { loadAutomationKeywords, matchKeyword } from './automation-keywords.js';
import {
  applyInboundIntentGate,
  parseInboundGateMode,
  type InboundGateMode,
} from './inbound-intent-gate.js';

/**
 * Escribe la procedencia como etiquetas en el contacto de GHL.
 *
 * Best-effort a propósito: si GHL falla o el token no tiene permiso de escritura,
 * se loguea y se sigue. Etiquetar es una comodidad para el CRM del trainer, y no
 * puede tumbar la conversación con el lead.
 */
async function tagGhlContact(args: {
  ghlClient: GhlClient | null;
  ghlContactId: string;
  source: string | null | undefined;
  matchedKeyword?: string | null;
  channel?: TagChannel | null;
  tenantId: number;
}): Promise<void> {
  const { ghlClient, ghlContactId, source, matchedKeyword, channel, tenantId } = args;
  if (!ghlClient || !ghlContactId) return;

  const tags = buildSourceTags({ source, matchedKeyword, channel });
  if (tags.length === 0) return;

  try {
    await ghlClient.addContactTags(ghlContactId, tags);
    logger.info({ tenantId, ghlContactId, tags }, 'tagGhlContact: etiquetas aplicadas');
  } catch (err) {
    logger.warn(
      {
        tenantId,
        ghlContactId,
        tags,
        err: err instanceof Error ? err.message : String(err),
      },
      'tagGhlContact: fallo al etiquetar (no fatal)',
    );
  }
}

// ============================================================================
// Palabras clave (automation_keywords) — viven en automation-keywords.ts
// desde 2026-11-04; se re-exportan para no mover a los importadores.
// ============================================================================

export {
  classifyByKeywords,
  classifyInboundOnly,
  loadAutomationKeywords,
  matchKeyword,
  matchesAnyKeyword,
  matchesKeywordPattern,
  normalizeForMatch,
  type AutomationKeywordRow,
} from './automation-keywords.js';

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
// Fecha de un mensaje de GHL
// ============================================================================

/**
 * Pasada esta edad, un mensaje entrante de GHL se guarda pero no despierta a la
 * IA. Solo llega tan tarde en un reintento (el de +22 h 53 m aún entra; los de
 * cada 24 h que vienen detrás, no), y contestarlo sería responder a algo de hace
 * días con la ventana de 24 h de Instagram cerrada: GHL rechaza el envío con un
 * 400. Va a la par que la ventana de la alerta de IA muda (24 h).
 */
export const GHL_STALE_INBOUND_MS = 24 * 60 * 60 * 1000;

/**
 * Cuándo se escribió un mensaje de GHL: lo que se guarda en `sent_at`.
 *
 * GHL reintenta un webhook fallido con el mismo messageId (+20 s, 45 s, 2 m,
 * 5 m, 15 m, 30 m, 1 h, 3 h, 6 h, 12 h y después cada 24 h) y su `timestamp` es
 * la hora de cada entrega. En el incidente del 17-20 oct, un mensaje escrito el
 * 17 se guardó con fecha del 20: parecía nuevo, despertaba a la IA y la alerta
 * de IA muda lo contaba como reciente. `dateAdded` no cambia entre reintentos;
 * `timestamp` queda de respaldo y la hora actual de último recurso. Una fecha
 * ilegible se salta y una futura se recorta a ahora: nada se escribe después de
 * llegarnos.
 */
export function ghlMessageSentAt(
  msg: { dateAdded: string | null; timestamp: string | null },
  nowMs: number = Date.now(),
): string {
  for (const candidate of [msg.dateAdded, msg.timestamp]) {
    const ms = candidate ? Date.parse(candidate) : Number.NaN;
    if (Number.isFinite(ms)) return new Date(Math.min(ms, nowMs)).toISOString();
  }
  return new Date(nowMs).toISOString();
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
  /**
   * Cliente Anthropic perezoso (`getAnthropicForTenant`): el gate de apertura
   * solo lo construye si el modo es `classified_or_intent` y el primer mensaje
   * necesita al modelo. Sin él, ese caso se pausa (fail-closed).
   */
  anthropic?: () => Promise<Anthropic>;
}

export interface RouteGhlInboundResult {
  conversationId: number;
  leadId: number;
  /** null si `duplicate`: otra entrega del mismo mensaje ya lo había guardado. */
  messageId: number | null;
  /** Con `duplicate` no se llega a mirar la pausa y vale false. */
  isAiPaused: boolean;
  /** El mensaje ya estaba guardado (carrera entre dos entregas): ni reglas ni debounce. */
  duplicate: boolean;
  /**
   * Escrito hace más de `GHL_STALE_INBOUND_MS` (lo trae un reintento tardío de
   * GHL): se guarda con su fecha, pero no se encola el debounce.
   */
  stale: boolean;
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

  // 4.7) Gate de apertura. Sprint B (Hito 9, 2026-05-12) + Iván (2026-05-25) +
  //      intención (2026-11-04, Tania). Solo actúa en el PRIMER mensaje de una
  //      conversación sin origen clasificado y sin pausa. Según el modo del
  //      tenant (`ghl_inbound_mode`): `all` no toca nada; `classified_only`
  //      clasifica `inbound` si casa una palabra clave de ese tipo y si no
  //      pausa; `classified_or_intent` además deja el botón y la palabra suelta
  //      sin palabra clave a su flujo de ManyChat y manda al modelo el mensaje
  //      de 4+ palabras (interés → IA; profesional/otro → pausa). La palabra
  //      clave `inbound` suelta activa la IA en los dos modos (Iván 4-nov).
  //      Todo queda escrito en BD (`conversation_source`
  //      o `ai_paused_until`): el paso 6 lee la pausa de ahí. Detalle y porqué en
  //      `inbound-intent-gate.ts`.
  const ghlInboundMode = await loadGhlInboundMode(supabase, inbound.tenantId);
  await applyInboundIntentGate({
    supabase,
    tenantId: inbound.tenantId,
    conversationId,
    channelId,
    mode: ghlInboundMode,
    text: inbound.message,
    provider: 'ghl',
    anthropic: ctx.anthropic,
    onClassifiedInbound: () =>
      tagGhlContact({
        ghlClient,
        ghlContactId: inbound.ghlContactId,
        source: 'inbound',
        channel: channelType as TagChannel,
        tenantId: inbound.tenantId,
      }),
  });

  // 5) INSERT conversation_messages source='lead'.
  //    El Workflow webhook puede pasar texto + attachments a la vez. Insertamos
  //    1 row por cada parte (1 text si no vacío, 1 por cada URL adjunta) para
  //    que el archivo histórico refleje exactamente lo que llegó. La pipeline
  //    multimodal vendrá en bloque dedicado — por ahora solo persistencia.
  //    `sent_at` es cuándo se escribió, no cuándo nos llegó (`ghlMessageSentAt`).
  const receivedAtMs = Date.now();
  const sentAt = ghlMessageSentAt(inbound, receivedAtMs);
  const ageMs = receivedAtMs - Date.parse(sentAt);
  const stale = ageMs > GHL_STALE_INBOUND_MS;
  const hasText = typeof inbound.message === 'string' && inbound.message.trim().length > 0;
  const attachments = inbound.attachments ?? [];

  //    2026-10-20 (migration 080): cada fila lleva el messageId de GHL como
  //    antiduplicado; la fila k>0 (adjuntos) con sufijo ':k'. La ruta ya
  //    descartó los reintentos con `findMessageByProviderId`; el ON CONFLICT
  //    de aquí cubre dos entregas simultáneas.
  const messageRows: Array<Record<string, unknown>> = [];
  if (hasText) {
    messageRows.push({
      tenant_id: inbound.tenantId,
      conversation_id: conversationId,
      source: 'lead',
      content_type: 'text',
      content: inbound.message,
      sent_at: sentAt,
      ...providerMessageColumns('ghl', inbound.ghlMessageId, messageRows.length),
    });
  }
  for (const url of attachments) {
    if (typeof url !== 'string' || url.trim().length === 0) continue;
    messageRows.push({
      tenant_id: inbound.tenantId,
      conversation_id: conversationId,
      source: 'lead',
      content_type: inferContentTypeFromUrl(url),
      content: null,
      media_url: url,
      sent_at: sentAt,
      ...providerMessageColumns('ghl', inbound.ghlMessageId, messageRows.length),
    });
  }

  if (messageRows.length === 0) {
    throw new Error(
      `routeGhlInbound: no text and no attachments — nothing to insert (contactId=${inbound.ghlContactId})`,
    );
  }

  let insertedIds: number[];
  try {
    const res = await insertWebhookMessageRows(supabase, messageRows);
    if (res.duplicate) {
      logger.info(
        { tenantId: inbound.tenantId, conversationId, ghlMessageId: inbound.ghlMessageId },
        'routeGhlInbound: mensaje ya guardado por otra entrega — sin reglas ni debounce',
      );
      return { conversationId, leadId, messageId: null, isAiPaused: false, duplicate: true, stale };
    }
    insertedIds = res.ids;
  } catch (err) {
    throw new Error(`routeGhlInbound: insert message failed: ${errMsg(err)}`);
  }
  const insertedId = insertedIds[0]!;

  if (attachments.length > 0) {
    logger.info(
      {
        tenantId: inbound.tenantId,
        conversationId,
        attachmentCount: attachments.length,
        contentTypes: messageRows
          .filter((r) => r.content_type !== 'text')
          .map((r) => r.content_type),
      },
      'routeGhlInbound: attachments persisted',
    );
  }

  // 5b) Sprint Eta — evaluar reglas text_contains/text_exact post-INSERT.
  //     Best-effort: si falla, log y seguimos.
  if (hasText) {
    try {
      const { evaluateTextRules } = await import('./labels/index.js');
      await evaluateTextRules({
        supabase,
        tenantId: Number(inbound.tenantId),
        conversationId,
        source: 'lead',
        body: String(inbound.message),
      });
    } catch (err) {
      logger.warn(
        { err, conversationId, tenantId: inbound.tenantId },
        'routeGhlInbound: evaluateTextRules failed (non-fatal)',
      );
    }
  }

  // 6) Verificar si IA está pausada en esta conversación.
  //    Bug fix (2026-05-12): usar `isAiPausedFromDb` que maneja correctamente
  //    `'infinity'` literal de PostgreSQL (antes `new Date('infinity')` daba
  //    Invalid Date y la pausa se ignoraba silenciosamente).
  const { data: convCheck } = await supabase
    .from('conversations')
    .select('ai_paused_until')
    .eq('id', conversationId)
    .maybeSingle();
  const rawPausedUntil = (convCheck?.ai_paused_until as string | null | undefined) ?? null;
  const isAiPaused = isAiPausedFromDb(rawPausedUntil);

  // 7) Enqueue debounce solo si IA NO está pausada y el mensaje no es viejo.
  //    El viejo queda en su sitio del historial (si la persona vuelve a
  //    escribir, la IA lo verá junto al nuevo), pero no se contesta aparte.
  if (stale) {
    logger.warn(
      {
        tenantId: inbound.tenantId,
        conversationId,
        ghlMessageId: inbound.ghlMessageId,
        sentAt,
        ageHours: Math.round(ageMs / 360_000) / 10,
        maxAgeHours: GHL_STALE_INBOUND_MS / 3_600_000,
      },
      'routeGhlInbound: mensaje viejo (reintento tardío de GHL) — guardado sin encolar debounce',
    );
  } else if (!isAiPaused) {
    // 2026-11-19 — Turno caducado: lo que la IA tenía programado y aún no ha
    // salido se cancela; el turno que encola este mensaje lo rehace con todo.
    await cancelSupersededAiTurn(supabase, conversationId);
    // Nunca lanza: si Redis no responde, se aplaza en memoria hasta que vuelva.
    await enqueueDebounceOrDefer(redis, conversationId, ctx.debounceWindowSeconds);
  } else {
    logger.info(
      { conversationId, tenantId: inbound.tenantId, pausedUntil: rawPausedUntil },
      'routeGhlInbound: IA pausada, no se encola debounce',
    );
  }

  return {
    conversationId,
    leadId,
    messageId: insertedId,
    isAiPaused,
    duplicate: false,
    stale,
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
  const matched = matchKeyword(outbound.message, keywords);
  const matchedType = matched?.type ?? null;

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
    const created = await createConversationFromOutbound({
      supabase,
      ghlClient,
      outbound,
      conversationSource: matchedType,
    });
    await tagGhlContact({
      ghlClient,
      ghlContactId: outbound.ghlContactId,
      source: matchedType,
      matchedKeyword: matched?.pattern ?? null,
      channel: outbound.channel as TagChannel,
      tenantId: outbound.tenantId,
    });
    return created;
  }

  // Caso B: matched keyword y sí hay conversación → setear conversation_source +
  // INSERT source='system' (auto-bienvenida/lm/inbound)
  //
  // 2026-09-12: NO se pisa un origen ya clasificado. Antes, la automatización que
  // contestaba con una palabra clave dentro de una conversación abierta con
  // bienvenida la reescribía como 'inbound' (18 casos en el tenant 7) y el panel
  // la contaba como si la persona hubiera escrito primero. La IA sigue activa
  // igual: lo que la despierta es que el origen no sea nulo, no su valor.
  if (matchedType && existing) {
    await supabase
      .from('conversations')
      .update({ conversation_source: matchedType, updated_at: new Date().toISOString() })
      .eq('id', existing.conversationId)
      .is('conversation_source', null);

    await insertOutboundMessageRow(supabase, outbound, {
      tenant_id: outbound.tenantId,
      conversation_id: existing.conversationId,
      source: 'system',
      content_type: 'text',
      content: outbound.message,
      sent_at: ghlMessageSentAt(outbound),
    });

    await tagGhlContact({
      ghlClient,
      ghlContactId: outbound.ghlContactId,
      source: matchedType,
      matchedKeyword: matched?.pattern ?? null,
      channel: outbound.channel as TagChannel,
      tenantId: outbound.tenantId,
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
    // No se crea conversación, pero el texto se guarda en `unmatched_openings`
    // para que la entrenadora lo vea en /keywords y lo dé de alta si es su
    // bienvenida. El log sigue por si la tabla aún no existe.
    logger.warn(
      {
        tenantId: outbound.tenantId,
        ghlContactId: outbound.ghlContactId,
        preview: String(outbound.message ?? '').slice(0, 80),
      },
      'routeGhlOutbound: outbound humano sin keyword match y sin conversación previa — skip',
    );
    await recordUnmatchedOpening(supabase, outbound, ghlMessageSentAt(outbound));
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

  await insertOutboundMessageRow(supabase, outbound, {
    tenant_id: outbound.tenantId,
    conversation_id: existing!.conversationId,
    source: 'human',
    content_type: 'text',
    content: outbound.message,
    sent_at: ghlMessageSentAt(outbound),
  });

  // Sprint Eta — evaluar reglas trigger_who='trainer'/'any' post-INSERT human.
  if (typeof outbound.message === 'string' && outbound.message.trim().length > 0) {
    try {
      const { evaluateTextRules } = await import('./labels/index.js');
      await evaluateTextRules({
        supabase,
        tenantId: Number(outbound.tenantId),
        conversationId: Number(existing!.conversationId),
        source: 'human',
        body: outbound.message,
      });
    } catch (err) {
      logger.warn(
        { err, conversationId: existing!.conversationId },
        'routeGhlOutbound caso D: evaluateTextRules failed (non-fatal)',
      );
    }
  }

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

  await insertOutboundMessageRow(supabase, outbound, {
    tenant_id: outbound.tenantId,
    conversation_id: conversationId,
    source: 'system',
    content_type: 'text',
    content: outbound.message,
    sent_at: ghlMessageSentAt(outbound),
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

/**
 * INSERT de la fila que deja un OutboundMessage (system o human). Como antes,
 * un fallo no corta el webhook, pero ahora queda en el log. Con el messageId de
 * GHL va con ON CONFLICT DO NOTHING (migration 080): un reintento que se cuele
 * a la vez que la entrega original no duplica la fila.
 */
async function insertOutboundMessageRow(
  supabase: SupabaseClient,
  outbound: GhlParsedOutbound,
  row: Record<string, unknown>,
): Promise<void> {
  try {
    await insertWebhookMessageRows(supabase, [
      { ...row, ...providerMessageColumns('ghl', outbound.ghlMessageId) },
    ]);
  } catch (err) {
    logger.warn(
      { tenantId: outbound.tenantId, ghlContactId: outbound.ghlContactId, err: errMsg(err) },
      'routeGhlOutbound: insert message failed (non-fatal)',
    );
  }
}

function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * Infiere `conversation_messages.content_type` de la extensión de un URL.
 *
 * GHL nos pasa URLs CDN tipo `https://media.gohighlevel.com/.../file.mp3`. El
 * sistema soporta los mismos buckets que YCloud: audio | image | video | file.
 *
 * Notas importantes:
 *   - IG DM voice notes vienen como `.mp4` (contenedor MPEG-4 con codec audio
 *     AAC). NO son videos. Por eso `.mp4` se mapea a `audio` por defecto:
 *     Whisper procesa el track de audio igual aunque sea un video real (caso
 *     <5%). Si Iván empieza a recibir muchos videos genuinos, añadiremos
 *     detección por mime-type del Content-Type del download.
 *   - `.mov` / `.webm` / `.mkv` / `.avi` quedan como `video` real porque IG no
 *     los usa para voice notes.
 *
 * Sin extensión clara → `file` (catch-all).
 */
export function inferContentTypeFromUrl(url: string): 'audio' | 'image' | 'video' | 'file' {
  if (typeof url !== 'string' || url.length === 0) return 'file';
  // Strip query string + fragment para ver la extensión real
  const path = url.split(/[?#]/)[0] ?? url;
  const lower = path.toLowerCase();
  // Audio (incluye .mp4 — IG manda voice notes en MPEG-4 contenedor)
  if (
    lower.endsWith('.mp3') ||
    lower.endsWith('.ogg') ||
    lower.endsWith('.wav') ||
    lower.endsWith('.m4a') ||
    lower.endsWith('.aac') ||
    lower.endsWith('.opus') ||
    lower.endsWith('.mp4')
  ) {
    return 'audio';
  }
  // Image
  if (
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg') ||
    lower.endsWith('.png') ||
    lower.endsWith('.webp') ||
    lower.endsWith('.gif') ||
    lower.endsWith('.heic') ||
    lower.endsWith('.heif')
  ) {
    return 'image';
  }
  // Video real (no contenedores ambiguos como mp4)
  if (
    lower.endsWith('.mov') ||
    lower.endsWith('.webm') ||
    lower.endsWith('.mkv') ||
    lower.endsWith('.avi')
  ) {
    return 'video';
  }
  return 'file';
}

// ============================================================================
// loadGhlInboundMode — gate de IA para inbound GHL (Sprint B, migration 039)
// ============================================================================

export type GhlInboundMode = InboundGateMode;

/**
 * Carga `tenant_configs.ghl_inbound_mode` para un tenant.
 *
 * Default `'classified_only'` (doctrina 2026-05-12): IA solo dispara si la
 * conversación tiene origen calificado (bienvenida, lm, inbound, manual).
 * `'classified_or_intent'` (2026-11-04, migración 084) añade el gate de
 * intención del primer mensaje; `'all'` es el escape legacy.
 *
 * Si la columna no existe (BD desactualizada) o el valor está fuera del enum,
 * devuelve 'classified_only' (fail-safe: doctrina actual por default).
 */
export async function loadGhlInboundMode(
  supabase: SupabaseClient,
  tenantId: number,
): Promise<GhlInboundMode> {
  const { data, error } = await supabase
    .from('tenant_configs')
    .select('ghl_inbound_mode')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (error) {
    logger.warn(
      { tenantId, err: error.message },
      'loadGhlInboundMode: error consultando tenant_configs — fallback classified_only',
    );
    return 'classified_only';
  }
  return parseInboundGateMode((data as { ghl_inbound_mode?: unknown } | null)?.ghl_inbound_mode);
}
