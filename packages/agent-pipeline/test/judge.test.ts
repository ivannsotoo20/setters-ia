import { describe, it, expect, vi } from 'vitest';
import { runJudge, JUDGE_TOOL_NAME, judgeMessageTool, JUDGE_SYSTEM_PROMPT } from '../src/judge.js';

function makeFakeSupabase() {
  return {
    from(table: string) {
      const builder: any = {
        insert() {
          return builder;
        },
        select() {
          return builder;
        },
        single() {
          return Promise.resolve({ data: { id: 1 }, error: null });
        },
      };
      if (table === 'llm_calls') return builder;
      throw new Error(`unexpected table ${table}`);
    },
  } as any;
}

describe('runJudge', () => {
  it('returns pass and unchanged text when decision=pass', async () => {
    const create = vi.fn().mockResolvedValue({
      stop_reason: 'tool_use',
      content: [
        {
          type: 'tool_use',
          id: 't',
          name: JUDGE_TOOL_NAME,
          input: { decision: 'pass', violations: [] },
        },
      ],
      usage: { input_tokens: 100, output_tokens: 30 },
    });
    const fakeAnthropic = { messages: { create } } as any;

    const out = await runJudge(
      { supabase: makeFakeSupabase(), anthropic: fakeAnthropic },
      {
        messageRaw: '¿Cómo va la chamba?',
        currentPhase: 1,
        tenantId: 2,
        conversationId: 7,
      },
    );

    expect(out.decision).toBe('pass');
    expect(out.finalText).toBe('¿Cómo va la chamba?');
    expect(out.violations).toEqual([]);
  });

  it('returns fix with rewritten text when decision=fix', async () => {
    const create = vi.fn().mockResolvedValue({
      stop_reason: 'tool_use',
      content: [
        {
          type: 'tool_use',
          id: 't',
          name: JUDGE_TOOL_NAME,
          input: {
            decision: 'fix',
            fixed_text: '¿Cómo va la chamba?',
            violations: ['multi-pregunta'],
          },
        },
      ],
      usage: { input_tokens: 110, output_tokens: 25 },
    });
    const fakeAnthropic = { messages: { create } } as any;

    const out = await runJudge(
      { supabase: makeFakeSupabase(), anthropic: fakeAnthropic },
      {
        messageRaw: '¿Cómo va la chamba? ¿Y los chamos?',
        currentPhase: 1,
        tenantId: 2,
        conversationId: 7,
      },
    );

    expect(out.decision).toBe('fix');
    expect(out.finalText).toBe('¿Cómo va la chamba?');
    expect(out.violations).toContain('multi-pregunta');
  });

  it('throws when decision=fix but fixed_text is missing', async () => {
    const create = vi.fn().mockResolvedValue({
      stop_reason: 'tool_use',
      content: [
        {
          type: 'tool_use',
          id: 't',
          name: JUDGE_TOOL_NAME,
          input: { decision: 'fix', violations: ['x'] },
        },
      ],
      usage: { input_tokens: 50, output_tokens: 10 },
    });
    const fakeAnthropic = { messages: { create } } as any;
    await expect(
      runJudge(
        { supabase: makeFakeSupabase(), anthropic: fakeAnthropic },
        {
          messageRaw: 'algo',
          currentPhase: 1,
          tenantId: 2,
          conversationId: 7,
        },
      ),
    ).rejects.toThrow(/fixed_text is missing/);
  });

  it('throws on invalid decision value', async () => {
    const create = vi.fn().mockResolvedValue({
      stop_reason: 'tool_use',
      content: [
        {
          type: 'tool_use',
          id: 't',
          name: JUDGE_TOOL_NAME,
          input: { decision: 'maybe', violations: [] },
        },
      ],
      usage: { input_tokens: 50, output_tokens: 10 },
    });
    const fakeAnthropic = { messages: { create } } as any;
    await expect(
      runJudge(
        { supabase: makeFakeSupabase(), anthropic: fakeAnthropic },
        {
          messageRaw: 'algo',
          currentPhase: 1,
          tenantId: 2,
          conversationId: 7,
        },
      ),
    ).rejects.toThrow(/invalid decision/);
  });

  it('handles reject decision by returning it (caller decides what to do)', async () => {
    const create = vi.fn().mockResolvedValue({
      stop_reason: 'tool_use',
      content: [
        {
          type: 'tool_use',
          id: 't',
          name: JUDGE_TOOL_NAME,
          input: { decision: 'reject', violations: ['Reveló ser IA'] },
        },
      ],
      usage: { input_tokens: 100, output_tokens: 30 },
    });
    const fakeAnthropic = { messages: { create } } as any;
    const out = await runJudge(
      { supabase: makeFakeSupabase(), anthropic: fakeAnthropic },
      {
        messageRaw: 'Soy una IA',
        currentPhase: 1,
        tenantId: 2,
        conversationId: 7,
      },
    );
    expect(out.decision).toBe('reject');
    expect(out.violations).toContain('Reveló ser IA');
  });
});

describe('el Judge no inventa motivos de reject', () => {
  // Caso real (2026-08-24): una lead con dolor de rodilla, fuera del nicho de la
  // entrenadora. El setter emitio el cierre correcto y el Judge lo RECHAZO,
  // dejando a la lead sin ningun mensaje. Su razonamiento se contradecia solo:
  // "no viola ninguno de los 8 guardrails... pero marca como REJECT".
  //
  // La causa no estaba en el prompt sino en la DESCRIPCION de la tool, que
  // enumeraba "descualificacion silenciosa" como motivo de reject sin que
  // existiera entre los 8. El modelo obedecio al schema.
  it('la descripcion de la tool no nombra motivos que no esten en los 8 guardrails', () => {
    const desc = JSON.stringify(judgeMessageTool);
    expect(desc).not.toMatch(/descualificaci/i);
    // Los dos unicos motivos legitimos siguen nombrados.
    expect(desc.toLowerCase()).toContain('ia');
    expect(desc.toLowerCase()).toContain('precio');
  });

  it('el prompt dice explicitamente que descartar un lead no es motivo de bloqueo', () => {
    expect(JUDGE_SYSTEM_PROMPT).toMatch(/descarte a un lead que no encaja/i);
    expect(JUDGE_SYSTEM_PROMPT).toMatch(/SIN NINGUN mensaje/i);
  });
});
