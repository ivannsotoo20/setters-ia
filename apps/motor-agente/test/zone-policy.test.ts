import { describe, expect, it } from 'vitest';
import {
  evaluateZone,
  isZoneRejectVerdict,
  parseZonePolicy,
  UNKNOWN_COUNTRY_ISO,
  UNKNOWN_PREFIX_MIN_DIGITS,
  type ZonePolicy,
} from '../src/lib/zone-policy.js';
import { EUROPE_ISO } from '../src/lib/zone-config.js';

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

  it('legacy (lista negra, sin zone_allowlist): Perú (+51) no está en la lista, así que sale en zona', () => {
    // Es el comportamiento que dejó pasar la conv 12145. Se conserva a propósito
    // para los tenants sin lista blanca; con lista blanca, ver más abajo.
    expect(evaluateZone({ phone: '+51987654321', leadMessages: [], policy: TANIA }).kind).toBe('in_zone_by_prefix');
  });

  it('legacy: el veredicto en zona no lleva tier y un número desconocido no decide', () => {
    const v = evaluateZone({ phone: '+34600123456', leadMessages: [], policy: TANIA });
    expect(v.kind).toBe('in_zone_by_prefix');
    if (v.kind === 'in_zone_by_prefix') expect(v.tier).toBeUndefined();
    expect(evaluateZone({ phone: '+9991234567', leadMessages: [], policy: TANIA }).kind).toBe('clear');
  });
});

// =============================================================================
// 2026-09-26 — lista blanca (lead_qualification.zone_allowlist)
//
// La configuración es la que tiene el tenant 7 en BD: Europa + EEUU, Canadá,
// Australia y Nueva Zelanda siempre; México y Chile con filtro de trabajo.
// =============================================================================

const TANIA_LEAD_QUALIFICATION = {
  no_contact_countries: ['VE', 'CU', 'DO', 'CO', 'BO', 'EC', 'GT', 'SV', 'AR', 'PE'],
  country_reject_terms: [
    'Venezuela', 'venezolana', 'Colombia', 'Perú', 'peruana', 'Lima', 'Cuba', 'Montevideo',
    'Managua', 'Tegucigalpa', 'Ciudad del Este', 'Alajuela',
  ],
  zone_allowlist: {
    always: [...EUROPE_ISO, 'US', 'CA', 'AU', 'NZ'],
    filtered: ['MX', 'CL'],
  },
};
const TANIA_ALLOW = parseZonePolicy(TANIA_LEAD_QUALIFICATION)!;

function prefixVerdict(phone: string) {
  return evaluateZone({ phone, leadMessages: [], policy: TANIA_ALLOW });
}

describe('parseZonePolicy — lista blanca', () => {
  it('lee zone_allowlist junto a las claves de siempre', () => {
    expect(TANIA_ALLOW.allowlist).toBeDefined();
    expect(TANIA_ALLOW.allowlist!.always.has('ES')).toBe(true);
    expect(TANIA_ALLOW.allowlist!.filtered.has('MX')).toBe(true);
    expect(TANIA_ALLOW.noContactCountries.has('PE')).toBe(true);
    expect(TANIA_ALLOW.countryRejectTerms).toContain('Lima');
  });

  it('devuelve política aunque solo haya lista blanca', () => {
    const p = parseZonePolicy({ zone_allowlist: { always: ['ES'], filtered: [] } });
    expect(p).not.toBeNull();
    expect(p!.allowlist!.always.has('ES')).toBe(true);
    expect(p!.noContactCountries.size).toBe(0);
    expect(p!.countryRejectTerms).toEqual([]);
  });

  it('una lista blanca vacía no es política (y sin las claves de siempre, no hay nada)', () => {
    expect(parseZonePolicy({ zone_allowlist: { always: [], filtered: [] } })).toBeNull();
  });

  it('sin zone_allowlist no aparece la clave allowlist', () => {
    const p = parseZonePolicy({ no_contact_countries: ['VE'] });
    expect(p).not.toBeNull();
    expect(p!.allowlist).toBeUndefined();
  });
});

describe('evaluateZone — prefijo contra la lista blanca', () => {
  it('conv 12145: +51 Perú (abogado aprobado por el formulario) → no cualifica', () => {
    const v = prefixVerdict('+51987654321');
    expect(v.kind).toBe('reject_by_prefix');
    if (v.kind === 'reject_by_prefix') expect(v.country).toEqual({ iso: 'PE', name: 'Perú', prefix: '51' });
  });

  it('+505 Nicaragua → no cualifica aunque no esté en no_contact_countries', () => {
    const v = prefixVerdict('+50581234567');
    expect(v.kind).toBe('reject_by_prefix');
    if (v.kind === 'reject_by_prefix') expect(v.country.iso).toBe('NI');
  });

  it('+52 México y +56 Chile → en zona, tier filtered', () => {
    for (const [phone, iso] of [['+5215512345678', 'MX'], ['+56912345678', 'CL']] as const) {
      const v = prefixVerdict(phone);
      expect(v.kind, phone).toBe('in_zone_by_prefix');
      if (v.kind === 'in_zone_by_prefix') {
        expect(v.country.iso).toBe(iso);
        expect(v.tier).toBe('filtered');
      }
    }
  });

  it('+34 España → en zona, tier always', () => {
    const v = prefixVerdict('+34600123456');
    expect(v.kind).toBe('in_zone_by_prefix');
    if (v.kind === 'in_zone_by_prefix') {
      expect(v.country.iso).toBe('ES');
      expect(v.tier).toBe('always');
    }
  });

  it('Europa entera, EEUU/Canadá, Australia y Nueva Zelanda → always', () => {
    for (const phone of ['+48601234567', '+46701234567', '+79161234567', '+12125551234', '+61412345678', '+64211234567']) {
      const v = prefixVerdict(phone);
      expect(v.kind, phone).toBe('in_zone_by_prefix');
      if (v.kind === 'in_zone_by_prefix') expect(v.tier, phone).toBe('always');
    }
  });

  it('+1876 Jamaica → no cualifica (antes salía como Estados Unidos)', () => {
    const v = prefixVerdict('+18761234567');
    expect(v.kind).toBe('reject_by_prefix');
    if (v.kind === 'reject_by_prefix') expect(v.country.iso).toBe('JM');
  });

  it('+1787 Puerto Rico → no cualifica (vetado por Iván)', () => {
    const v = prefixVerdict('+17871234567');
    expect(v.kind).toBe('reject_by_prefix');
    if (v.kind === 'reject_by_prefix') expect(v.country.iso).toBe('PR');
  });

  it('+212 Marruecos y +77 Kazajistán → no cualifican', () => {
    expect(prefixVerdict('+212612345678').kind).toBe('reject_by_prefix');
    const kz = prefixVerdict('+77011234567');
    expect(kz.kind).toBe('reject_by_prefix');
    if (kz.kind === 'reject_by_prefix') expect(kz.country.iso).toBe('KZ');
  });

  it('número completo con prefijo desconocido → no cualifica, país ZZ', () => {
    const v = prefixVerdict('+9991234567');
    expect(v.kind).toBe('reject_by_prefix');
    if (v.kind === 'reject_by_prefix') {
      expect(v.country).toEqual({
        iso: UNKNOWN_COUNTRY_ISO,
        name: 'un país fuera de su zona de contacto',
        prefix: '999',
      });
    }
    expect(UNKNOWN_COUNTRY_ISO).toBe('ZZ');
  });

  it(`un número desconocido demasiado corto (< ${UNKNOWN_PREFIX_MIN_DIGITS} dígitos) no decide: sigue a las menciones`, () => {
    expect(prefixVerdict('+9991234').kind).toBe('clear');
    const v = evaluateZone({ phone: '+9991234', leadMessages: ['soy de Lima'], policy: TANIA_ALLOW });
    expect(v.kind).toBe('mention');
  });

  it('el prefijo en zona manda sobre las menciones, igual que con la lista negra', () => {
    const v = evaluateZone({
      phone: '+34600123456',
      leadMessages: ['soy peruana pero vivo en Madrid'],
      policy: TANIA_ALLOW,
    });
    expect(v.kind).toBe('in_zone_by_prefix');
  });

  it('el prefijo fuera de zona manda aunque escriba desde la zona (la excepción la gestiona la directiva)', () => {
    const v = evaluateZone({
      phone: '+50258746350',
      leadMessages: ['vivo en Canadá'],
      policy: TANIA_ALLOW,
    });
    expect(v.kind).toBe('reject_by_prefix');
  });

  it('sin teléfono (Instagram) + "vivo en Lima" → residencia declarada, cierra (2026-09-26)', () => {
    // Batería del 26-09: con "vivo en Managua" como mención, el modelo siguió
    // cualificando. Dicho así es residencia, no pista.
    const v = evaluateZone({ phone: null, leadMessages: ['vivo en Lima desde hace años'], policy: TANIA_ALLOW });
    expect(v.kind).toBe('reject_by_declaration');
    if (v.kind === 'reject_by_declaration') {
      expect(v.term).toBe('lima');
      expect(v.excerpt).toContain('vivo en Lima');
    }
    expect(isZoneRejectVerdict(v)).toBe(true);
  });

  it('frases de residencia que cierran: "acá en", "te escribo desde", "resido en", "vivimos aquí en"', () => {
    for (const msg of [
      'acá en Montevideo no encuentro a nadie que me ayude',
      'yo te escribo desde Lima, soy contable',
      'resido en Ciudad del Este',
      'vivimos aquí en Tegucigalpa',
      'yo vivo acá en Managua',
    ]) {
      expect(evaluateZone({ phone: null, leadMessages: [msg], policy: TANIA_ALLOW }).kind, msg).toBe(
        'reject_by_declaration',
      );
    }
  });

  it('origen, pasado o negación NO son residencia: se quedan en mención (pregunta)', () => {
    for (const msg of ['soy de Lima pero vivo fuera', 'me operaron en Cuba', 'ya no vivo en Lima', 'Colombia']) {
      expect(evaluateZone({ phone: null, leadMessages: [msg], policy: TANIA_ALLOW }).kind, msg).toBe('mention');
    }
  });

  it('revisión adversarial del 26-09: nada de esto cierra (se queda en mención y se pregunta)', () => {
    const policy = parseZonePolicy({
      ...TANIA_LEAD_QUALIFICATION,
      country_reject_terms: [
        ...TANIA_LEAD_QUALIFICATION.country_reject_terms,
        'Puerto Rico', 'Rosario', 'Santo Domingo', 'El Alto', 'Callao', 'Manta', 'Colombia',
      ],
    })!;
    for (const msg of [
      'vivo en Puerto Rico, en Gran Canaria',
      'vivo en El Rosario, en Tenerife',
      'vivo en Santo Domingo de la Calzada',
      'aquí en el Callao hay mucha gente',
      'vivo en Callao',
      'aquí en la manta que me pongo',
      'acá en Lima los médicos no saben, estoy de viaje, vivo en Sevilla',
      'te escribo desde Colombia pero vivo en Valencia',
      'convivo en Lima con mis padres',
      'describo desde Lima lo que me pasa',
      'yo no  vivo en Lima',
      '¿Vivo en Lima? No, en Madrid',
      'aquí en Managua no hay especialistas',
    ]) {
      expect(evaluateZone({ phone: null, leadMessages: [msg], policy }).kind, msg).toBe('mention');
    }
  });

  it('manda la declaración más reciente: "ahora vivo en Madrid" anula un "vivo en Lima" anterior', () => {
    const v = evaluateZone({
      phone: null,
      leadMessages: ['vivo en Lima', 'bueno, desde este año ahora vivo en Madrid'],
      policy: TANIA_ALLOW,
    });
    expect(v.kind).toBe('mention');
  });

  it('una residencia declarada en cualquier mensaje gana a una mención anterior', () => {
    const v = evaluateZone({
      phone: null,
      leadMessages: ['soy peruana', 'y vivo en Lima con mis hijos'],
      policy: TANIA_ALLOW,
    });
    expect(v.kind).toBe('reject_by_declaration');
  });

  it('sin teléfono y sin pistas → clear', () => {
    expect(
      evaluateZone({ phone: null, leadMessages: ['me duele la espalda'], policy: TANIA_ALLOW }).kind,
    ).toBe('clear');
  });

  it('lista blanca sin términos: sin teléfono no hay veredicto', () => {
    const onlyAllow = parseZonePolicy({ zone_allowlist: { always: ['ES'] } })!;
    expect(evaluateZone({ phone: null, leadMessages: ['Lima'], policy: onlyAllow }).kind).toBe('clear');
    expect(evaluateZone({ phone: '+51987654321', leadMessages: [], policy: onlyAllow }).kind).toBe('reject_by_prefix');
  });
});

describe('evaluateZone — menciones en el chat (Instagram, sin teléfono)', () => {
  it('detecta el país escrito a pelo ("Colombia", conv 10792) y el "vivo en Venezuela" (conv 10260)', () => {
    const a = evaluateZone({ phone: null, leadMessages: ['Colombia'], policy: TANIA });
    expect(a.kind).toBe('mention');
    if (a.kind === 'mention') expect(a.term).toBe('colombia');

    // Desde 2026-09-26 "yo vivo en Venezuela" es residencia declarada, no mención.
    const b = evaluateZone({
      phone: null,
      leadMessages: ['Ya tengo 4 años', 'ak dónde yo vivo en Venezuela no tenemos hospitales'],
      policy: TANIA,
    });
    expect(b.kind).toBe('reject_by_declaration');
    if (b.kind === 'reject_by_declaration') {
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
    expect(v.kind).toBe('reject_by_declaration');
    if (v.kind === 'reject_by_declaration') expect(v.excerpt.length).toBeLessThanOrEqual(91);
    const m = evaluateZone({ phone: null, leadMessages: [`Soy de Caracas ${'y '.repeat(80)}`], policy: TANIA });
    expect(m.kind).toBe('mention');
    if (m.kind === 'mention') expect(m.excerpt.length).toBeLessThanOrEqual(91);
  });
});

describe('evaluateZone — residencia del formulario con prefijo de fuera (D1, 2026-09-26)', () => {
  it('+502 con "En Canadá" en el formulario → prefix_out_residence_in (pasa a la entrenadora)', () => {
    const v = evaluateZone({
      phone: '+50258746350',
      leadMessages: ['Hola, sí'],
      policy: TANIA_ALLOW,
      declaredResidence: 'En Canadá ',
    });
    expect(v.kind).toBe('prefix_out_residence_in');
    if (v.kind === 'prefix_out_residence_in') {
      expect(v.country.iso).toBe('GT');
      expect(v.declaredIso).toBe('CA');
      expect(v.declaredName).toBe('Canadá');
    }
    expect(isZoneRejectVerdict(v)).toBe(false);
  });

  it('una residencia con señal de fuera, una ciudad sin país o un país de fuera no activan la excepción', () => {
    for (const declared of ['Cañada de Gómez, Santa Fe, Argentina', 'Vivo en Madrid', 'Peru', 'Grecia, Alajuela', '']) {
      const v = evaluateZone({ phone: '+51987654321', leadMessages: [], policy: TANIA_ALLOW, declaredResidence: declared });
      expect(v.kind, declared).toBe('reject_by_prefix');
    }
  });

  it('sin lista blanca la residencia del formulario no cambia nada (lista negra de siempre)', () => {
    const v = evaluateZone({ phone: '+50258746350', leadMessages: [], policy: TANIA, declaredResidence: 'En Canadá' });
    expect(v.kind).toBe('reject_by_prefix');
  });
});

describe('parseZonePolicy — zone_close_message (2026-09-26)', () => {
  it('lee el literal del cierre burbuja a burbuja', () => {
    const p = parseZonePolicy({
      zone_allowlist: { always: ['ES'] },
      zone_close_message: ['  En mi perfil tienes mucho contenido  ', 'Cualquier duda, escríbeme'],
    })!;
    expect(p.closeParts).toEqual(['En mi perfil tienes mucho contenido', 'Cualquier duda, escríbeme']);
  });

  it('un string es una burbuja; vacío, demasiadas burbujas o basura se ignoran', () => {
    expect(parseZonePolicy({ zone_allowlist: { always: ['ES'] }, zone_close_message: 'Hasta pronto' })!.closeParts).toEqual([
      'Hasta pronto',
    ]);
    for (const bad of [[], ['', '  '], ['a', 'b', 'c', 'd', 'e'], 42, null]) {
      expect(parseZonePolicy({ zone_allowlist: { always: ['ES'] }, zone_close_message: bad })!.closeParts).toBeUndefined();
    }
  });
});
