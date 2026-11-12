import { describe, it, expect } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { enrichMediaMessages } from '../src/services/enrich-media-messages.js';
import { personalizeFollowupMessage } from '../src/services/personalize-followup.js';

/**
 * 2026-11-12 — dos llamadas a Anthropic con la clave del tenant no dejaban
 * rastro en `llm_calls`: la descripción de imágenes del lead y el seguimiento
 * personalizado de respaldo del motor. Al revisar unos cargos de la cuenta de
 * Tania no había forma de saber cuánto gastaban. Ahora las dos se registran,
 * también cuando fallan después de llamar al modelo.
 */

type Row = Record<string, unknown>;

function makeLlmCallsTable(inserted: Row[], opts: { fail?: boolean } = {}) {
  return {
    insert: (row: Row) => {
      inserted.push(row);
      return {
        select: () => ({
          single: () =>
            Promise.resolve(
              opts.fail
                ? { data: null, error: { message: 'insert denied' } }
                : { data: { id: inserted.length }, error: null },
            ),
        }),
      };
    },
  };
}

/** Supabase falso para el enriquecedor: filas pendientes + `llm_calls`. */
function makeEnrichSupabase(
  rows: Array<{ id: number; content_type: string; media_url: string; content: null }>,
  opts: { llmCallsFail?: boolean } = {},
) {
  const llmCalls: Row[] = [];
  const updates: Array<{ id: number; content: string }> = [];
  const sb: any = {
    llmCalls,
    updates,
    from(table: string) {
      if (table === 'llm_calls') return makeLlmCallsTable(llmCalls, { fail: opts.llmCallsFail });
      if (table !== 'conversation_messages') throw new Error(`tabla inesperada ${table}`);
      const q: any = {
        select: () => q,
        eq: () => q,
        not: () => q,
        or: () => q,
        order: () => q,
        limit: () => Promise.resolve({ data: rows, error: null }),
        update: (row: { content: string }) => ({
          eq: (_c: string, id: number) => {
            updates.push({ id, content: row.content });
            return Promise.resolve({ error: null });
          },
        }),
      };
      return q;
    },
  };
  return sb;
}

function imageFetch(status = 200): typeof fetch {
  return (async () =>
    status >= 400
      ? new Response(null, { status })
      : new Response(new Uint8Array([0xff, 0xd8, 0xff]), {
          status,
          headers: { 'content-type': 'image/jpeg' },
        })) as unknown as typeof fetch;
}

function anthropicReturning(
  result: { content: Array<{ type: 'text'; text: string }>; usage: { input_tokens: number; output_tokens: number } } | Error,
): Anthropic {
  return {
    messages: {
      create: async () => {
        if (result instanceof Error) throw result;
        return result;
      },
    },
  } as unknown as Anthropic;
}

const IMAGE_ROW = { id: 900, content_type: 'image', media_url: 'https://media/foto.jpg', content: null };

describe('enrichMediaMessages — registro de la descripción de imagen en llm_calls', () => {
  it('una imagen descrita deja una fila con tenant, conversación, modelo, tokens y coste', async () => {
    const sb = makeEnrichSupabase([IMAGE_ROW]);
    const r = await enrichMediaMessages({
      supabase: sb,
      anthropic: anthropicReturning({
        content: [{ type: 'text', text: 'Captura de una analítica.' }],
        usage: { input_tokens: 1500, output_tokens: 40 },
      }),
      tenantId: 7,
      conversationId: 12345,
      fetchImpl: imageFetch(),
    });

    expect(r.imageCount).toBe(1);
    expect(sb.llmCalls).toHaveLength(1);
    const row = sb.llmCalls[0]!;
    expect(row.tenant_id).toBe(7);
    expect(row.conversation_id).toBe(12345);
    expect(row.provider).toBe('anthropic');
    expect(row.model).toBe('claude-sonnet-5');
    expect(row.role).toBe('transcriber');
    expect(row.status).toBe('success');
    expect(row.tokens_in).toBe(1500);
    expect(row.tokens_out).toBe(40);
    // Sonnet 5: $2/M in + $10/M out
    const expected = (1500 * 2 + 40 * 10) / 1_000_000;
    expect(row.cost).toBeCloseTo(expected, 8);
    expect(r.costUsd).toBeCloseTo(expected, 8);
    expect(row.request_payload).toMatchObject({ kind: 'image_description', message_id: 900, media_type: 'image/jpeg' });
    expect(row.response_payload).toEqual({ description_chars: 'Captura de una analítica.'.length });
    // La descripción llegó a la fila del mensaje.
    expect(sb.updates[0]).toEqual({ id: 900, content: '[Imagen del lead]: Captura de una analítica.' });
  });

  it('si Anthropic falla, queda una fila de error y el mensaje recibe el placeholder', async () => {
    const sb = makeEnrichSupabase([IMAGE_ROW]);
    const r = await enrichMediaMessages({
      supabase: sb,
      anthropic: anthropicReturning(new Error('404 model not found')),
      tenantId: 7,
      conversationId: 12345,
      fetchImpl: imageFetch(),
    });

    expect(r.failedCount).toBe(1);
    expect(sb.llmCalls).toHaveLength(1);
    const row = sb.llmCalls[0]!;
    expect(row.status).toBe('error');
    expect(row.role).toBe('transcriber');
    expect(row.model).toBe('claude-sonnet-5');
    expect(String(row.error_message)).toContain('anthropic_error');
    expect(String(row.error_message)).toContain('404 model not found');
    expect(sb.updates[0]).toEqual({ id: 900, content: '[Imagen recibida — no se pudo procesar]' });
  });

  it('un fallo de descarga no toca llm_calls (no hubo llamada al modelo)', async () => {
    const sb = makeEnrichSupabase([IMAGE_ROW]);
    await enrichMediaMessages({
      supabase: sb,
      anthropic: anthropicReturning(new Error('no debería llamarse')),
      tenantId: 7,
      conversationId: 12345,
      fetchImpl: imageFetch(404),
    });
    expect(sb.llmCalls).toHaveLength(0);
    expect(sb.updates[0]?.content).toBe('[Imagen recibida — no se pudo procesar]');
  });

  it('si el insert en llm_calls falla, la imagen se describe igual', async () => {
    const sb = makeEnrichSupabase([IMAGE_ROW], { llmCallsFail: true });
    const r = await enrichMediaMessages({
      supabase: sb,
      anthropic: anthropicReturning({
        content: [{ type: 'text', text: 'Una foto.' }],
        usage: { input_tokens: 100, output_tokens: 5 },
      }),
      tenantId: 7,
      conversationId: 12345,
      fetchImpl: imageFetch(),
    });
    expect(r.enrichedCount).toBe(1);
    expect(sb.updates[0]).toEqual({ id: 900, content: '[Imagen del lead]: Una foto.' });
  });
});

/** Supabase falso para el seguimiento personalizado. */
function makeFollowupSupabase() {
  const llmCalls: Row[] = [];
  const terminal = (data: unknown) => {
    const q: any = {
      select: () => q,
      eq: () => q,
      order: () => q,
      limit: () => Promise.resolve({ data, error: null }),
      maybeSingle: () => Promise.resolve({ data, error: null }),
    };
    return q;
  };
  const sb: any = {
    llmCalls,
    from(table: string) {
      switch (table) {
        case 'llm_calls':
          return makeLlmCallsTable(llmCalls);
        case 'conversation_messages':
          return terminal([
            { source: 'ai', content: '¿Qué te gustaría mejorar?', sent_at: '2026-11-10T10:00:00Z' },
            { source: 'lead', content: 'La espalda, me duele', sent_at: '2026-11-10T10:01:00Z' },
          ]);
        case 'conversations':
          return terminal({ lead_id: 3, tenant_id: 7, leads: { first_name: 'Ana', last_name: null, username: null } });
        case 'prompt_blocks':
        case 'tenant_followup_config':
          return terminal(null);
        default:
          throw new Error(`tabla inesperada ${table}`);
      }
    },
  };
  return sb;
}

describe('personalizeFollowupMessage — registro en llm_calls', () => {
  it('un seguimiento generado deja una fila con el tenant de la conversación y su coste', async () => {
    const sb = makeFollowupSupabase();
    const r = await personalizeFollowupMessage({
      supabase: sb,
      anthropic: anthropicReturning({
        content: [{ type: 'text', text: 'Hola Ana, ¿cómo sigue la espalda?' }],
        usage: { input_tokens: 3000, output_tokens: 60 },
      }),
      conversationId: 555,
      aiGuide: 'retomar',
    });

    expect(r.ok).toBe(true);
    expect(sb.llmCalls).toHaveLength(1);
    const row = sb.llmCalls[0]!;
    expect(row.tenant_id).toBe(7);
    expect(row.conversation_id).toBe(555);
    expect(row.model).toBe('claude-haiku-4-5');
    expect(row.role).toBe('generator');
    expect(row.status).toBe('success');
    expect(row.tokens_in).toBe(3000);
    expect(row.tokens_out).toBe(60);
    // Haiku 4.5: $1/M in + $5/M out
    const expected = (3000 * 1 + 60 * 5) / 1_000_000;
    expect(row.cost).toBeCloseTo(expected, 8);
    expect(r.ok && r.costUsd).toBeCloseTo(expected, 8);
    expect(row.request_payload).toEqual({ kind: 'followup_personalization' });
  });

  it('si Anthropic falla, queda una fila de error y el seguimiento devuelve el error', async () => {
    const sb = makeFollowupSupabase();
    const r = await personalizeFollowupMessage({
      supabase: sb,
      anthropic: anthropicReturning(new Error('overloaded')),
      conversationId: 555,
      aiGuide: 'retomar',
    });

    expect(r.ok).toBe(false);
    expect(sb.llmCalls).toHaveLength(1);
    expect(sb.llmCalls[0]!.status).toBe('error');
    expect(String(sb.llmCalls[0]!.error_message)).toContain('overloaded');
  });

  it('una respuesta vacía se registra como error pero con los tokens que se cobraron', async () => {
    const sb = makeFollowupSupabase();
    const r = await personalizeFollowupMessage({
      supabase: sb,
      anthropic: anthropicReturning({ content: [{ type: 'text', text: '  ' }], usage: { input_tokens: 2000, output_tokens: 1 } }),
      conversationId: 555,
      aiGuide: 'retomar',
    });

    expect(r).toEqual({ ok: false, error: 'mensaje generado vacío' });
    const row = sb.llmCalls[0]!;
    expect(row.status).toBe('error');
    expect(row.tokens_in).toBe(2000);
    expect(row.cost).toBeCloseTo((2000 * 1 + 1 * 5) / 1_000_000, 8);
  });
});
