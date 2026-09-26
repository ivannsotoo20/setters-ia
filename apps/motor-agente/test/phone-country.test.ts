import { describe, expect, it } from 'vitest';
import {
  __TEST_PREFIX_COUNTRY_MAP,
  inferCountryFromPhone,
  normalizePhoneDigits,
} from '../src/lib/phone-country.js';
import { EUROPE_ISO } from '../src/lib/zone-config.js';

describe('inferCountryFromPhone', () => {
  it('reconoce España en sus formas habituales', () => {
    for (const p of ['+34600123456', '+34 600 12 34 56', '34-600-12-34-56', '0034600123456']) {
      expect(inferCountryFromPhone(p)?.iso, p).toBe('ES');
    }
  });

  it('reconoce los países de la lista de no contacto de Tania por su prefijo', () => {
    const cases: Array<[string, string]> = [
      ['+50258746350', 'GT'],
      ['+50371234567', 'SV'],
      ['+584121234567', 'VE'],
      ['+5351234567', 'CU'],
      ['+18091234567', 'DO'],
      ['+18291234567', 'DO'],
      ['+573001234567', 'CO'],
      ['+59171234567', 'BO'],
      ['+593991234567', 'EC'],
      ['+5491134567890', 'AR'],
    ];
    for (const [phone, iso] of cases) {
      expect(inferCountryFromPhone(phone)?.iso, phone).toBe(iso);
    }
  });

  it('el prefijo largo gana al corto: +598 es Uruguay, +1809 es R. Dominicana, +1 a secas es US/CA', () => {
    expect(inferCountryFromPhone('+59891234567')?.iso).toBe('UY');
    expect(inferCountryFromPhone('+18095551234')?.iso).toBe('DO');
    expect(inferCountryFromPhone('+12125551234')?.iso).toBe('US');
  });

  it('devuelve el nombre en español y el prefijo sin +', () => {
    expect(inferCountryFromPhone('+50258746350')).toEqual({
      iso: 'GT',
      name: 'Guatemala',
      prefix: '502',
    });
  });

  it('null para vacío, basura o prefijo sin número detrás', () => {
    expect(inferCountryFromPhone(null)).toBeNull();
    expect(inferCountryFromPhone(undefined)).toBeNull();
    expect(inferCountryFromPhone('')).toBeNull();
    expect(inferCountryFromPhone('abc')).toBeNull();
    expect(inferCountryFromPhone('+34')).toBeNull();
    expect(inferCountryFromPhone('+999123456789')).toBeNull();
  });
});

// =============================================================================
// 2026-09-26 — cobertura para la lista blanca de zona: un prefijo que no se
// reconoce ya no es neutro, así que el mapa tiene que cubrir lo que escribe.
// =============================================================================

describe('inferCountryFromPhone — Europa entera', () => {
  it('reconoce los prefijos europeos que antes devolvían null', () => {
    const cases: Array<[string, string]> = [
      ['+48601234567', 'PL'],
      ['+46701234567', 'SE'],
      ['+4520123456', 'DK'],
      ['+306912345678', 'GR'],
      ['+36201234567', 'HU'],
      ['+40721234567', 'RO'],
      ['+4791234567', 'NO'],
      ['+298211234', 'FO'],
      ['+35056123456', 'GI'],
      ['+352621123456', 'LU'],
      ['+3546111234', 'IS'],
      ['+355691234567', 'AL'],
      ['+35679123456', 'MT'],
      ['+35799123456', 'CY'],
      ['+358401234567', 'FI'],
      ['+359881234567', 'BG'],
      ['+37061234567', 'LT'],
      ['+37121234567', 'LV'],
      ['+3725123456', 'EE'],
      ['+37360123456', 'MD'],
      ['+375291234567', 'BY'],
      ['+37761234567', 'MC'],
      ['+378661234567', 'SM'],
      ['+380501234567', 'UA'],
      ['+381601234567', 'RS'],
      ['+38267123456', 'ME'],
      ['+38344123456', 'XK'],
      ['+385911234567', 'HR'],
      ['+38640123456', 'SI'],
      ['+38761123456', 'BA'],
      ['+38970123456', 'MK'],
      ['+420601123456', 'CZ'],
      ['+421901123456', 'SK'],
      ['+4237812345', 'LI'],
    ];
    for (const [phone, iso] of cases) {
      expect(inferCountryFromPhone(phone)?.iso, phone).toBe(iso);
    }
  });

  it('todo país de EUROPE_ISO tiene prefijo en el mapa (salvo el Vaticano, que marca por el +39)', () => {
    const isos = new Set(Object.values(__TEST_PREFIX_COUNTRY_MAP).map((c) => c.iso));
    const missing = EUROPE_ISO.filter((iso) => iso !== 'VA' && !isos.has(iso));
    expect(missing).toEqual([]);
  });

  it('+7 es Rusia, y no se come a Kazajistán (+76 / +77)', () => {
    expect(inferCountryFromPhone('+79161234567')).toEqual({ iso: 'RU', name: 'Rusia', prefix: '7' });
    expect(inferCountryFromPhone('+74951234567')?.iso).toBe('RU');
    expect(inferCountryFromPhone('+77011234567')).toEqual({ iso: 'KZ', name: 'Kazajistán', prefix: '77' });
    expect(inferCountryFromPhone('+76001234567')?.iso).toBe('KZ');
  });

  it('Armenia (+374) cae en el bloque europeo pero sale como Armenia, no como Europa', () => {
    expect(inferCountryFromPhone('+37491123456')?.iso).toBe('AM');
    expect(EUROPE_ISO).not.toContain('AM');
  });
});

describe('inferCountryFromPhone — Caribe del NANP (+1XXX)', () => {
  it('cada código de área del Caribe y el Pacífico es su país, no Estados Unidos', () => {
    const cases: Array<[string, string]> = [
      ['+12425551234', 'BS'],
      ['+12465551234', 'BB'],
      ['+12645551234', 'AI'],
      ['+12685551234', 'AG'],
      ['+12845551234', 'VG'],
      ['+13405551234', 'VI'],
      ['+13455551234', 'KY'],
      ['+14415551234', 'BM'],
      ['+14735551234', 'GD'],
      ['+16495551234', 'TC'],
      ['+16585551234', 'JM'],
      ['+16645551234', 'MS'],
      ['+16705551234', 'MP'],
      ['+16715551234', 'GU'],
      ['+16845551234', 'AS'],
      ['+17215551234', 'SX'],
      ['+17585551234', 'LC'],
      ['+17675551234', 'DM'],
      ['+17845551234', 'VC'],
      ['+17875551234', 'PR'],
      ['+19395551234', 'PR'],
      ['+18095551234', 'DO'],
      ['+18295551234', 'DO'],
      ['+18495551234', 'DO'],
      ['+18685551234', 'TT'],
      ['+18695551234', 'KN'],
      ['+18765551234', 'JM'],
    ];
    for (const [phone, iso] of cases) {
      expect(inferCountryFromPhone(phone)?.iso, phone).toBe(iso);
    }
  });

  it('Jamaica (+1876) y Trinidad (+1868) ya no "cualifican" como Estados Unidos', () => {
    expect(inferCountryFromPhone('+18761234567')).toEqual({ iso: 'JM', name: 'Jamaica', prefix: '1876' });
    expect(inferCountryFromPhone('+18681234567')).toEqual({
      iso: 'TT',
      name: 'Trinidad y Tobago',
      prefix: '1868',
    });
  });

  it('el +1 genérico sigue siendo Estados Unidos o Canadá', () => {
    // Nueva York, Toronto, Miami.
    for (const p of ['+12125551234', '+14165551234', '+13055551234']) {
      expect(inferCountryFromPhone(p), p).toEqual({ iso: 'US', name: 'Estados Unidos o Canadá', prefix: '1' });
    }
  });
});

describe('inferCountryFromPhone — resto de Latinoamérica y del mundo', () => {
  it('Latinoamérica que faltaba', () => {
    const cases: Array<[string, string]> = [
      ['+5016101234', 'BZ'],
      ['+50934123456', 'HT'],
      ['+5926123456', 'GY'],
      ['+594694123456', 'GF'],
      ['+5978123456', 'SR'],
      ['+590690123456', 'GP'],
      ['+596696123456', 'MQ'],
      ['+2975601234', 'AW'],
      ['+59995123456', 'CW'],
      ['+5511912345678', 'BR'],
    ];
    for (const [phone, iso] of cases) {
      expect(inferCountryFromPhone(phone)?.iso, phone).toBe(iso);
    }
  });

  it('los del resto del mundo más habituales', () => {
    const cases: Array<[string, string]> = [
      ['+212612345678', 'MA'],
      ['+213551234567', 'DZ'],
      ['+21620123456', 'TN'],
      ['+201001234567', 'EG'],
      ['+2348031234567', 'NG'],
      ['+27821234567', 'ZA'],
      ['+905321234567', 'TR'],
      ['+919812345678', 'IN'],
      ['+923001234567', 'PK'],
      ['+8613812345678', 'CN'],
      ['+819012345678', 'JP'],
      ['+821012345678', 'KR'],
      ['+639171234567', 'PH'],
      ['+628121234567', 'ID'],
      ['+60123456789', 'MY'],
      ['+66812345678', 'TH'],
      ['+84912345678', 'VN'],
      ['+971501234567', 'AE'],
      ['+966501234567', 'SA'],
      ['+972501234567', 'IL'],
      ['+989121234567', 'IR'],
      ['+240222123456', 'GQ'],
    ];
    for (const [phone, iso] of cases) {
      expect(inferCountryFromPhone(phone)?.iso, phone).toBe(iso);
    }
  });

  it('nombres en español', () => {
    expect(inferCountryFromPhone('+212612345678')?.name).toBe('Marruecos');
    expect(inferCountryFromPhone('+48601234567')?.name).toBe('Polonia');
    expect(inferCountryFromPhone('+50934123456')?.name).toBe('Haití');
    expect(inferCountryFromPhone('+966501234567')?.name).toBe('Arabia Saudí');
  });
});

describe('inferCountryFromPhone — el mapa es coherente', () => {
  it('ningún prefijo queda tapado por otro: cada entrada se reconoce a sí misma', () => {
    for (const [prefix, entry] of Object.entries(__TEST_PREFIX_COUNTRY_MAP)) {
      const got = inferCountryFromPhone(`+${prefix}0000000`);
      expect(got, prefix).toEqual({ iso: entry.iso, name: entry.name, prefix });
    }
  });

  it('todas las entradas llevan ISO de dos letras en mayúsculas y nombre', () => {
    for (const [prefix, entry] of Object.entries(__TEST_PREFIX_COUNTRY_MAP)) {
      expect(entry.iso, prefix).toMatch(/^[A-Z]{2}$/);
      expect(entry.name.trim().length, prefix).toBeGreaterThan(0);
      expect(prefix, prefix).toMatch(/^\d{1,4}$/);
    }
  });
});

describe('normalizePhoneDigits', () => {
  it('quita "+", "00" y separadores', () => {
    expect(normalizePhoneDigits('+34 600-12-34-56')).toBe('34600123456');
    expect(normalizePhoneDigits('0034600123456')).toBe('34600123456');
    expect(normalizePhoneDigits('(+51) 987 654 321')).toBe('51987654321');
  });

  it('null si no queda ningún dígito', () => {
    expect(normalizePhoneDigits(null)).toBeNull();
    expect(normalizePhoneDigits('')).toBeNull();
    expect(normalizePhoneDigits('   ')).toBeNull();
    expect(normalizePhoneDigits('+')).toBeNull();
  });
});
