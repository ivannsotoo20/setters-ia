import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { runPipeline, loadConversationHistory } from '@fyzon/agent-pipeline';
import { env } from '../config/env.js';
import { enrichMediaMessages, type EnrichMediaResult } from './enrich-media-messages.js';
import {
  computeScheduledTimes,
  insertScheduledParts,
  loadTypingConfig,
} from './scheduler.js';
import {
  classifyPipelineError,
  completePipelineRun,
  failPipelineRun,
  startPipelineRun,
} from './pipeline-runs.js';
import { enqueueNotification } from './notify-trainer.js';
import type { NotificationEventType } from '../lib/email-templates.js';

type AudioLanguage = 'es' | 'en' | 'auto';

export interface ProcessDebouncedDeps {
  supabase: SupabaseClient;
  anthropic: Anthropic;
}

export interface ProcessDebouncedResult {
  conversationId: number;
  scheduleIds: number[];
  parts: string[];
  totalCostUsd: number;
  totalLatencyMs: number;
  pipelineStatus: string;
  phase: number;
  /** UUID del pipeline_run row asociado (Hardening 1.3). */
  correlationId?: string;
  /** True si nada que procesar (mensaje vacío o solo del bot). */
  skipped?: boolean;
  reason?: string;
}

/**
 * Carga la conversación + historial + integration_account, ejecuta el pipeline
 * 3-LLM y programa las partes resultantes en `message_schedules`.
 *
 * Diseño:
 *  - El "userMessage" del pipeline es la concatenación de TODOS los mensajes
 *    inbound del lead desde el último mensaje del bot (o desde el inicio si no
 *    hay outbound previo). Los unimos por `\n` para preservar contexto.
 *  - El historial son los mensajes anteriores a esos inbounds (lo que ya está
 *    "consolidado" en la conversación).
 */
export async function processDebounced(
  deps: ProcessDebouncedDeps,
  conversationId: number,
): Promise<ProcessDebouncedResult> {
  const { supabase, anthropic } = deps;

  // 1. Cargar conversación + tenant
  const { data: conv, error: convErr } = await supabase
    .from('conversations')
    .select('id, tenant_id, lead_id, channel_id, phase_number, state, ai_paused_until')
    .eq('id', conversationId)
    .maybeSingle();
  if (convErr) throw new Error(`processDebounced: ${convErr.message}`);
  if (!conv) throw new Error(`processDebounced: conversation ${conversationId} not found`);
  const tenantId = Number(conv.tenant_id);
  const channelId = Number(conv.channel_id);
  const currentPhase = Number(conv.phase_number) || 1;

  // 1.5. Gate: si IA está pausada (humano se hizo cargo via OutboundMessage GHL
  // sin ZWSP, o pausa manual desde el panel), no ejecutar pipeline.
  // ai_paused_until = NULL → IA activa. Fecha futura o 'infinity' → pausada.
  if (conv.ai_paused_until) {
    const pausedUntil = new Date(conv.ai_paused_until);
    if (Number.isFinite(pausedUntil.getTime()) && pausedUntil.getTime() > Date.now()) {
      return {
        conversationId,
        scheduleIds: [],
        parts: [],
        totalCostUsd: 0,
        totalLatencyMs: 0,
        pipelineStatus: 'skipped',
        phase: currentPhase,
        skipped: true,
        reason: `IA pausada hasta ${pausedUntil.toISOString()} (humano se hizo cargo)`,
      };
    }
  }

  // 2. Cargar lead (para subscriber_id externo, requerido por el outbound luego)
  const { data: lead, error: leadErr } = await supabase
    .from('leads')
    .select('id, external_id, first_name, last_name, phone, email')
    .eq('id', Number(conv.lead_id))
    .maybeSingle();
  if (leadErr) throw new Error(`processDebounced: lead lookup ${leadErr.message}`);
  if (!lead) throw new Error(`processDebounced: lead ${conv.lead_id} not found`);

  // 2.5. (Bloque C.5: removido) — el sync con GHL ya no se hace desde aquí.
  //      Cuando el lead viene via /webhook/ghl, los IDs (ghl_contact_id,
  //      ghl_conversation_id) se persisten directamente en routeGhlInbound.
  //      Cuando el motor envía una respuesta, GhlChannelAdapter publica via
  //      API GHL — no hay replicación posterior. Las columnas ghl_* en
  //      conversations se siguen poblando por el webhook receiver.

  // 3. Cargar integration_account ACTIVA del canal de esta conversación
  const { data: ia, error: iaErr } = await supabase
    .from('integration_accounts')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('channel_id', channelId)
    .eq('is_active', true)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (iaErr) throw new Error(`processDebounced: integration_account ${iaErr.message}`);
  if (!ia) {
    return {
      conversationId,
      scheduleIds: [],
      parts: [],
      totalCostUsd: 0,
      totalLatencyMs: 0,
      pipelineStatus: 'skipped',
      phase: currentPhase,
      skipped: true,
      reason: 'no integration_account active for channel',
    };
  }

  // 3.5. Cargar canal para conocer channel_type (whatsapp / instagram / facebook).
  // Lo necesita el Validator V0-V16 para reglas dependientes de canal.
  const { data: channel, error: channelErr } = await supabase
    .from('channels')
    .select('channel_type')
    .eq('id', channelId)
    .maybeSingle();
  if (channelErr) throw new Error(`processDebounced: channel lookup ${channelErr.message}`);
  const channelType = (channel?.channel_type as 'whatsapp' | 'instagram' | 'facebook' | undefined) ?? 'whatsapp';

  // 3.7. Bloque D — enriquecimiento multimodal: si hay rows del lead con
  //      `media_url` pero `content=NULL`, transcribir audios (Groq Whisper) y
  //      describir imágenes (Claude vision) ANTES de cargar historial. Tras
  //      esto, los rows quedan con `content` poblado y entran al pipeline
  //      como texto normal. Best-effort: si falla, persiste placeholder y
  //      el pipeline sigue.
  const audioLanguage = await loadAudioLanguage(supabase, tenantId);
  const mediaResult = await enrichMediaMessages({
    supabase,
    anthropic,
    conversationId,
    audioLanguage,
    groqApiKey: env.GROQ_API_KEY,
    groqApiBase: env.GROQ_API_BASE,
    groqAudioModel: env.GROQ_AUDIO_MODEL,
  });

  // 4. Cargar historial completo
  const allHistory = await loadConversationHistory(supabase, conversationId, { limit: 60 });
  if (allHistory.length === 0) {
    return {
      conversationId,
      scheduleIds: [],
      parts: [],
      totalCostUsd: 0,
      totalLatencyMs: 0,
      pipelineStatus: 'skipped',
      phase: currentPhase,
      skipped: true,
      reason: 'no messages in conversation',
    };
  }

  // 5. Separar: bloque inbound más reciente del lead vs historial previo.
  //    Encontramos el último mensaje del bot; todo lo que viene después es
  //    "el bloque del lead que dispara este turno".
  let lastAssistantIdx = -1;
  for (let i = allHistory.length - 1; i >= 0; i--) {
    if (allHistory[i]!.role === 'assistant') {
      lastAssistantIdx = i;
      break;
    }
  }
  const recentLeadMessages = allHistory.slice(lastAssistantIdx + 1).filter((m) => m.role === 'user');
  if (recentLeadMessages.length === 0) {
    // Solo hay mensajes del bot tras el último del lead → nada que procesar.
    return {
      conversationId,
      scheduleIds: [],
      parts: [],
      totalCostUsd: 0,
      totalLatencyMs: 0,
      pipelineStatus: 'skipped',
      phase: currentPhase,
      skipped: true,
      reason: 'no new lead messages since last assistant turn',
    };
  }
  const userMessage = recentLeadMessages.map((m) => m.content).join('\n');
  const historyForPipeline = allHistory.slice(0, lastAssistantIdx + 1);

  // 6. Abrir pipeline_run (Hardening 1.3 — observabilidad).
  //    INSERT inicial con outcome='in_progress'; UPDATE al final con métricas.
  //    Si Supabase falla aquí, run.id=0 y los UPDATE/fail siguientes son no-ops.
  const startedAtMs = Date.now();
  const run = await startPipelineRun(supabase, { tenantId, conversationId });

  // 7. Ejecutar pipeline 3-LLM
  // NOTA: coachSummary y emojisWhitelist se dejan a undefined/null para que
  // sean derivados del coach del tenant cuando exista la pieza que los extrae
  // del prompt_blocks (TODO post-Hito 9). Hoy el Judge funciona con sus
  // guardrails universales y el Validator usa defaults seguros sin whitelist.
  let pipelineOut;
  try {
    pipelineOut = await runPipeline(
      { supabase, anthropic },
      {
        tenantId,
        conversationId,
        userMessage,
        currentPhase,
        history: historyForPipeline,
        validationContext: {
          channel: channelType,
          emojisWhitelist: null,
          isFirstAssistantMessage: lastAssistantIdx < 0,
        },
      },
    );
  } catch (err) {
    await failPipelineRun(supabase, {
      id: run.id,
      startedAtMs,
      outcome: classifyPipelineError(err),
      error: err,
    });
    throw err;
  }

  // 8. Calcular tiempos y programar las partes
  const typingConfig = await loadTypingConfig(supabase, tenantId);
  const scheduledAt = computeScheduledTimes(pipelineOut.parts.length, typingConfig);
  const { ids } = await insertScheduledParts({
    supabase,
    tenantId,
    conversationId,
    integrationAccountId: Number(ia.id),
    parts: pipelineOut.parts,
    scheduledAt,
  });

  // 9. Actualizar fase de la conversación según el setter
  const newPhase = pipelineOut.generator.setterOutput.phase_decision;
  const newStatus = mapConversationStatus(pipelineOut.generator.setterOutput.conversation_status);
  await supabase
    .from('conversations')
    .update({
      phase_number: newPhase,
      state: newStatus,
      is_qualified:
        pipelineOut.generator.setterOutput.conversation_status === 'qualified' ? true : null,
      is_handoff_to_human:
        pipelineOut.generator.setterOutput.conversation_status === 'handoff' ? true : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversationId);

  // 9.5. Sprint Gamma 2.5 — encolar notificación al trainer si el evento es
  //      relevante (handoff/qualified/disqualified). El cron `notify-tick`
  //      cada 10s leerá la cola, comprobará si el trainer está suscrito,
  //      renderizará la plantilla y enviará via Resend. Best-effort: si
  //      enqueueNotification falla, log y seguimos (no rompemos el pipeline).
  const generatorStatus = pipelineOut.generator.setterOutput.conversation_status;
  const eventType = mapStatusToEventType(generatorStatus);
  if (eventType) {
    const enqueueRes = await enqueueNotification({
      supabase,
      tenantId,
      eventType,
      payload: {
        lead_id: Number(lead.id),
        first_name: lead.first_name ?? null,
        phone: lead.phone ?? null,
        conversation_id: conversationId,
        channel_type: channelType,
        correlation_id: run.correlationId,
      },
    });
    if (!enqueueRes.ok) {
      // No tirar — la notificación es best-effort. Siguiente turno podrá reintentar
      // si el trainer dispara otro evento.
      console.warn(
        `[notify] enqueueNotification failed for tenant=${tenantId} conv=${conversationId} event=${eventType}: ${enqueueRes.error}`,
      );
    }
  }

  // 10. Cerrar pipeline_run con éxito + métricas (incluye multimodal si hubo)
  await completePipelineRun(supabase, {
    id: run.id,
    output: pipelineOut,
    startedAtMs,
    multimodal: mediaResult,
  });

  return {
    conversationId,
    scheduleIds: ids,
    parts: pipelineOut.parts,
    totalCostUsd: pipelineOut.totals.costUsd + mediaResult.costUsd,
    totalLatencyMs: pipelineOut.totals.latencyMs,
    pipelineStatus: pipelineOut.generator.setterOutput.conversation_status,
    phase: newPhase,
    correlationId: run.correlationId,
  };
}

async function loadAudioLanguage(
  supabase: SupabaseClient,
  tenantId: number,
): Promise<AudioLanguage> {
  const { data } = await supabase
    .from('tenant_configs')
    .select('default_audio_language')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  const v = (data?.default_audio_language as string | undefined) ?? 'es';
  return v === 'en' || v === 'auto' ? v : 'es';
}

function mapConversationStatus(
  s: 'active' | 'qualified' | 'disqualified' | 'handoff' | 'paused',
): 'active' | 'paused' | 'stopped' | 'closed' {
  switch (s) {
    case 'active':
    case 'qualified':
      return 'active';
    case 'paused':
      return 'paused';
    case 'handoff':
      return 'closed'; // tras handoff, conversación cerrada en el bot
    case 'disqualified':
      return 'stopped';
  }
}

/**
 * Mapea el `conversation_status` del Generator al `event_type` de notificación
 * para email. Devuelve null si el status no merece email (active/paused son
 * estados de tránsito, no eventos accionables para el trainer).
 *
 * Nota: 'appointment_booked' no se dispara aquí — vendrá de un hook más
 * adelante cuando exista integración con el calendar booking del Generator.
 */
function mapStatusToEventType(
  s: 'active' | 'qualified' | 'disqualified' | 'handoff' | 'paused',
): NotificationEventType | null {
  switch (s) {
    case 'qualified':
      return 'qualified';
    case 'handoff':
      return 'handoff';
    case 'disqualified':
      return 'descalified';
    case 'active':
    case 'paused':
      return null;
  }
}
