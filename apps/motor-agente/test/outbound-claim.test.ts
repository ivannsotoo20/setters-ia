import { describe, it, expect } from 'vitest';
import { sendNextBatch } from '../src/services/outbound-sender.js';

// 2026-11-19 — Envío doble (Tania, conv. 14236, 16-nov): una parte programada una
// vez y enviada dos veces porque dos procesos leyeron el mismo pendiente antes de
// marcarlo. Ahora el UPDATE a 'processing' exige status='pending' y solo se envía
// lo que ese UPDATE devolvió.

function fakeSupabase(opts: { claimed: number[]; convState?: string }) {
  const calls: Array<{ table: string; op: string; ids?: unknown; payload?: unknown; filters: Array<[string, unknown]> }> = [];
  const candidates = [1, 2].map((id) => ({
    id,
    tenant_id: 7,
    conversation_id: 100 + id,
    integration_account_id: 6,
    message: `parte ${id}`,
    attempts: 0,
    scheduled_at: '2026-11-16T17:04:19Z',
    message_type: 'message',
    template_id: null,
    ai_personalize: false,
    ai_guide: null,
    triggered_by: null,
  }));
  const client = {
    from(table: string) {
      const rec = { table, op: 'select', ids: undefined as unknown, payload: undefined as unknown, filters: [] as Array<[string, unknown]> };
      calls.push(rec);
      const builder: any = {
        select: () => builder,
        eq: (c: string, v: unknown) => (rec.filters.push([c, v]), builder),
        lte: () => builder,
        order: () => builder,
        limit: () => builder,
        in: (_c: string, v: unknown) => ((rec.ids = v), builder),
        update: (p: unknown) => ((rec.op = 'update'), (rec.payload = p), builder),
        then: (resolve: (v: unknown) => unknown) => {
          let data: unknown = null;
          if (table === 'message_schedules' && rec.op === 'select') data = candidates;
          else if (table === 'message_schedules' && rec.op === 'update' && (rec.payload as any)?.status === 'processing') {
            data = opts.claimed.map((id) => ({ id }));
          } else if (table === 'tenant_configs') data = [];
          else if (table === 'conversations') {
            data = candidates.map((c) => ({ id: c.conversation_id, state: opts.convState ?? 'closed', is_blocked: false, ai_paused_until: null }));
          }
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
      return builder;
    },
  } as any;
  return { client, calls };
}

describe('sendNextBatch — reclamo atómico', () => {
  it('el UPDATE a processing exige status=pending', async () => {
    const { client, calls } = fakeSupabase({ claimed: [] });
    await sendNextBatch({ supabase: client });
    const claim = calls.find((c) => c.table === 'message_schedules' && c.op === 'update')!;
    expect(claim.payload).toEqual({ status: 'processing' });
    expect(claim.filters).toContainEqual(['status', 'pending']);
  });

  it('si otro proceso ya las reclamó, este no envía nada', async () => {
    const { client, calls } = fakeSupabase({ claimed: [] });
    const out = await sendNextBatch({ supabase: client });
    expect(out.picked).toBe(0);
    expect(out.sent).toBe(0);
    expect(calls.some((c) => c.table === 'conversations')).toBe(false);
  });

  it('solo sigue con las que este proceso reclamó', async () => {
    // Conversación cerrada: el gate las cancela, así se ve qué ids siguieron sin enviar nada.
    const { client, calls } = fakeSupabase({ claimed: [1] });
    const out = await sendNextBatch({ supabase: client });
    expect(out.picked).toBe(1);
    const gateCancel = calls.find(
      (c) => c.table === 'message_schedules' && c.op === 'update' && (c.payload as any)?.status === 'cancelled',
    )!;
    expect(gateCancel.ids).toEqual([1]);
  });
});
