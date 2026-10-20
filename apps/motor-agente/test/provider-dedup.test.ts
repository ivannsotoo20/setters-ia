import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  findMessageByProviderId,
  insertInboundMessage,
  insertWebhookMessageRows,
  isProviderDedupSchemaMissing,
  providerMessageColumns,
} from '../src/services/lead-ingest.js';

/**
 * 2026-10-20 — helpers del antiduplicado en BD (migration 080). El recorrido
 * completo por las rutas está en webhook-dedup-db.test.ts.
 */

interface Recorded {
  table: string;
  op: string;
  payload?: unknown;
  options?: unknown;
}

/** Supabase falso: devuelve `results[op]` y apunta cada operación. */
function makeSupabase(results: Record<string, { data: unknown; error: unknown }>) {
  const recorded: Recorded[] = [];
  const client = {
    from(table: string) {
      const rec: Recorded = { table, op: 'select' };
      let opSet = false;
      const b: Record<string, unknown> = {};
      const setOp = (op: string, payload?: unknown, options?: unknown) => {
        if (!opSet) Object.assign(rec, { op, payload, options });
        opSet = true;
        return b;
      };
      b.select = () => {
        opSet = true;
        return b;
      };
      b.insert = (p: unknown) => setOp('insert', p);
      b.upsert = (p: unknown, o: unknown) => setOp('upsert', p, o);
      b.update = (p: unknown) => setOp('update', p);
      for (const m of ['eq', 'limit', 'maybeSingle', 'single']) b[m] = () => b;
      b.then = (resolve: (v: unknown) => void) => {
        recorded.push(rec);
        resolve(results[`${table}.${rec.op}`] ?? { data: null, error: null });
      };
      return b;
    },
  };
  return { client: client as unknown as SupabaseClient, recorded };
}

describe('providerMessageColumns', () => {
  it('la fila 0 lleva el id tal cual; las siguientes, con sufijo :k', () => {
    expect(providerMessageColumns('ghl', 'm1')).toEqual({ provider: 'ghl', provider_message_id: 'm1' });
    expect(providerMessageColumns('ghl', 'm1', 2)).toEqual({ provider: 'ghl', provider_message_id: 'm1:2' });
  });

  it('sin id del proveedor no añade nada (van los dos o ninguno)', () => {
    expect(providerMessageColumns('ghl', undefined)).toEqual({});
    expect(providerMessageColumns('ycloud', null)).toEqual({});
  });
});

describe('isProviderDedupSchemaMissing', () => {
  it('reconoce la migración sin aplicar por código o por mensaje', () => {
    expect(isProviderDedupSchemaMissing({ code: 'PGRST204' })).toBe(true);
    expect(isProviderDedupSchemaMissing({ code: '42703' })).toBe(true);
    expect(isProviderDedupSchemaMissing({ code: '42P10' })).toBe(true);
    expect(
      isProviderDedupSchemaMissing({
        message: "Could not find the 'provider_message_id' column of 'conversation_messages' in the schema cache",
      }),
    ).toBe(true);
  });

  it('no confunde otros errores con la migración ausente', () => {
    expect(isProviderDedupSchemaMissing(null)).toBe(false);
    expect(isProviderDedupSchemaMissing({ code: '23503', message: 'violates foreign key constraint' })).toBe(false);
    expect(isProviderDedupSchemaMissing({ code: '57014', message: 'canceling statement due to statement timeout' })).toBe(false);
  });
});

describe('findMessageByProviderId', () => {
  it('sin id no consulta la base de datos', async () => {
    const { client, recorded } = makeSupabase({});
    await expect(findMessageByProviderId(client, 7, 'ghl', undefined)).resolves.toBeNull();
    expect(recorded).toHaveLength(0);
  });

  it('devuelve el mensaje guardado', async () => {
    const { client } = makeSupabase({
      'conversation_messages.select': { data: { id: 17114, conversation_id: 13655 }, error: null },
    });
    await expect(findMessageByProviderId(client, 7, 'ghl', 'm1')).resolves.toEqual({
      messageId: 17114,
      conversationId: 13655,
    });
  });

  it('fail-open si la consulta falla: el mensaje se procesa como nuevo', async () => {
    const { client } = makeSupabase({
      'conversation_messages.select': { data: null, error: { code: '08006', message: 'connection failure' } },
    });
    await expect(findMessageByProviderId(client, 7, 'ycloud', 'wamid.X')).resolves.toBeNull();
  });
});

describe('insertWebhookMessageRows', () => {
  it('sin id del proveedor es un INSERT normal', async () => {
    const { client, recorded } = makeSupabase({
      'conversation_messages.insert': { data: [{ id: 1 }], error: null },
    });
    await expect(insertWebhookMessageRows(client, [{ tenant_id: 7, content: 'hola' }])).resolves.toEqual({
      ids: [1],
      duplicate: false,
    });
    expect(recorded.map((r) => r.op)).toEqual(['insert']);
  });

  it('un error que no es de la migración se propaga (el mensaje no se da por guardado)', async () => {
    const { client } = makeSupabase({
      'conversation_messages.upsert': { data: null, error: { code: '23503', message: 'fk violation' } },
    });
    await expect(
      insertWebhookMessageRows(client, [{ tenant_id: 7, ...providerMessageColumns('ghl', 'm1') }]),
    ).rejects.toThrow(/fk violation/);
  });
});

describe('insertInboundMessage con proveedor', () => {
  const message = {
    tenantId: '7',
    externalUserId: '34600000000',
    channel: 'whatsapp' as const,
    text: 'Si',
    timestampMs: Date.parse('2026-10-19T05:33:17Z'),
    providerMessageId: 'wamid.SI',
    rawPayload: {},
  };

  it('si el mensaje ya estaba no toca last_message_at de la conversación', async () => {
    const { client, recorded } = makeSupabase({
      'conversation_messages.upsert': { data: [], error: null },
    });
    await expect(
      insertInboundMessage({ supabase: client, tenantId: 7, conversationId: 13886, message, provider: 'ycloud' }),
    ).resolves.toEqual({ messageId: null, duplicate: true });
    expect(recorded.some((r) => r.table === 'conversations')).toBe(false);
  });

  it('si es nuevo devuelve el id y actualiza last_message_at', async () => {
    const { client, recorded } = makeSupabase({
      'conversation_messages.upsert': { data: [{ id: 16725 }], error: null },
    });
    await expect(
      insertInboundMessage({ supabase: client, tenantId: 7, conversationId: 13886, message, provider: 'ycloud' }),
    ).resolves.toEqual({ messageId: 16725, duplicate: false });
    expect(recorded.some((r) => r.table === 'conversations' && r.op === 'update')).toBe(true);
  });
});
