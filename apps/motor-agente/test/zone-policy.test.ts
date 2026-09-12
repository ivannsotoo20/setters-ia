import { describe, expect, it } from 'vitest';
import { evaluateZone, parseZonePolicy, type ZonePolicy } from '../src/lib/zone-policy.js';

const TANIA: ZonePolicy = {
  noContactCountries: new Set(['VE', 'CU', 'DO', 'CO', 'BO', 'EC', 'GT', 'SV', 'AR']),
  countryRejectTerms: [
    'Venezuela', 'venezolana', 'Caracas', 'Colombia', 'colombiana', 'Bogotá',
    'El Salvador', 'San Salvador', 'Guatemala', 'Cuba', 'Argentina', 'Buenos Aires',
  ],
};

describe('parseZonePolicy', () => {
  it('lee ISO en mayúsculas y descarta basura', () => {
    const p = parseZonePolicy({
      no_contact_countries: ['ve', ' GT ', 'ESP', 12, null],
      country_reject_terms: ['Venezuela', '', 42],
    });
    expect(p).not.toBeNull();
    expect([...p!.noContactCountries]).toEqual(['VE', 'GT']);
    expect(p!.countryRejectTerms).toEqual(['Venezuela']);
  });

  it('sin países ni términos no hay política', () => {
    expect(parseZonePolicy({})).toBeNull();
    expect(parseZonePolicy(null)).toBeNull();
    expect(parseZonePolicy({ enabled: true, ai_criteria: 'x' })).toBeNull();
  });
});

describe('evaluateZone — prefijo telefónico', () => {
  it('el caso real de Tania: +502 (Guatemala) llegó a F6 con el enlace enviado', () => {
    const v = evaluateZone({ phone: '+50258746350', leadMessages: [], policy: TANIA });
    expect(v.kind).toBe('reject_by_prefix');
    if (v.kind === 'reject_by_prefix') expect(v.country.name).toBe('Guatemala');
  });

  it('+503 El Salvador y +58 Venezuela también se rechazan por prefijo', () => {
    expect(evaluateZone({ phone: '+50371234567', leadMessages: [], policy: TANIA }).kind).toBe('reject_by_prefix');
    expect(evaluateZone({ phone: '+584121234567', leadMessages: [], policy: TANIA }).kind).toBe('reject_by_prefix');
  });

  it('un prefijo fuera de la lista cualifica y manda sobre cualquier mención en el chat', () => {
    // Una venezolana que vive en España escribe con +34: no hay nada que preguntar.
    const v = evaluateZone({
      phone: '+34600123456',
      leadMessages: ['soy venezolana pero vivo en Madrid'],
      policy: TANIA,
    });
    expect(v.kind).toBe('in_zone_by_prefix');
    if (v.kind === 'in_zone_by_prefix') expect(v.country.iso).toBe('ES');
  });

  it('Perú (+51) no está en la lista: en zona', () => {
    expect(evaluateZone({ phone: '+51987654321', leadMessages: [], policy: TANIA }).kind).toBe('in_zone_by_prefix');
  });
});

describe('evaluateZone — menciones en el chat (Instagram, sin teléfono)', () => {
  it('detecta el país escrito a pelo ("Colombia", conv 10792) y el "vivo en Venezuela" (conv 10260)', () => {
    const a = evaluateZone({ phone: null, leadMessages: ['Colombia'], policy: TANIA });
    expect(a.kind).toBe('mention');
    if (a.kind === 'mention') expect(a.term).toBe('colombia');

    const b = evaluateZone({
      phone: null,
      leadMessages: ['Ya tengo 4 años', 'ak dónde yo vivo en Venezuela no tenemos hospitales'],
      policy: TANIA,
    });
    expect(b.kind).toBe('mention');
    if (b.kind === 'mention') {
      expect(b.term).toBe('venezuela');
      expect(b.excerpt).toContain('vivo en Venezuela');
    }
  });

  it('casa sin acentos ni mayúsculas y solo como palabra completa', () => {
    expect(evaluateZone({ phone: null, leadMessages: ['desde bogota!'], policy: TANIA }).kind).toBe('mention');
    // "Cubana" es gentilicio de la lista, "incubadora" no.
    expect(evaluateZone({ phone: null, leadMessages: ['tengo una incubadora'], policy: TANIA }).kind).toBe('clear');
  });

  it('un mensaje sin pistas no declara nada', () => {
    expect(evaluateZone({ phone: null, leadMessages: ['me duele la espalda desde hace años'], policy: TANIA }).kind).toBe('clear');
  });

  it('sin política, nunca hay veredicto', () => {
    expect(evaluateZone({ phone: '+50258746350', leadMessages: ['Colombia'], policy: null }).kind).toBe('clear');
  });

  it('recorta el extracto a 90 caracteres', () => {
    const long = `Vivo en Caracas ${'y '.repeat(80)}`;
    const v = evaluateZone({ phone: null, leadMessages: [long], policy: TANIA });
    expect(v.kind).toBe('mention');
    if (v.kind === 'mention') expect(v.excerpt.length).toBeLessThanOrEqual(91);
  });
});
