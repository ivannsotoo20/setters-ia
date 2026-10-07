import { describe, it, expect } from 'vitest';
import { buildCallGate, parseCallGateConfig, renderCallGateBlock } from '../src/lib/call-gate.js';

/**
 * Cerrojo de la videollamada (2026-10-07, Tania): la config por tenant y lo que
 * se le dice al setter. La comprobación en sí (V22) vive en el pipeline.
 */

const TANIA = {
  zone_allowlist: { always: ['ES', 'FR', 'US'], filtered: ['MX', 'CL'] },
  call_gate: { require_country: true, min_pain_months: 3 },
};

const CLEAR = { kind: 'clear' } as const;
const ES_PREFIX = {
  kind: 'in_zone_by_prefix',
  country: { iso: 'ES', name: 'España', prefix: '34' },
  tier: 'always',
} as const;

describe('parseCallGateConfig', () => {
  it('lee require_country y min_pain_months', () => {
    expect(parseCallGateConfig(TANIA)).toEqual({ requireCountry: true, minPainMonths: 3 });
  });

  it('sin call_gate, vacío o con valores sin sentido: no hay cerrojo', () => {
    expect(parseCallGateConfig({})).toBeNull();
    expect(parseCallGateConfig(null)).toBeNull();
    expect(parseCallGateConfig({ call_gate: {} })).toBeNull();
    expect(parseCallGateConfig({ call_gate: { require_country: 'sí', min_pain_months: -1 } })).toBeNull();
    expect(parseCallGateConfig({ call_gate: { min_pain_months: 'tres' } })).toBeNull();
  });
});

describe('buildCallGate', () => {
  it('Instagram sin teléfono: exige país de la lista blanca (siempre + con filtro) y 3 meses', () => {
    expect(buildCallGate({ leadQualification: TANIA, zoneVerdict: CLEAR })).toEqual({
      allowedCountries: ['ES', 'FR', 'US', 'MX', 'CL'],
      countryKnownInZone: false,
      minPainMonths: 3,
    });
  });

  it('WhatsApp con prefijo de zona: el país ya está confirmado', () => {
    expect(buildCallGate({ leadQualification: TANIA, zoneVerdict: ES_PREFIX })?.countryKnownInZone).toBe(true);
  });

  it('sin lista blanca, el país no se puede exigir; si solo quedaba eso, no hay cerrojo', () => {
    const soloPais = { call_gate: { require_country: true } };
    expect(buildCallGate({ leadQualification: soloPais, zoneVerdict: CLEAR })).toBeUndefined();
    const conDolor = { call_gate: { require_country: true, min_pain_months: 3 } };
    expect(buildCallGate({ leadQualification: conDolor, zoneVerdict: CLEAR })).toEqual({
      allowedCountries: null,
      countryKnownInZone: false,
      minPainMonths: 3,
    });
  });

  it('un tenant sin call_gate no tiene cerrojo aunque tenga zona', () => {
    expect(
      buildCallGate({ leadQualification: { zone_allowlist: TANIA.zone_allowlist }, zoneVerdict: CLEAR }),
    ).toBeUndefined();
  });
});

describe('renderCallGateBlock', () => {
  it('dice qué declarar y que sin eso la propuesta no sale', () => {
    const d = renderCallGateBlock(buildCallGate({ leadQualification: TANIA, zoneVerdict: CLEAR })) ?? '';
    expect(d).toContain('## Antes de proponer la videollamada');
    expect(d).toContain('lead_country_iso');
    expect(d).toContain('pain_duration_months');
    expect(d).toContain('menos de 3 meses');
    expect(d).toContain('previous_episode');
    expect(d).toContain('una propuesta sin esos datos no sale');
  });

  it('con el prefijo de zona no pide el país', () => {
    const d = renderCallGateBlock(buildCallGate({ leadQualification: TANIA, zoneVerdict: ES_PREFIX })) ?? '';
    expect(d).not.toContain('lead_country_iso');
    expect(d).toContain('pain_duration_months');
  });

  it('sin cerrojo no hay bloque', () => {
    expect(renderCallGateBlock(undefined)).toBeNull();
  });
});
