/**
 * Turnos que dice el MOTOR, no el modelo (2026-11-19).
 *
 * Hay mensajes cuyo contenido decide la entrenadora y no puede depender de que
 * el modelo lo copie bien: el aviso de idiomas a quien escribe en uno que ella
 * no atiende, y la confirmación de una cita que el calendario ha registrado de
 * verdad (con su fecha, hora y zona). Aquí se programan como cualquier turno
 * (mismas burbujas, mismo "escribiendo") y se cierra el `pipeline_run` sin coste
 * de modelo, para que el panel y las métricas los vean.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PipelineOutput } from '@fyzon/agent-pipeline';
import { computeScheduledTimes, insertScheduledParts, loadTypingConfig } from './scheduler.js';
import { enqueueNotification } from './notify-trainer.js';

/** `PipelineOutput` mínimo de un turno sin modelo (para `completePipelineRun`). */
export function literalPipelineOutput(
  parts: string[],
  conversationStatus: 'active' | 'handoff' = 'active',
  phase = 1,
): PipelineOutput {
  return {
    parts,
    generator: {
      setterOutput: {
        message_raw: parts.join('\n\n'),
        conversation_status: conversationStatus,
        phase_decision: phase,
      },
      usage: { tokensIn: 0, tokensOut: 0, costUsd: 0 },
      model: 'literal',
    },
    judge: { decision: 'pass', violations: [] },
    validator: { ok: true, violations: [], finalText: parts.join('\n\n') },
    stages: [],
    totals: { costUsd: 0, latencyMs: 0, tokensInTotal: 0, tokensOutTotal: 0 },
  } as unknown as PipelineOutput;
}

/** Programa las burbujas de un turno literal con el mismo ritmo que un turno normal. */
export async function scheduleLiteralTurn(args: {
  supabase: SupabaseClient;
  tenantId: number;
  conversationId: number;
  integrationAccountId: number;
  parts: string[];
}): Promise<number[]> {
  const typingConfig = await loadTypingConfig(args.supabase, args.tenantId);
  const scheduledAt = computeScheduledTimes(args.parts.length, typingConfig);
  const { ids } = await insertScheduledParts({
    supabase: args.supabase,
    tenantId: args.tenantId,
    conversationId: args.conversationId,
    integrationAccountId: args.integrationAccountId,
    parts: args.parts,
    scheduledAt,
  });
  return ids;
}

/**
 * IA pausada + handoff + aviso a la entrenadora, sin mensaje a la persona. Mismo
 * aterrizaje que `landZoneCloseFailure` (y por lo mismo no toca `state`).
 * Best-effort: nunca lanza.
 */
export async function pauseAndNotifyTrainer(args: {
  supabase: SupabaseClient;
  tenantId: number;
  conversationId: number;
  lead: { id: number; firstName: string | null; phone: string | null };
  channelType: 'whatsapp' | 'instagram' | 'facebook';
  correlationId?: string;
  cause: string;
  logTag: string;
}): Promise<void> {
  const { supabase, tenantId, conversationId, lead } = args;
  const { error: updateErr } = await supabase
    .from('conversations')
    .update({
      ai_paused_until: 'infinity',
      is_handoff_to_human: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversationId)
    .eq('tenant_id', tenantId);
  if (updateErr) {
    console.warn(`${args.logTag} conv=${conversationId} pausa falló: ${updateErr.message}`);
  }
  try {
    const res = await enqueueNotification({
      supabase,
      tenantId,
      eventType: 'handoff',
      payload: {
        lead_id: lead.id,
        lead_first_name: lead.firstName,
        first_name: lead.firstName,
        lead_phone: lead.phone,
        phone: lead.phone,
        conversation_id: conversationId,
        channel_type: args.channelType,
        correlation_id: args.correlationId,
        handoff_cause: args.cause,
      },
    });
    if (!res.ok) console.warn(`${args.logTag} conv=${conversationId} aviso falló: ${res.error}`);
  } catch (err) {
    console.warn(
      `${args.logTag} conv=${conversationId} aviso lanzó: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
