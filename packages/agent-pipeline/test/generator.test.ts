import { describe, it, expect, vi } from 'vitest';
import { runGenerator } from '../src/generator.js';

/**
 * Mock minimal de SupabaseClient: solo necesita responder a:
 *  - .from('prompt_blocks').select(...).eq(...).eq(...).or(...)  -> bloques
 *  - .from('llm_calls').insert(...).select('id').single()         -> id
 */
function makeFakeSupabase(opts: { promptBlocks: any[]; llmCallId?: number }) {
  return {
    from(table: string) {
      if (table === 'prompt_blocks') {
        const builder: any = {
          _filters: {},
          select() {
            return builder;
          },
          eq() {
            return builder;
          },
          or() {
            // ejecuta la query simulada
            return Promise.resolve({ data: opts.promptBlocks, error: null });
          },
        };
        return builder;
      }
      if (table === 'trainer_preferences') {
        // Sprint Gamma 2.6 — composePrompt ahora consulta trainer_preferences
        // para extraer trainerPhone e interpolarlo en handoff_v4. Mock devuelve
        // null (sin row) → ctx.phone=null → fallback en placeholders.
        const builder: any = {
          select() {
            return builder;
          },
          eq() {
            return builder;
          },
          maybeSingle() {
            return Promise.resolve({ data: opts.trainerPrefs ?? null, error: null });
          },
        };
        return builder;
      }
      if (table === 'llm_calls') {
        const builder: any = {
          insert() {
            return builder;
          },
          select() {
            return builder;
          },
          single() {
            return Promise.resolve({
              data: { id: opts.llmCallId ?? 999 },
              error: null,
            });
          },
        };
        return builder;
      }
      throw new Error(`fake supabase: unexpected table ${table}`);
    },
  } as any;
}

// Cerebro v5 — 2 bloques shared (consolidación de los 11 v4 anteriores) + coach_v5.
const FAKE_PROMPT_BLOCKS = [
  { block_key: 'core_v5_base', sort_order: 0, tenant_id: null, content: '[CORE V5]' },
  { block_key: 'coach_v5', sort_order: 5, tenant_id: 2, content: '[COACH PABLO]' },
  { block_key: 'output_contract_v5', sort_order: 100, tenant_id: null, content: '[OUTPUT CONTRACT]' },
];

describe('runGenerator', () => {
  it('builds the request, parses tool_use, calculates cost and logs llm_call', async () => {
    const fakeAnthropicResponse = {
      id: 'msg_x',
      stop_reason: 'tool_use',
      content: [
        {
          type: 'tool_use',
          id: 'tu_x',
          name: 'respond_as_setter',
          input: {
            message_raw: '¡Dale! ¿Y qué tipo de chamba haces?',
            conversation_status: 'active',
            phase_decision: 1,
            user_summary: 'Lead venezolano, primer contacto.',
            reasoning: 'F1, conexión inicial, pregunta sobre vida.',
          },
        },
      ],
      usage: {
        input_tokens: 50,
        cache_read_input_tokens: 14_000,
        cache_creation_input_tokens: 0,
        output_tokens: 80,
      },
    };

    const create = vi.fn().mockResolvedValue(fakeAnthropicResponse);
    const fakeAnthropic = { messages: { create } } as any;
    const fakeSupabase = makeFakeSupabase({ promptBlocks: FAKE_PROMPT_BLOCKS, llmCallId: 42 });

    const out = await runGenerator(
      { supabase: fakeSupabase, anthropic: fakeAnthropic },
      {
        tenantId: 2,
        conversationId: 7,
        userMessage: 'Hola, vengo del anuncio',
        currentPhase: 1,
        history: [],
      },
    );

    // Anthropic fue llamado con tool_choice forzado y system con cache
    expect(create).toHaveBeenCalledTimes(1);
    const callArg = create.mock.calls[0]![0];
    // Default cambió a Haiku 4.5 el 2026-05-07 (ver plan playful-petting-pine.md §3.5).
    expect(callArg.model).toBe('claude-haiku-4-5');
    expect(callArg.tool_choice).toEqual({ type: 'tool', name: 'respond_as_setter' });
    expect(Array.isArray(callArg.system)).toBe(true);
    expect(callArg.system.length).toBeGreaterThan(0);
    expect(callArg.messages).toEqual([
      { role: 'user', content: 'Hola, vengo del anuncio' },
    ]);

    // Output parseado
    expect(out.setterOutput.conversation_status).toBe('active');
    expect(out.setterOutput.phase_decision).toBe(1);
    expect(out.setterOutput.message_raw).toContain('chamba');

    // Usage + cost
    expect(out.usage.tokensInUncached).toBe(50);
    expect(out.usage.tokensInCacheRead).toBe(14_000);
    expect(out.usage.tokensOut).toBe(80);
    // Haiku 4.5: 50*1 + 14000*0.1 + 80*5 = 50 + 1400 + 400 = 1850 micro-USD = 0.00185
    expect(out.usage.costUsd).toBeCloseTo(0.00185, 5);
    expect(out.llmCallId).toBe(42);
  });

  it('throws when model does not return tool_use', async () => {
    const fakeAnthropicResponse = {
      id: 'msg_y',
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'no he usado tool' }],
      usage: { input_tokens: 10, output_tokens: 5 },
    };
    const create = vi.fn().mockResolvedValue(fakeAnthropicResponse);
    const fakeAnthropic = { messages: { create } } as any;
    const fakeSupabase = makeFakeSupabase({ promptBlocks: FAKE_PROMPT_BLOCKS });

    await expect(
      runGenerator(
        { supabase: fakeSupabase, anthropic: fakeAnthropic },
        {
          tenantId: 2,
          conversationId: 7,
          userMessage: 'Hola',
          currentPhase: 1,
          history: [],
        },
      ),
    ).rejects.toThrow(/did not return tool_use/);
  });

  it('passes history into messages array in correct order', async () => {
    const fakeAnthropicResponse = {
      id: 'msg_z',
      stop_reason: 'tool_use',
      content: [
        {
          type: 'tool_use',
          id: 'tu_z',
          name: 'respond_as_setter',
          input: {
            message_raw: 'okey',
            conversation_status: 'active',
            phase_decision: 2,
          },
        },
      ],
      usage: { input_tokens: 1, output_tokens: 1 },
    };
    const create = vi.fn().mockResolvedValue(fakeAnthropicResponse);
    const fakeAnthropic = { messages: { create } } as any;
    const fakeSupabase = makeFakeSupabase({ promptBlocks: FAKE_PROMPT_BLOCKS });

    await runGenerator(
      { supabase: fakeSupabase, anthropic: fakeAnthropic },
      {
        tenantId: 2,
        conversationId: 7,
        userMessage: '¿qué haces ahora de ejercicio?',
        currentPhase: 2,
        history: [
          { role: 'user', content: 'hola' },
          { role: 'assistant', content: '¿cómo va la chamba?' },
        ],
      },
    );

    const callArg = create.mock.calls[0]![0];
    expect(callArg.messages).toEqual([
      { role: 'user', content: 'hola' },
      { role: 'assistant', content: '¿cómo va la chamba?' },
      { role: 'user', content: '¿qué haces ahora de ejercicio?' },
    ]);
  });

  it('propagates anthropic API errors and logs them', async () => {
    const create = vi.fn().mockRejectedValue(new Error('rate_limit_error'));
    const fakeAnthropic = { messages: { create } } as any;
    const fakeSupabase = makeFakeSupabase({ promptBlocks: FAKE_PROMPT_BLOCKS });

    await expect(
      runGenerator(
        { supabase: fakeSupabase, anthropic: fakeAnthropic },
        {
          tenantId: 2,
          conversationId: 7,
          userMessage: 'hi',
          currentPhase: 1,
          history: [],
        },
      ),
    ).rejects.toThrow(/rate_limit_error/);
  });
});
