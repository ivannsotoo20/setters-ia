import type { SupabaseClient } from '@supabase/supabase-js';
import type Anthropic from '@anthropic-ai/sdk';
import { calculateCostUsd, logLlmCall } from '@fyzon/agent-pipeline';

/**
 * Sprint Iota.1.d + Iota.2 — Personalización IA del followup justo antes
 * de enviar (fallback motor cuando la pre-generación del panel no ocurrió).
 *
 * Flow normal: el panel pre-genera el mensaje al materializar el schedule.
 * El motor solo entra aquí si message es null (fallback).
 *
 * Cambios Iota.2:
 *  - Carga coach_v5 del tenant + ejemplos del trainer (followup_voice_examples)
 *    e inyecta en el system prompt para mantener consistencia de voz con
 *    el setter en tiempo real.
 *
 * Modelo: Haiku 4.5.
 *
 * Registro en `llm_calls` (desde 2026-11-12): cada llamada deja una fila, con
 * éxito o con error. Va con la clave del tenant (`getAnthropicForTenant` en
 * `outbound-sender.ts`) y antes no quedaba rastro. El enum `llm_role` no tiene
 * valor propio; se usa `role='generator'` con
 * `request_payload.kind='followup_personalization'` para distinguirlo del
 * Generator del turno.
 */

const HAIKU_MODEL = 'claude-haiku-4-5';
const MAX_OUTPUT_TOKENS = 400;
const EARLY_CONV_THRESHOLD = 4;

export interface PersonalizeInput {
  supabase: SupabaseClient;
  anthropic: Anthropic;
  conversationId: number;
  aiGuide: string;
}

export interface PersonalizeResult {
  ok: true;
  message: string;
  costUsd: number;
}

export interface PersonalizeError {
  ok: false;
  error: string;
}

interface ConvMessage {
  source: 'lead' | 'ai' | 'system' | 'human';
  content: string | null;
  sent_at: string;
}

interface LeadInfo {
  first_name: string | null;
  last_name: string | null;
  username: string | null;
}

interface VoiceContext {
  coachBlock: string | null;
  trainerExamples: string | null;
}

const GENERIC_EXAMPLES = `Ejemplo 1 (inicio de conversación, lead llamado Iván que pidió info):
"Hola Iván, ¿pudiste echarle un ojo a lo que comentamos? Me gustaría retomar contigo cuando tengas un rato, ¿te encaja?"

Ejemplo 2 (conversación avanzada, lead habló de captación de leads y caos en el equipo):
"Iván, me quedé pensando en lo del caos con las cuatro personas gestionando los leads. ¿Has podido darle una vuelta o seguís igual?"

Ejemplo 3 (lead sin nombre conocido, inicio):
"Hola, ¿cómo lo llevas? Quería saber si te queda alguna duda sobre lo que comentamos para acabar de aclararte."

Ejemplo 4 (lead llamado Cristina, conversación sobre objetivos de pérdida de peso):
"Hola Cristina, ¿qué tal te ha ido la semana? Me acordé del objetivo que comentaste de los 5kg, ¿sigues queriendo darle?"`;

function buildSystemPrompt(voice: VoiceContext): string {
  const examplesBlock = voice.trainerExamples
    ? `Ejemplos de cómo escribe followups este setter (úsalos como referencia exacta de tono, ritmo y estructura):

${voice.trainerExamples}`
    : `Ejemplos de estilo correcto:

${GENERIC_EXAMPLES}`;

  const coachBlock = voice.coachBlock
    ? `

---
Estilo y voz del setter (heredado de su configuración general — RESPÉTALO al pie de la letra):

${voice.coachBlock}
---`
    : '';

  return `Eres un setter (responsable comercial) que escribe followups personalizados en castellano para reactivar a un lead que dejó de responder.

Tu misión: redactar UN único mensaje (NO una conversación) que invite al lead a retomar la conversación. El mensaje debe sentirse humano, cercano y natural.

Recibirás:
1. El nombre del lead (úsalo siempre que esté disponible).
2. Los últimos mensajes de la conversación entre el setter (tú) y el lead.
3. Una "guía" del trainer indicando la intención del followup.

Reglas estrictas:
- Devuelve SOLO el texto del mensaje. Sin explicaciones, sin comillas envolventes, sin etiquetas, sin markdown.
- Máximo 280 caracteres.
- Si tienes el nombre del lead, ÚSALO en el saludo (ej. "Hola, Iván," o "Iván, qué tal,"). Si no lo tienes, NO inventes uno — empieza con un saludo neutro como "Hola,".
- Tono natural, conversacional, español hispanohablante. NUNCA suene corporativo o robotizado.
- Refiere algo CONCRETO de lo último hablado (un dato, una pregunta abierta, un detalle del problema que mencionó). Nunca genérico.
- Si la conversación está al inicio (pocos mensajes del lead), retoma desde el contexto inicial sin asumir cosas.
- Si la conversación ya está avanzada, conecta con el último tema concreto.
- NO uses emojis a menos que el lead haya usado emojis primero.
- NO termines con "..." abrupto ni con interrogación encadenada ("¿quieres? ¿te interesa?").
- NO menciones que eres IA ni que es un seguimiento automático.
- Acaba con UNA pregunta abierta breve que invite a responder.${coachBlock}

${examplesBlock}`;
}

function buildUserPrompt(input: {
  guide: string;
  lead: LeadInfo;
  recentMessages: ConvMessage[];
  isEarlyConversation: boolean;
}): string {
  const leadName = input.lead.first_name?.trim() || input.lead.username?.trim() || null;
  const leadInfo = leadName
    ? `Nombre del lead: ${leadName} (úsalo en el saludo)`
    : 'Nombre del lead: (no disponible — usa saludo neutro tipo "Hola,")';

  const phaseHint = input.isEarlyConversation
    ? 'Fase de la conversación: INICIO (pocos mensajes del lead). Retoma desde el contexto inicial.'
    : 'Fase de la conversación: AVANZADA (ya hubo varios intercambios). Conecta con el último tema concreto.';

  const transcript = input.recentMessages
    .filter((m) => m.content && m.content.trim().length > 0)
    .slice(-20)
    .map((m) => {
      const author =
        m.source === 'lead'
          ? 'LEAD'
          : m.source === 'ai' || m.source === 'human'
            ? 'SETTER'
            : 'SISTEMA';
      return `[${author}] ${m.content}`;
    })
    .join('\n');

  return `${leadInfo}

${phaseHint}

Conversación reciente:
${transcript || '(sin mensajes previos — el lead solo escribió un saludo inicial sin contenido)'}

Guía del trainer para este followup:
${input.guide}

Genera el mensaje (solo el texto, sin envoltorios):`;
}

async function loadVoiceContext(
  supabase: SupabaseClient,
  tenantId: number,
): Promise<VoiceContext> {
  const [coachRes, cfgRes] = await Promise.all([
    supabase
      .from('prompt_blocks')
      .select('content')
      // Sprint Iota (2026-05-18) migró los coach a `coach_v5` y desactivó los
      // `coach_v3` (migration 059). Esta query se quedó en v3: desde entonces
      // devolvía siempre null y el followup del fallback salía SIN la voz del
      // trainer. El gemelo del panel (apps/panel/lib/personalize-followup.ts)
      // sí se migró, por eso solo se notaba en el camino de fallback.
      .eq('block_key', 'coach_v5')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .maybeSingle(),
    supabase
      .from('tenant_followup_config')
      .select('followup_voice_examples')
      .eq('tenant_id', tenantId)
      .maybeSingle(),
  ]);

  const coachBlock =
    typeof coachRes.data?.content === 'string' && coachRes.data.content.trim().length > 0
      ? coachRes.data.content.trim()
      : null;

  const examplesRaw = cfgRes.data?.followup_voice_examples;
  const trainerExamples =
    typeof examplesRaw === 'string' && examplesRaw.trim().length > 0
      ? examplesRaw.trim()
      : null;

  return { coachBlock, trainerExamples };
}

export async function personalizeFollowupMessage(
  input: PersonalizeInput,
): Promise<PersonalizeResult | PersonalizeError> {
  // 1. Cargar últimos 20 mensajes de la conv
  const { data: msgs, error: msgErr } = await input.supabase
    .from('conversation_messages')
    .select('source, content, sent_at')
    .eq('conversation_id', input.conversationId)
    .order('sent_at', { ascending: false })
    .limit(20);
  if (msgErr) return { ok: false, error: `load messages: ${msgErr.message}` };

  const recentMessages = (msgs ?? []).reverse() as ConvMessage[];

  // 2. Cargar info del lead + tenant_id
  const { data: conv } = await input.supabase
    .from('conversations')
    .select('lead_id, tenant_id, leads(first_name, last_name, username)')
    .eq('id', input.conversationId)
    .maybeSingle();
  if (!conv) return { ok: false, error: 'conversación no encontrada' };

  const leadRel = conv.leads as LeadInfo | LeadInfo[] | null;
  const lead: LeadInfo = Array.isArray(leadRel)
    ? leadRel[0] ?? { first_name: null, last_name: null, username: null }
    : leadRel ?? { first_name: null, last_name: null, username: null };

  const leadMsgCount = recentMessages.filter((m) => m.source === 'lead').length;
  const isEarlyConversation = leadMsgCount <= EARLY_CONV_THRESHOLD;

  // 3. Sprint Iota.2 — cargar voice context
  const voice = await loadVoiceContext(input.supabase, Number(conv.tenant_id));

  // 4. Llamada a Haiku
  const tenantId = Number(conv.tenant_id);
  const startedAt = Date.now();
  let response: Anthropic.Message;
  try {
    response = await input.anthropic.messages.create({
      model: HAIKU_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: buildSystemPrompt(voice),
      messages: [
        {
          role: 'user',
          content: buildUserPrompt({
            guide: input.aiGuide,
            lead,
            recentMessages,
            isEarlyConversation,
          }),
        },
      ],
    });
  } catch (err) {
    const error = `Anthropic API: ${(err as Error).message}`;
    await logFollowupCall(input, {
      tenantId,
      status: 'error',
      latencyMs: Date.now() - startedAt,
      inputTokens: 0,
      outputTokens: 0,
      errorMessage: error,
    });
    return { ok: false, error };
  }
  const latencyMs = Date.now() - startedAt;
  const inputTokens = response.usage?.input_tokens ?? 0;
  const outputTokens = response.usage?.output_tokens ?? 0;

  const blocks = response.content;
  const textBlock = blocks.find((b) => b.type === 'text');
  let message = textBlock && textBlock.type === 'text' ? textBlock.text.trim() : '';
  const startsWithQuote = /^["'“”‘’]/.test(message);
  const endsWithQuote = /["'“”‘’]$/.test(message);
  if (startsWithQuote && endsWithQuote) {
    message = message.slice(1, -1).trim();
  }
  message = message.replace(/^(mensaje|texto|message|text)\s*:\s*/i, '').trim();
  if (message.length > 600) {
    message = message.slice(0, 597).trim() + '...';
  }

  // La llamada se cobró aunque el texto no sirva: se registra en los dos casos.
  const error = !textBlock
    ? 'respuesta IA sin contenido text'
    : !message
      ? 'mensaje generado vacío'
      : null;
  const costUsd = await logFollowupCall(input, {
    tenantId,
    status: error ? 'error' : 'success',
    latencyMs,
    inputTokens,
    outputTokens,
    messageChars: message.length,
    errorMessage: error ?? undefined,
  });

  if (error) return { ok: false, error };
  return { ok: true, message, costUsd };
}

/**
 * Registro best-effort en `llm_calls`. Devuelve el coste calculado para que el
 * caller no lo recalcule. Nunca lanza: un fallo al registrar no puede tumbar el
 * envío del seguimiento.
 */
async function logFollowupCall(
  input: PersonalizeInput,
  p: {
    tenantId: number;
    status: 'success' | 'error';
    latencyMs: number;
    inputTokens: number;
    outputTokens: number;
    messageChars?: number;
    errorMessage?: string;
  },
): Promise<number> {
  const costUsd = calculateCostUsd({
    model: HAIKU_MODEL,
    tokensInUncached: p.inputTokens,
    tokensInCacheRead: 0,
    tokensInCacheWrite: 0,
    tokensOut: p.outputTokens,
  });
  try {
    await logLlmCall({
      supabase: input.supabase,
      tenantId: p.tenantId,
      conversationId: input.conversationId,
      role: 'generator',
      model: HAIKU_MODEL,
      status: p.status,
      usage: {
        tokensInUncached: p.inputTokens,
        tokensOut: p.outputTokens,
        costUsd,
        latencyMs: p.latencyMs,
      },
      errorMessage: p.errorMessage?.slice(0, 500),
      requestPayload: { kind: 'followup_personalization' },
      responsePayload: p.status === 'success' ? { message_chars: p.messageChars ?? 0 } : {},
    });
  } catch {
    // El registro nunca tumba el seguimiento.
  }
  return costUsd;
}
