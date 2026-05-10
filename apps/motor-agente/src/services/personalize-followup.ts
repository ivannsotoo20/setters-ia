import type { SupabaseClient } from '@supabase/supabase-js';
import type Anthropic from '@anthropic-ai/sdk';

/**
 * Sprint Iota.1.d + Iota.2 — Personalización IA del followup justo antes
 * de enviar (fallback motor cuando la pre-generación del panel no ocurrió).
 *
 * Flow normal: el panel pre-genera el mensaje al materializar el schedule.
 * El motor solo entra aquí si message es null (fallback).
 *
 * Cambios Iota.2:
 *  - Carga coach_v3 del tenant + ejemplos del trainer (followup_voice_examples)
 *    e inyecta en el system prompt para mantener consistencia de voz con
 *    el setter en tiempo real.
 *
 * Modelo: Haiku 4.5.
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
      .eq('block_key', 'coach_v3')
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
  try {
    const response = await input.anthropic.messages.create({
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

    const blocks = response.content;
    const textBlock = blocks.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return { ok: false, error: 'respuesta IA sin contenido text' };
    }

    let message = textBlock.text.trim();
    const startsWithQuote = /^["'“”‘’]/.test(message);
    const endsWithQuote = /["'“”‘’]$/.test(message);
    if (startsWithQuote && endsWithQuote) {
      message = message.slice(1, -1).trim();
    }
    message = message.replace(/^(mensaje|texto|message|text)\s*:\s*/i, '').trim();
    if (!message) return { ok: false, error: 'mensaje generado vacío' };
    if (message.length > 600) {
      message = message.slice(0, 597).trim() + '...';
    }

    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    const costUsd = (inputTokens / 1_000_000) * 1 + (outputTokens / 1_000_000) * 5;

    return { ok: true, message, costUsd };
  } catch (err) {
    return { ok: false, error: `Anthropic API: ${(err as Error).message}` };
  }
}
