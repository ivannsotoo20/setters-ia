'use server';

import Anthropic from '@anthropic-ai/sdk';
import { getEffectiveTenant } from '@/lib/effective-tenant';
import { getServiceRoleClient } from '@/lib/supabase/service-role';

/**
 * Genera el "Análisis del setter" on-demand desde el panel.
 *
 * Caso de uso: la conv está en handoff / pausada / aún no procesada y los 6
 * campos persistidos por el Generator (`current_context`, `emotion`, etc.)
 * están en NULL. El trainer abre el panel y aun así espera ver razonamiento.
 *
 * Llamamos Haiku con los últimos N mensajes y pedimos JSON estructurado.
 * **NO persiste** en BD — es lectura on-demand. El motor sigue siendo el
 * único que escribe en `conversations.{current_context,emotion,…}`.
 *
 * Coste: ~$0.0002 por análisis (250-400 tokens output con Haiku 4.5).
 * Auth: collaborator+ del tenant dueño de la conv. Viewer permitido (read-only).
 */

const HAIKU_MODEL = 'claude-haiku-4-5';
// Sprint coste 2026-05-16: bajado de 25 → 15 últimos mensajes. Los 15 más
// recientes capturan el estado actual del lead de sobra; conversaciones más
// largas solo añadían historia obsoleta que ya no influye en el razonamiento.
// Ahorro: ~40% del input por análisis.
const MAX_MESSAGES = 15;
const MAX_OUTPUT_TOKENS = 600;

export interface ConversationAnalysis {
  currentContext: string | null;
  emotion: string | null;
  problem: string | null;
  goal: string | null;
  urgency: string | null;
  nextAction: string | null;
  generalContext: string | null;
  generalMotivation: string | null;
}

export type AnalysisResult =
  | { ok: true; data: ConversationAnalysis; source: 'on_demand' }
  | { ok: false; error: string };

let cachedClient: Anthropic | null = null;
function getAnthropic(): Anthropic | null {
  // `?.trim()` defensivo: si una env var del sistema (Windows User Environment,
  // shell profile, etc.) define ANTHROPIC_API_KEY="" vacía, hereda con prioridad
  // sobre el .env.local y `!apiKey` debe filtrarla igualmente.
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return null;
  if (cachedClient) return cachedClient;
  cachedClient = new Anthropic({ apiKey });
  return cachedClient;
}

interface MsgRow {
  source: string;
  content: string | null;
  transcription: string | null;
  content_type: string;
  sent_at: string;
}

export async function analyzeConversationOnDemand(input: {
  conversationId: number;
}): Promise<AnalysisResult> {
  if (!Number.isFinite(input.conversationId) || input.conversationId <= 0) {
    return { ok: false, error: 'invalid conversationId' };
  }
  const eff = await getEffectiveTenant();
  if (!eff) return { ok: false, error: 'unauthenticated' };

  const supabase = getServiceRoleClient();

  // Tenant ownership check
  const { data: conv } = await supabase
    .from('conversations')
    .select('tenant_id, phase_number, is_handoff_to_human, handoff_cause, ai_paused_until')
    .eq('id', input.conversationId)
    .maybeSingle();
  if (!conv) return { ok: false, error: 'conversación no encontrada' };
  if (Number(conv.tenant_id) !== eff.tenantId && !eff.isAgencyAdmin) {
    return { ok: false, error: 'forbidden — wrong tenant' };
  }

  // Cargar últimos N mensajes (cronológico ASC para el contexto temporal claro)
  const { data: msgs, error: msgsErr } = await supabase
    .from('conversation_messages')
    .select('source, content, transcription, content_type, sent_at')
    .eq('conversation_id', input.conversationId)
    .order('sent_at', { ascending: false })
    .limit(MAX_MESSAGES);
  if (msgsErr) return { ok: false, error: msgsErr.message };
  const ordered: MsgRow[] = (msgs ?? []).slice().reverse() as MsgRow[];
  if (ordered.length === 0) {
    return { ok: false, error: 'sin mensajes para analizar' };
  }

  const anthropic = getAnthropic();
  if (!anthropic) {
    return { ok: false, error: 'ANTHROPIC_API_KEY missing in panel env' };
  }

  const transcript = formatTranscript(ordered);
  const stateContext = formatStateContext(conv as Record<string, unknown>);

  const systemPrompt = buildSystemPrompt();
  const userPrompt = `<estado_conversacion>
${stateContext}
</estado_conversacion>

<transcript>
${transcript}
</transcript>

Devuelve SOLO un objeto JSON válido con las 8 claves del schema. Sin markdown, sin explicación, sin texto antes ni después.`;

  try {
    // Prompt caching de Anthropic: el system prompt es estable (mismo texto
    // para todas las conversaciones), así que lo marcamos como cacheable. La
    // primera llamada en una ventana de 5 min paga input normal; las siguientes
    // re-usan el cache y pagan ~10% del coste de input.
    // Doc: https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
    const completion = await anthropic.messages.create({
      model: HAIKU_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: [
        {
          type: 'text',
          text: systemPrompt,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: userPrompt }],
    });

    const textBlock = completion.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return { ok: false, error: 'respuesta vacía de Claude' };
    }

    const parsed = parseAnalysisJson(textBlock.text);
    if (!parsed) {
      return { ok: false, error: 'no se pudo parsear el análisis (JSON inválido)' };
    }
    return { ok: true, data: parsed, source: 'on_demand' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `claude error: ${message}` };
  }
}

// =============================================================================
// Helpers
// =============================================================================

function buildSystemPrompt(): string {
  return `Eres un analista de conversaciones de venta consultiva. Recibes el transcript reciente de una conversación entre un lead y un setter (IA), y devuelves un análisis estructurado del estado actual del lead.

Tu salida es SIEMPRE un objeto JSON con estas 8 claves (todas strings, máximo 200 caracteres cada una, en español, NO uses null — si no tienes información sólida sobre algún campo, deja string vacío ""):

{
  "current_context": "Resumen 1-2 frases del momento actual de la conversación (qué se está hablando ahora mismo).",
  "emotion": "Estado emocional del lead inferido del lenguaje (ej: curiosidad, escepticismo, frustración, urgencia, entusiasmo).",
  "problem": "Problema o dolor concreto del lead, si se ha verbalizado. Si no, deduce el más probable de su contexto.",
  "goal": "Objetivo o resultado que busca el lead. Si no es claro, deduce uno razonable.",
  "urgency": "Nivel de urgencia y motivación temporal (alta/media/baja + por qué).",
  "next_action": "Acción concreta que debería tomar el setter en el próximo turno para hacer avanzar la conversación.",
  "general_context": "Resumen general del perfil del lead (sector, tamaño, situación) en 1 frase.",
  "general_motivation": "Motivación profunda / por qué fundamental del lead, más allá del problema inmediato."
}

REGLAS:
- Español neutro, conciso, profesional.
- No inventes datos: si el transcript no menciona el sector o tamaño, dilo de forma general ("PYME no especificada", "rol no aclarado").
- No copies frases literales del lead — destila la esencia.
- NO uses markdown, NO uses \\n, NO devuelvas null. String vacío si no aplica.
- NO añadas comentarios fuera del JSON.`;
}

function formatTranscript(msgs: MsgRow[]): string {
  return msgs
    .map((m) => {
      const role = labelForSource(m.source);
      const text =
        m.content?.trim() || m.transcription?.trim() || `[${m.content_type}]`;
      const time = formatShortTime(m.sent_at);
      return `[${time}] ${role}: ${text}`;
    })
    .join('\n');
}

function labelForSource(source: string): string {
  if (source === 'lead') return 'LEAD';
  if (source === 'ai') return 'SETTER';
  if (source === 'human') return 'TRAINER';
  if (source === 'system') return 'SISTEMA';
  return source.toUpperCase();
}

function formatStateContext(conv: Record<string, unknown>): string {
  const phase = conv.phase_number;
  const handoff = conv.is_handoff_to_human === true;
  const cause = (conv.handoff_cause as string | null) ?? null;
  const paused = conv.ai_paused_until != null;
  const parts: string[] = [`Fase actual: F${phase ?? '?'}`];
  if (handoff) parts.push(`Handoff activo${cause ? ` (causa: ${cause})` : ''}`);
  if (paused) parts.push('IA pausada manualmente');
  return parts.join(' · ');
}

function formatShortTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function parseAnalysisJson(raw: string): ConversationAnalysis | null {
  // Claude a veces envuelve en ```json ... ``` o añade texto. Sacamos el primer {...} válido.
  const trimmed = raw.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  const jsonStr = trimmed.slice(start, end + 1);
  try {
    const obj = JSON.parse(jsonStr) as Record<string, unknown>;
    const pick = (key: string): string | null => {
      const v = obj[key];
      if (typeof v !== 'string') return null;
      const trimmedV = v.trim();
      return trimmedV.length > 0 ? trimmedV.slice(0, 300) : null;
    };
    return {
      currentContext: pick('current_context'),
      emotion: pick('emotion'),
      problem: pick('problem'),
      goal: pick('goal'),
      urgency: pick('urgency'),
      nextAction: pick('next_action'),
      generalContext: pick('general_context'),
      generalMotivation: pick('general_motivation'),
    };
  } catch {
    return null;
  }
}
