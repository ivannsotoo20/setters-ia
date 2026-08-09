import { describe, it, expect } from 'vitest';
import { isTenantAiEnabled } from '../src/lib/ai-enabled.js';

/** Mock mínimo de la cadena supabase.from().select().eq().maybeSingle(). */
function mockSupabase(opts: { data?: unknown; error?: { message: string } }) {
  return {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: async () => ({
                  data: opts.data ?? null,
                  error: opts.error ?? null,
                }),
              };
            },
          };
        },
      };
    },
  } as never;
}

describe('isTenantAiEnabled', () => {
  it('true cuando la fila dice true', async () => {
    expect(await isTenantAiEnabled(mockSupabase({ data: { ai_enabled: true } }), 7)).toBe(true);
  });

  it('false SOLO cuando la fila dice false explicitamente', async () => {
    expect(await isTenantAiEnabled(mockSupabase({ data: { ai_enabled: false } }), 7)).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Fail-open. Decision deliberada, documentada en el modulo:
  // fallar cerrado convertiria un error transitorio de lectura en un apagon
  // global y SILENCIOSO del setter, que es la clase de averia que este repo ya
  // ha sufrido tres veces. Si alguien invierte esto, que sea a proposito.
  // ---------------------------------------------------------------------------

  it('ante error de lectura asume ENCENDIDO', async () => {
    expect(await isTenantAiEnabled(mockSupabase({ error: { message: 'db down' } }), 7)).toBe(true);
  });

  it('sin fila en tenant_configs asume ENCENDIDO (coincide con el DEFAULT de la columna)', async () => {
    expect(await isTenantAiEnabled(mockSupabase({ data: null }), 7)).toBe(true);
  });

  it('un valor inesperado no apaga el setter', async () => {
    for (const raw of [null, undefined, 'false', 0, {}]) {
      expect(await isTenantAiEnabled(mockSupabase({ data: { ai_enabled: raw } }), 7)).toBe(true);
    }
  });

  it('columna ausente en la fila asume ENCENDIDO', async () => {
    expect(await isTenantAiEnabled(mockSupabase({ data: {} }), 7)).toBe(true);
  });
});
