import { beforeEach, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { GhlParsedOutbound } from '@fyzon/channel-adapters';
import { routeGhlOutbound } from '../src/services/ghl-message-router.js';
import { UNMATCHED_PREVIEW_MAX_CHARS } from '../src/services/unmatched-openings.js';

/**
 * 2026-10-21 — aperturas que no casan con ninguna palabra clave (Caso C).
 *
 * Tenant 7: desde el 8 oct no entró ninguna bienvenida a seguidores nuevos y el
 * texto que no casaba solo quedaba en el log, que se pierde en cada deploy. Ahora
 * se guarda en `unmatched_openings` para listarlo en /keywords.
 */

interface Call {
  table: string;
  op: 'select' | 'insert' | 'update';
  payload?: unknown;
}

let calls: Call[] = [];
let insertError: { message: string } | null = null;

function respond(call: Call): { data: unknown; error: unknown } {
  if (call.table === 'automation_keywords') {
    return { data: [{ type: 'bienvenida', pattern: 'te doy la bienvenida a mi perfil' }], error: null };
  }
  if (call.table === 'unmatched_openings' && call.op === 'insert') {
    return { data: null, error: insertError };
  }
  // leads / conversations: el contacto no tiene nada todavía.
  return { data: null, error: null };
}

function makeSupabaseStub(): SupabaseClient {
  return {
    from(table: string) {
      const call: Call = { table, op: 'select' };
      const b: Record<string, unknown> = {};
      b.select = () => b;
      b.insert = (p: unknown) => {
        call.op = 'insert';
        call.payload = p;
        return b;
      };
      b.update = (p: unknown) => {
        call.op = 'update';
        call.payload = p;
        return b;
      };
      for (const m of ['eq', 'is', 'in', 'order', 'limit', 'maybeSingle', 'single']) {
        b[m] = () => b;
      }
      b.then = (resolve: (v: unknown) => void) => {
        calls.push(call);
        resolve(respond(call));
      };
      return b;
    },
  } as unknown as SupabaseClient;
}

/** Escrito hace 10 min, entregado hace 5 (fechas en el pasado: una futura se recorta a ahora). */
const WRITTEN_AT = new Date(Date.now() - 10 * 60_000).toISOString();
const DELIVERED_AT = new Date(Date.now() - 5 * 60_000).toISOString();

function outbound(message: string): GhlParsedOutbound {
  return {
    tenantId: 7,
    ghlLocationId: 'loc_7',
    ghlContactId: 'contact_9',
    ghlConversationId: 'gc9',
    channel: 'instagram',
    message,
    isAiSelfEcho: false,
    ghlMessageId: 'ghl_out_1',
    timestamp: DELIVERED_AT,
    dateAdded: WRITTEN_AT,
  };
}

function savedOpenings(): Array<Record<string, unknown>> {
  return calls
    .filter((c) => c.table === 'unmatched_openings' && c.op === 'insert')
    .map((c) => c.payload as Record<string, unknown>);
}

beforeEach(() => {
  calls = [];
  insertError = null;
});

describe('routeGhlOutbound — apertura que no casa con ninguna palabra clave', () => {
  it('no crea conversación, pero guarda el texto con la hora en que se escribió', async () => {
    const result = await routeGhlOutbound({
      supabase: makeSupabaseStub(),
      ghlClient: null,
      outbound: outbound('Holaaa! Vi que empezaste a seguirme y quería saludarte'),
    });

    expect(result).toEqual({ classification: 'no_conversation_skip', conversationId: null, isPaused: false });
    expect(savedOpenings()).toEqual([
      {
        tenant_id: 7,
        channel: 'instagram',
        ghl_contact_id: 'contact_9',
        preview: 'Holaaa! Vi que empezaste a seguirme y quería saludarte',
        seen_at: WRITTEN_AT,
      },
    ]);
  });

  it('guarda solo el principio de un texto largo', async () => {
    await routeGhlOutbound({
      supabase: makeSupabaseStub(),
      ghlClient: null,
      outbound: outbound('a'.repeat(UNMATCHED_PREVIEW_MAX_CHARS + 50)),
    });

    expect(String(savedOpenings()[0]?.preview)).toHaveLength(UNMATCHED_PREVIEW_MAX_CHARS);
  });

  it('un mensaje vacío (solo adjunto) no deja fila', async () => {
    await routeGhlOutbound({ supabase: makeSupabaseStub(), ghlClient: null, outbound: outbound('   ') });

    expect(savedOpenings()).toEqual([]);
  });

  it('si la tabla no está (migration 082 sin aplicar), el webhook sigue igual', async () => {
    insertError = { message: 'relation "public.unmatched_openings" does not exist' };

    const result = await routeGhlOutbound({
      supabase: makeSupabaseStub(),
      ghlClient: null,
      outbound: outbound('Hola, por aquí Tânia 😊'),
    });

    expect(result.classification).toBe('no_conversation_skip');
  });

  it('si casa con una bienvenida no es una apertura sin reconocer', async () => {
    // Sin lead ni conversación, una bienvenida reconocida crea la conversación
    // (Caso A); aquí solo interesa que no se apunte como apertura sin reconocer.
    await routeGhlOutbound({
      supabase: makeSupabaseStub(),
      ghlClient: null,
      outbound: outbound('¡Hola Ana! Te doy la bienvenida a mi perfil 😊'),
    }).catch(() => undefined);

    expect(savedOpenings()).toEqual([]);
  });
});
