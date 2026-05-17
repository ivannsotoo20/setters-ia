import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { runPipeline, loadConversationHistory } from '@fyzon/agent-pipeline';
import { env } from '../config/env.js';
import { isAiPausedFromDb } from '../lib/ai-pause.js';
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
import { applySystemLabels } from './labels/index.js';
import { loadAvailableSlots, type AvailableSlot } from './load-available-slots.js';
import { loadGhlClientByTenant } from '../lib/load-ghl-client.js';
import { bookAppointmentFromSlot } from './book-appointment-from-slot.js';
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
    .select(
      'id, tenant_id, lead_id, channel_id, phase_number, state, ai_paused_until, conversation_source',
    )
    .eq('id', conversationId)
    .maybeSingle();
  if (convErr) throw new Error(`processDebounced: ${convErr.message}`);
  if (!conv) throw new Error(`processDebounced: conversation ${conversationId} not found`);
  const tenantId = Number(conv.tenant_id);
  const channelId = Number(conv.channel_id);
  const currentPhase = Number(conv.phase_number) || 1;

  // 1.5. Gate: si IA está pausada (humano se hizo cargo via OutboundMessage GHL
  // sin ZWSP, pausa manual desde panel, o gate `ghl_inbound_mode=classified_only`
  // por conversación sin source clasificada), no ejecutar pipeline.
  //
  // Bug fix (2026-05-12): usar `isAiPausedFromDb` que maneja correctamente el
  // string literal `'infinity'` que PostgreSQL devuelve. Antes `new Date('infinity')`
  // daba Invalid Date (NaN) → la pausa se ignoraba silenciosamente → IA seguía
  // respondiendo aunque conversaciones tuvieran ai_paused_until='infinity'.
  const rawPausedUntil = (conv.ai_paused_until as string | null | undefined) ?? null;
  if (isAiPausedFromDb(rawPausedUntil)) {
    return {
      conversationId,
      scheduleIds: [],
      parts: [],
      totalCostUsd: 0,
      totalLatencyMs: 0,
      pipelineStatus: 'skipped',
      phase: currentPhase,
      skipped: true,
      reason: `IA pausada (ai_paused_until=${rawPausedUntil}) — humano se hizo cargo o conv sin source clasificada`,
    };
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
  // Hito 10 — Construir URL trackable del calendario default antes del pipeline.
  // Si no hay calendar vinculado o falla, composer cae al closingResourceUrl legacy.
  let trackedCalendarUrl: string | null = null;
  try {
    const { getTrackedCalendarUrl } = await import('./tracked-calendar-url.js');
    trackedCalendarUrl = await getTrackedCalendarUrl({
      supabase,
      tenantId,
      leadId: Number(lead.id),
    });
  } catch (err) {
    console.warn(
      'processDebounced: getTrackedCalendarUrl failed (non-fatal):',
      err instanceof Error ? err.message : String(err),
    );
  }

  // Hito 10.6 — Cargar slots disponibles del calendar para API booking.
  // Solo si tenant tiene flag useApiBooking=true en preferences y conv está
  // cerca del booking (F5+). Si no hay calendar, GHL falla o no hay slots →
  // availableSlots queda null y el composer cae al fallback del placeholder
  // (= el bot improvisa con el flow legacy de URL widget).
  let availableSlots: AvailableSlot[] | null = null;
  let ghlClient: Awaited<ReturnType<typeof loadGhlClientByTenant>> = null;
  const useApiBooking = await loadUseApiBookingFlag(supabase, tenantId);
  if (useApiBooking) {
    ghlClient = await loadGhlClientByTenant(supabase, tenantId);
    // Fix Hito 10.6.1 — cargar slots SIEMPRE que el flag esté on. El LLM puede
    // hacer fast-track de F1→F6/F7 si el lead pide agenda rápido; necesita los
    // slots disponibles desde el primer turno para no caer al flow legacy URL.
    if (ghlClient) {
      try {
        availableSlots = await loadAvailableSlots({
          supabase,
          ghlClient,
          tenantId,
        });
      } catch (err) {
        console.warn(
          'processDebounced: loadAvailableSlots failed (non-fatal):',
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  // Hito 10.6.1 — Pasar fecha actual + estado contacto del lead al composer.
  // El LLM las usa en fase_6_v4 para (a) no decir "mañana" sin verificar y
  // (b) pedir email/nombre al lead antes de proponer slots.
  const currentDateIso = new Date().toISOString().slice(0, 10);
  const leadContact = {
    firstName: ((lead.first_name as string | null | undefined) ?? null) || null,
    email: ((lead.email as string | null | undefined) ?? null) || null,
  };

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
        composeOverrides: {
          trackedCalendarUrl,
          availableSlots,
          currentDateIso,
          leadContact,
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

  // 7.4. Hito 10.6.1 — Captura email/nombre del lead que el setter haya
  //      identificado en este turno. Persiste a leads.email/first_name y
  //      sincroniza al contacto GHL (updateContact) para que GHL pueda mandar
  //      la confirmación de cita al lead cuando se cree (paso 7.5).
  const capturedEmail = pipelineOut.generator.setterOutput.captured_lead_email;
  const capturedName = pipelineOut.generator.setterOutput.captured_lead_name;
  let leadEmailForBooking = leadContact.email;
  let leadNameForBooking = leadContact.firstName;
  if (typeof capturedEmail === 'string' && capturedEmail.trim() !== '') {
    const emailNorm = capturedEmail.trim().toLowerCase();
    // Validación email mínima
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) {
      try {
        await supabase
          .from('leads')
          .update({ email: emailNorm })
          .eq('id', Number(lead.id))
          .eq('tenant_id', tenantId);
        leadEmailForBooking = emailNorm;
        console.log(`[capture-contact] conv=${conversationId} email actualizado a ${emailNorm}`);
      } catch (err) {
        console.warn(
          `[capture-contact] conv=${conversationId} update email failed:`,
          err instanceof Error ? err.message : String(err),
        );
      }
    } else {
      console.warn(`[capture-contact] conv=${conversationId} email malformado: "${emailNorm}"`);
    }
  }
  if (typeof capturedName === 'string' && capturedName.trim() !== '') {
    const nameNorm = capturedName.trim().slice(0, 100);
    try {
      await supabase
        .from('leads')
        .update({ first_name: nameNorm })
        .eq('id', Number(lead.id))
        .eq('tenant_id', tenantId);
      leadNameForBooking = nameNorm;
      console.log(`[capture-contact] conv=${conversationId} first_name actualizado a "${nameNorm}"`);
    } catch (err) {
      console.warn(
        `[capture-contact] conv=${conversationId} update first_name failed:`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  // 7.5. Hito 10.6 — API Booking action: si el setter rellenó proposed_booking_slot
  //      Y el tenant tiene useApiBooking=true, reservar la cita en GHL vía API.
  //      Best-effort: si falla (slot conflict, GHL down, conv sin ghl_contact_id),
  //      log y continúa.
  const proposedSlot = pipelineOut.generator.setterOutput.proposed_booking_slot;
  let bookingSucceeded = false;
  if (useApiBooking && ghlClient && typeof proposedSlot === 'string' && proposedSlot.trim() !== '') {
    try {
      const tenantNameRow = await supabase
        .from('tenants')
        .select('name')
        .eq('id', tenantId)
        .maybeSingle();
      const result = await bookAppointmentFromSlot({
        supabase,
        ghlClient,
        tenantId,
        conversationId,
        slotIso: proposedSlot.trim(),
        // Usamos los valores actualizados (capturados en 7.4 o BD pre-turno)
        leadFirstName: leadNameForBooking,
        leadEmail: leadEmailForBooking,
        tenantName: (tenantNameRow.data?.name as string | null | undefined) ?? null,
      });
      if (!result.ok) {
        console.warn(
          `[api-booking] conv=${conversationId} slot=${proposedSlot} failed: ${result.reason}${result.error ? ` (${result.error})` : ''}`,
        );
      } else {
        bookingSucceeded = true;
        console.log(
          `[api-booking] conv=${conversationId} appointment=${result.appointmentId} movedToF7=${result.movedToF7}`,
        );
      }
    } catch (err) {
      console.error(
        `[api-booking] conv=${conversationId} unexpected error:`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  // 7.6. Hito 10.6.1 — Fix degradación handoff falso A_agenda.
  //      Si el LLM puso handoff='A_agenda' pero la cita NO se creó realmente
  //      (booking failed, o el LLM ni siquiera rellenó proposed_booking_slot),
  //      degradar el output: handoff_cause=null, status='active', phase a F5/F6
  //      (no F7). Razón: si dejamos handoff='A_agenda' y state='closed', el
  //      outbound-gate bloquea el envío del mensaje del bot ("Listo, te apunto...")
  //      y el lead se queda sin respuesta + la conv queda zombie en F7.
  //      Mejor: degradar para que la conv siga viva, el bot pueda re-proponer
  //      en el siguiente turno con slots reales.
  if (
    useApiBooking &&
    pipelineOut.generator.setterOutput.handoff_cause === 'A_agenda' &&
    !bookingSucceeded
  ) {
    console.warn(
      `[api-booking] conv=${conversationId} LLM marcó handoff=A_agenda pero booking NO succeed → degradando a active/F${Math.min(Math.max(currentPhase, 5), 6)}`,
    );
    pipelineOut.generator.setterOutput.handoff_cause = undefined;
    pipelineOut.generator.setterOutput.conversation_status = 'active';
    // Mantener phase mínimo en F5 (puente — el lead ya está cerca de agendar).
    // Si el LLM puso F7, bajamos a F6 (envío de enlace / proposing slots).
    if (pipelineOut.generator.setterOutput.phase_decision >= 7) {
      pipelineOut.generator.setterOutput.phase_decision = 6;
    }
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
  const generatorPhase = pipelineOut.generator.setterOutput.phase_decision;
  const convSource = (conv.conversation_source as string | null | undefined) ?? null;
  const newPhase = computeAutoPromotedPhase({
    currentPhase,
    generatorPhase,
    conversationSource: convSource,
  });
  if (newPhase !== generatorPhase) {
    console.log(
      `[auto-phase] conv=${conversationId} source=${convSource} generatorPhase=${generatorPhase} → F${newPhase}`,
    );
  }

  const newStatus = mapConversationStatus(pipelineOut.generator.setterOutput.conversation_status);
  const setterOut = pipelineOut.generator.setterOutput;
  // Razonamiento estructurado por turno — campos opcionales del Generator.
  // Si llegan como string, se persisten; si llegan undefined, no se tocan
  // (preservan valor anterior — solo el nuevo turno re-evalúa). Excepción:
  // current_context que se mapea desde user_summary y SIEMPRE se actualiza
  // (puede ser null si el LLM no devuelve user_summary).
  const reasoningUpdate: Record<string, string | null> = {
    current_context: typeof setterOut.user_summary === 'string' ? setterOut.user_summary : null,
  };
  if (typeof setterOut.emotion === 'string') reasoningUpdate.emotion = setterOut.emotion;
  if (typeof setterOut.problem === 'string') reasoningUpdate.problem = setterOut.problem;
  if (typeof setterOut.goal === 'string') reasoningUpdate.goal = setterOut.goal;
  if (typeof setterOut.urgency === 'string') reasoningUpdate.urgency = setterOut.urgency;
  if (typeof setterOut.next_action === 'string') reasoningUpdate.next_action = setterOut.next_action;
  if (typeof setterOut.general_context === 'string') {
    reasoningUpdate.general_context = setterOut.general_context;
  }
  if (typeof setterOut.general_motivation === 'string') {
    reasoningUpdate.general_motivation = setterOut.general_motivation;
  }

  // Bug fix 2026-05-16: `is_handoff_to_human` es NOT NULL en BD (default false).
  // El UPDATE intentaba poner `null` cuando conversation_status !== 'handoff', lo
  // que Postgres rechazaba con NOT NULL violation → el UPDATE ENTERO fallaba
  // silenciosamente (sin chequeo de error) → phase_number NO se actualizaba →
  // conversación quedaba bloqueada en F1 aunque computeAutoPromotedPhase calculara
  // F2. Detectado tras smoke real Hito 9 con lead 10016: 2 turnos IA, phase=1.
  // Fix: usar `false` explícito + chequear error del UPDATE y loguear (no fatal).
  const { error: updateErr } = await supabase
    .from('conversations')
    .update({
      phase_number: newPhase,
      state: newStatus,
      is_qualified:
        pipelineOut.generator.setterOutput.conversation_status === 'qualified' ? true : null,
      is_handoff_to_human:
        pipelineOut.generator.setterOutput.conversation_status === 'handoff',
      updated_at: new Date().toISOString(),
      ...reasoningUpdate,
    })
    .eq('id', conversationId);
  if (updateErr) {
    console.warn(
      `[process-debounced] UPDATE conversations conv=${conversationId} failed: ${updateErr.message}`,
    );
  }

  // 9.7. Sprint Eta — aplicar system labels (Hot Lead / Completado / Comprado)
  //      según el output del Generator. Best-effort: si falla, log warn pero
  //      no romper pipeline.
  try {
    const labelsRes = await applySystemLabels({
      supabase,
      tenantId,
      conversationId,
      generatorOutput: pipelineOut.generator.setterOutput,
    });
    if (labelsRes.errors.length > 0) {
      console.warn(
        `[labels] applySystemLabels conv=${conversationId} errors:`,
        labelsRes.errors,
      );
    }
  } catch (err) {
    console.warn(
      `[labels] applySystemLabels conv=${conversationId} threw: ${(err as Error).message}`,
    );
  }

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

/**
 * Sprint C (2026-05-12) — Auto-promotion F1→F2 cuando un lead responde a una
 * conv outbound clasificada (bienvenida / lm / inbound).
 *
 * Reglas:
 *  - Solo aplica si `conversationSource` está en `AUTO_PROMOTE_SOURCES`.
 *  - Solo si la fase actual es 1 (lead respondió a la bienvenida, aún no
 *    se progresó).
 *  - Respeta la decisión del Generator si ya sube más alto (≥2).
 *
 * El trigger DB `log_phase_change` (migration 025) registra automáticamente
 * el evento en `pipeline_events` con `source='motor'`, lo que alimenta las
 * métricas funnel `% bienvenidas convertidas` sin trabajo extra.
 */
export const AUTO_PROMOTE_SOURCES = new Set(['bienvenida', 'lm', 'inbound']);

export function computeAutoPromotedPhase(args: {
  currentPhase: number;
  generatorPhase: number;
  conversationSource: string | null | undefined;
}): number {
  const { currentPhase, generatorPhase, conversationSource } = args;
  if (!conversationSource || !AUTO_PROMOTE_SOURCES.has(conversationSource)) {
    return generatorPhase;
  }
  if (currentPhase !== 1) return generatorPhase;
  if (generatorPhase >= 2) return generatorPhase;
  return 2;
}

/**
 * Hito 10.6 — Lee `trainer_preferences.preferences.useApiBooking` (bool).
 * Default false (flow legacy de URL widget). Best-effort: si query falla,
 * devuelve false.
 */
async function loadUseApiBookingFlag(
  supabase: SupabaseClient,
  tenantId: number,
): Promise<boolean> {
  const { data } = await supabase
    .from('trainer_preferences')
    .select('preferences')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  const prefs = (data?.preferences ?? {}) as Record<string, unknown>;
  return prefs.useApiBooking === true;
}
