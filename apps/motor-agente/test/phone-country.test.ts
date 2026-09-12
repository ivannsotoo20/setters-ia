import { describe, expect, it } from 'vitest';
import { inferCountryFromPhone } from '../src/lib/phone-country.js';

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
