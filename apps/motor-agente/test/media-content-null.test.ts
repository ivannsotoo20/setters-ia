import { describe, it, expect } from 'vitest';
import { insertInboundMessage } from '../src/services/lead-ingest.js';
import { enrichMediaMessages } from '../src/services/enrich-media-messages.js';

/**
 * 2026-09-03 — audios de WhatsApp sin transcribir en el tenant 7 (12 de 12).
 *
 * El parser de YCloud devuelve text='' para un audio o una imagen sin pie;
 * insertInboundMessage lo guardaba tal cual, y enrichMediaMessages solo
 * buscaba `content IS NULL`, así que esas filas nunca se transcribían, nunca
 * recibían placeholder y no dejaban ni una línea de log. Dos cinturones:
 *   1. el insert normaliza '' → NULL;
 *   2. el enriquecedor también recoge las filas con '' (histórico).
 */

function makeInsertSupabase() {
  const inserted: Record<string, unknown>[] = [];
  const updated: Record<string, unknown>[] = [];
  const sb: any = {
    inserted,
    updated,
    from(table: string) {
      if (table === 'conversation_messages') {
        return {
          insert: (row: Record<string, unknown>) => {
            inserted.push(row);
            return { select: () => ({ single: () => Promise.resolve({ data: { id: 501 }, error: null }) }) };
          },
        };
      }
      if (table === 'conversations') {
        return { update: (row: Record<string, unknown>) => { updated.push(row); return { eq: () => Promise.resolve({ error: null }) }; } };
      }
      throw new Error(`tabla inesperada ${table}`);
    },
  };
  return sb;
}

const baseMessage = {
  tenantId: 7,
  channelKind: 'whatsapp' as const,
  externalId: '34600000000',
  timestampMs: Date.parse('2026-09-02T20:16:00Z'),
  rawPayload: {},
};

describe('insertInboundMessage — content de un media sin texto', () => {
  it("un audio con text='' se guarda con content NULL para que el enriquecedor lo vea", async () => {
    const sb = makeInsertSupabase();
    await insertInboundMessage({
      supabase: sb,
      tenantId: 7,
      conversationId: 10788,
      message: { ...baseMessage, text: '', mediaUrl: 'https://api.ycloud.com/v2/whatsapp/media/download/x?sig=1', mediaType: 'audio' } as any,
    });
    expect(sb.inserted).toHaveLength(1);
    expect(sb.inserted[0]!.content).toBeNull();
    expect(sb.inserted[0]!.content_type).toBe('audio');
    expect(sb.inserted[0]!.media_url).toContain('api.ycloud.com');
  });

  it('un texto normal se guarda tal cual, y solo espacios cuenta como vacío', async () => {
    const sb = makeInsertSupabase();
    await insertInboundMessage({ supabase: sb, tenantId: 7, conversationId: 1, message: { ...baseMessage, text: 'Hola, me duele la espalda' } as any });
    await insertInboundMessage({ supabase: sb, tenantId: 7, conversationId: 1, message: { ...baseMessage, text: '   ', mediaUrl: 'https://x/y.jpg', mediaType: 'image' } as any });
    expect(sb.inserted[0]!.content).toBe('Hola, me duele la espalda');
    expect(sb.inserted[1]!.content).toBeNull();
  });
});

/**
 * Supabase falso para el enriquecedor: registra el filtro `.or(...)` que se
 * aplica y devuelve las filas que el test declara pendientes. Las filas de tipo
 * `file` van por la rama de placeholder (sin red), que es lo que queremos ver.
 */
function makeEnrichSupabase(rows: Array<{ id: number; content_type: string; media_url: string; content: string | null }>) {
  const filters: string[] = [];
  const updates: Array<{ id: number; content: string }> = [];
  const sb: any = {
    filters,
    updates,
    from(table: string) {
      if (table !== 'conversation_messages') throw new Error(`tabla inesperada ${table}`);
      const q: any = {
        select: () => q,
        eq: () => q,
        not: () => q,
        is: (col: string) => { filters.push(`is:${col}`); return q; },
        or: (expr: string) => { filters.push(`or:${expr}`); return q; },
        order: () => q,
        limit: () => Promise.resolve({ data: rows, error: null }),
        update: (row: { content: string }) => ({
          eq: (_c: string, id: number) => { updates.push({ id, content: row.content }); return Promise.resolve({ error: null }); },
        }),
      };
      return q;
    },
  };
  return sb;
}

describe('enrichMediaMessages — filas con content vacío', () => {
  it("pide las filas con content NULL **o** '' y procesa las que hay", async () => {
    const sb = makeEnrichSupabase([
      { id: 1, content_type: 'file', media_url: 'https://lookaside.fbsbx.com/a', content: '' },
      { id: 2, content_type: 'file', media_url: 'https://lookaside.fbsbx.com/b', content: null },
    ]);
    const r = await enrichMediaMessages({ supabase: sb, anthropic: {} as any, conversationId: 10788 });
    expect(sb.filters).toContain('or:content.is.null,content.eq.');
    expect(sb.filters.some((f: string) => f.startsWith('is:content'))).toBe(false);
    // Las dos filas reciben placeholder (tipo file: sin handler todavía).
    expect(sb.updates.map((u: { id: number }) => u.id).sort()).toEqual([1, 2]);
    expect(r.failedCount).toBe(2);
    expect(r.enrichedCount).toBe(0);
  });
});
