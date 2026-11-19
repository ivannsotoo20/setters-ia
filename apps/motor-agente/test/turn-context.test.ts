import { describe, it, expect } from 'vitest';
import {
  buildCountryInZoneDirective,
  buildRepeatedOpenerDirective,
  countryAnsweredInZone,
  detectRepeatedOpener,
} from '../src/lib/turn-context.js';
import { parseZoneAllowlist } from '../src/lib/zone-config.js';

// 2026-11-19 — Contexto por turno: apertura repetida (raquel28el) y país ya
// contestado en zona (gmma.1971, Ceuta). Ver lib/turn-context.ts.

function fakeSupabase(lastOut: unknown, prevAi: unknown) {
  return {
    from() {
      const filters: Array<[string, unknown]> = [];
      const builder: any = {
        select: () => builder,
        eq: (c: string, v: unknown) => (filters.push([c, v]), builder),
        neq: () => builder,
        lt: () => builder,
        order: () => builder,
        limit: () => builder,
        maybeSingle: () =>
          Promise.resolve({
            data: filters.some(([c, v]) => c === 'source' && v === 'ai') ? prevAi : lastOut,
            error: null,
          }),
      };
      return builder;
    },
  } as any;
}

describe('detectRepeatedOpener', () => {
  it('apertura de la automatización tras mensajes de la IA (raquel28el: 8 días después)', async () => {
    const sb = fakeSupabase(
      { source: 'system', sent_at: '2026-11-18T15:25:32Z' },
      { sent_at: '2026-11-10T19:53:25Z' },
    );
    expect(await detectRepeatedOpener(sb, 15182)).toEqual({ daysSinceLastAi: 8 });
  });

  it('primera apertura (la IA aún no había hablado): no', async () => {
    expect(await detectRepeatedOpener(fakeSupabase({ source: 'system', sent_at: '2026-11-18T15:25:32Z' }, null), 1)).toBeNull();
  });

  it('lo último fue de la IA: no', async () => {
    expect(await detectRepeatedOpener(fakeSupabase({ source: 'ai', sent_at: '2026-11-18T15:25:32Z' }, null), 1)).toBeNull();
  });

  it('nunca lanza', async () => {
    const sb = { from: () => { throw new Error('caído'); } } as any;
    expect(await detectRepeatedOpener(sb, 1)).toBeNull();
  });

  it('la directiva dice que contesta a la apertura, no a la pregunta anterior', () => {
    const d = buildRepeatedOpenerDirective({ daysSinceLastAi: 8 })!;
    expect(d).toMatch(/hace unos 8 días/);
    expect(d).toMatch(/contesta a ESA apertura/);
    expect(buildRepeatedOpenerDirective(null)).toBeNull();
  });
});

describe('countryAnsweredInZone', () => {
  const allow = parseZoneAllowlist({ zone_allowlist: { always: ['ES', 'US'], filtered: ['MX', 'CL'] } })!;
  it('la lista blanca de prueba se parsea', () => expect(allow).not.toBeNull());

  it('«desde Ceuta» es España, en zona', () => {
    expect(countryAnsweredInZone(['desde Ceuta'], allow)).toEqual({ iso: 'ES', answer: 'desde Ceuta' });
    expect(countryAnsweredInZone(['Melilla'], allow)?.iso).toBe('ES');
  });

  it('un país de filtro (México) o de fuera no entra aquí', () => {
    expect(countryAnsweredInZone(['desde México'], allow)).toBeNull();
    expect(countryAnsweredInZone(['Venezuela'], allow)).toBeNull();
    expect(countryAnsweredInZone(['Valencia'], allow)).toBeNull();
  });

  it('sin lista blanca, nada', () => {
    expect(countryAnsweredInZone(['desde Ceuta'], null)).toBeNull();
  });

  it('la directiva cierra el tema del país', () => {
    const d = buildCountryInZoneDirective({ iso: 'ES', answer: 'desde Ceuta' })!;
    expect(d).toMatch(/«desde Ceuta», que es España/);
    expect(d).toMatch(/lead_country_iso=ES/);
  });
});
