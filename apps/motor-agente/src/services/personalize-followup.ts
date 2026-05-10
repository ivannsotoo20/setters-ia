import type { SupabaseClient } from '@supabase/supabase-js';
import type Anthropic from '@anthropic-ai/sdk';

/**
 * Sprint Iota.1 — Personalización IA del followup justo antes de enviar.
 *
 * Cuando outbound-sender procesa un schedule con `ai_personalize=true` y
 * `message=null`, llama a esta función para generar el mensaje contextual
 * usando los últimos 20 mensajes de la conv + datos del lead + ai_guide.
 *
 * Devuelve el mensaje generado. El caller actualiza el schedule.message
 * antes de enviarlo y luego ejecuta el provider send normal.
 *
 * Modelo: Haiku 4.5 (rápido, barato, suficiente para mensaje corto).
 */

const HAIKU_MODEL = 'claude-haiku-4-5';
const MAX_OUTPUT_TOKENS = 400;

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
  source: 'lead' | 'ai' | 'system';
  content: string | null;
  sent_at: string;
}

interface LeadInfo {
  first_name: string | null;
  last_name: string | null;
  username: string | null;
}

function buildSystemPrompt(): string {
  return `Eres un asistente de ventas que escribe followups personalizados en castellano para un lead que llevaba sin contestar a una conversación con un setter.

Tu tarea: redactar UN único mensaje (NO una conversación) basado en:
1. Una "guía" del trainer que indica qué quiere mensajear (tono, intención).
2. Los últimos mensajes de la conversación reciente.
3. El nombre y datos del lead.

Reglas estrictas:
- Devuelve SOLO el texto del mensaje, sin explicaciones ni envoltorio.
- Máximo 350 caracteres.
- Tono natural, cercano, español hispanohablante. NUNCA suene robotizado.
- Si la guía dice usar el nombre del lead y lo tienes, úsalo. Si no lo tienes, no inventes.
- Refiere algo CONCRETO de lo último hablado en la conversación (no genérico).
- NO uses comillas ni markdown.
- NO termines con "…" abrupto.
- NO menciones que eres IA.`;
}

function buildUserPrompt(input: {
  guide: string;
  lead: LeadInfo;
  recentMessages: ConvMessage[];
}): string {
  const leadName = input.lead.first_name?.trim() || input.lead.username?.trim() || null;
  const leadInfo = leadName
    ? `Nombre del lead: ${leadName}`
    : 'Nombre del lead: (no disponible — no inventes uno)';

  const transcript = input.recentMessages
    .filter((m) => m.content && m.content.trim().length > 0)
    .slice(-20)
    .map((m) => {
      const author = m.source === 'lead' ? 'LEAD' : m.source === 'ai' ? 'SETTER' : 'SISTEMA';
      return `[${author}] ${m.content}`;
    })
    .join('\n');

  return `${leadInfo}

Conversación reciente:
${transcript || '(sin mensajes previos)'}

Guía del trainer para este followup:
${input.guide}

Genera el mensaje:`;
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

  // 2. Cargar info del lead
  const { data: conv } = await input.supabase
    .from('conversations')
    .select('lead_id, leads(first_name, last_name, username)')
    .eq('id', input.conversationId)
    .maybeSingle();
  if (!conv) return { ok: false, error: 'conversación no encontrada' };

  const leadRel = conv.leads as LeadInfo | LeadInfo[] | null;
  const lead: LeadInfo = Array.isArray(leadRel)
    ? leadRel[0] ?? { first_name: null, last_name: null, username: null }
    : leadRel ?? { first_name: null, last_name: null, username: null };

  // 3. Llamada a Haiku
  try {
    const response = await input.anthropic.messages.create({
      model: HAIKU_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: buildSystemPrompt(),
      messages: [
        {
          role: 'user',
          content: buildUserPrompt({
            guide: input.aiGuide,
            lead,
            recentMessages,
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
    // Sanitizar: quitar comillas envolventes accidentales
    if (
      (message.startsWith('"') && message.endsWith('"')) ||
      (message.startsWith('"') && message.endsWith('"'))
    ) {
      message = message.slice(1, -1).trim();
    }
    if (!message) return { ok: false, error: 'mensaje generado vacío' };

    // Coste aprox Haiku 4.5: $1/MTok input + $5/MTok output
    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    const costUsd = (inputTokens / 1_000_000) * 1 + (outputTokens / 1_000_000) * 5;

    return { ok: true, message, costUsd };
  } catch (err) {
    return { ok: false, error: `Anthropic API: ${(err as Error).message}` };
  }
}
