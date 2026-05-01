import type { SupabaseClient } from '@supabase/supabase-js';
import type { ConversationMessage } from './types.js';

/**
 * Carga el historial de mensajes de una conversación desde `conversation_messages`,
 * lo limita a las últimas N filas y lo formatea para la Messages API.
 *
 * El último mensaje del lead (el que disparó este turno) se PASA POR SEPARADO
 * al `runGenerator` (no se incluye aquí — el caller decide qué considera "último").
 */
export async function loadConversationHistory(
  supabase: SupabaseClient,
  conversationId: number,
  options: { limit?: number; excludeMessageId?: number } = {},
): Promise<ConversationMessage[]> {
  const { limit = 60, excludeMessageId } = options;

  const { data, error } = await supabase
    .from('conversation_messages')
    .select('id, content, source, sent_at, content_type')
    .eq('conversation_id', conversationId)
    .order('sent_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`loadConversationHistory failed: ${error.message}`);
  }
  if (!data) return [];

  // Order asc por sent_at (la query trajo desc para LIMIT, ahora damos vuelta).
  const messages = [...data].reverse();

  const result: ConversationMessage[] = [];
  for (const m of messages) {
    if (excludeMessageId !== undefined && Number(m.id) === excludeMessageId) {
      continue;
    }
    if (m.content == null || String(m.content).trim() === '') {
      continue; // ignora mensajes vacíos (audios sin transcripción todavía)
    }
    const role: ConversationMessage['role'] = m.source === 'lead' ? 'user' : 'assistant';
    result.push({
      role,
      content: String(m.content),
      timestampMs: new Date(String(m.sent_at)).getTime(),
    });
  }

  return result;
}
