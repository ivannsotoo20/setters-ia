import { describe, it, expect, vi } from 'vitest';
import { runGenerator, validateSetterOutput } from '../src/generator.js';

/**
 * 2026-11-12 — Incidente del tenant 7 (conversación 15128): el modelo devolvía
 * un mensaje vacío sin handoff, el validador lo rechazaba DESPUÉS de que
 * Anthropic cobrara la llamada y ANTES de registrarla en `llm_calls`. El motor
 * reencolaba cada 30 s: ~5.200 llamadas pagadas e invisibles en tres días.
 */

const PROMPT_BLOCKS = [
  { block_key: 'core_v5_base', sort_order: 0, tenant_id: null, content: '[CORE V5]' },
  { block_key: 'coach_v5', sort_order: 5, tenant_id: 7, content: '[COACH]' },
  { block_key: 'output_contract_v5', sort_order: 100, tenant_id: null, content: '[CONTRACT]' },
];

function makeSupabase(inserted: any[]) {
  return {
    from(table: string) {
      if (table === 'prompt_blocks') {
        const b: any = {
          select: () => b,
          eq: () => b,
          or: () => Promise.resolve({ data: PROMPT_BLOCKS, error: null }),
        };
        return b;
      }
      if (table === 'trainer_preferences') {
        const b: any = {
          select: () => b,
          eq: () => b,
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        };
        return b;
      }
      if (table === 'llm_calls') {
        const b: any = {
          insert: (row: any) => {
            inserted.push(row);
            return b;
          },
          select: () => b,
          single: () => Promise.resolve({ data: { id: inserted.length }, error: null }),
        };
        return b;
      }
      throw new Error(`unexpected table ${table}`);
    },
  } as any;
}

function anthropicReturning(input: Record<string, unknown>) {
  const create = vi.fn().mockResolvedValue({
    id: 'msg',
    stop_reason: 'tool_use',
    content: [{ type: 'tool_use', id: 'tu', name: 'respond_as_setter', input }],
    usage: {
      input_tokens: 2_000,
      cache_read_input_tokens: 48_000,
      cache_creation_input_tokens: 0,
      output_tokens: 60,
    },
  });
  return { messages: { create } } as any;
}

const EMPTY_NO_HANDOFF = { message_raw: '', conversation_status: 'disqualified', phase_decision: 3 };

const baseInput = {
  tenantId: 7,
  conversationId: 15128,
  userMessage: 'Gracias 🫂',
  currentPhase: 3,
  history: [],
};

describe('runGenerator — lo que se cobra queda registrado', () => {
  it('una respuesta rechazada por el validador se registra como error CON su coste', async () => {
    const inserted: any[] = [];
    await expect(
      runGenerator(
        { supabase: makeSupabase(inserted), anthropic: anthropicReturning(EMPTY_NO_HANDOFF) },
        baseInput,
      ),
    ).rejects.toThrow(/apagado silencioso exige handoff; status=disqualified/);

    expect(inserted).toHaveLength(1);
    const row = inserted[0];
    expect(row.status).toBe('error');
    expect(row.conversation_id).toBe(15128);
    expect(row.tokens_in).toBe(50_000);
    expect(row.tokens_in_cached).toBe(48_000);
    expect(row.tokens_out).toBe(60);
    expect(row.cost).toBeGreaterThan(0);
    expect(row.error_message).toMatch(/message_raw/);
  });

  it('una respuesta sin tool_use también se registra con su coste', async () => {
    const inserted: any[] = [];
    const create = vi.fn().mockResolvedValue({
      id: 'msg',
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'sin tool' }],
      usage: { input_tokens: 1_000, output_tokens: 10 },
    });
    await expect(
      runGenerator(
        { supabase: makeSupabase(inserted), anthropic: { messages: { create } } as any },
        baseInput,
      ),
    ).rejects.toThrow(/did not return tool_use/);
    expect(inserted).toHaveLength(1);
    expect(inserted[0].status).toBe('error');
    expect(inserted[0].cost).toBeGreaterThan(0);
  });
});

describe('no contestar en una conversación cerrada', () => {
  it('con allowSilentNoReply, el vacío sin handoff es válido y se registra como éxito', async () => {
    const inserted: any[] = [];
    const out = await runGenerator(
      { supabase: makeSupabase(inserted), anthropic: anthropicReturning(EMPTY_NO_HANDOFF) },
      { ...baseInput, allowSilentNoReply: true },
    );
    expect(out.setterOutput.message_raw).toBe('');
    expect(out.setterOutput.conversation_status).toBe('disqualified');
    expect(inserted).toHaveLength(1);
    expect(inserted[0].status).toBe('success');
    expect(inserted[0].cost).toBeGreaterThan(0);
  });

  it('sin la opción (conversación abierta), el vacío sin handoff sigue siendo un error', () => {
    expect(() =>
      validateSetterOutput({ message_raw: '', conversation_status: 'active', phase_decision: 1 }),
    ).toThrow(/apagado silencioso exige handoff/);
  });

  it('la opción no relaja el resto de comprobaciones', () => {
    expect(() =>
      validateSetterOutput(
        { message_raw: '', conversation_status: 'inventado', phase_decision: 1 },
        { allowSilentNoReply: true },
      ),
    ).toThrow(/invalid conversation_status/);
  });
});
