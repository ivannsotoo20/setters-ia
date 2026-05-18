import { describe, expect, it } from 'vitest';
import { inferTimezoneFromPhone } from '../src/lib/phone-to-timezone.js';

describe('inferTimezoneFromPhone', () => {
  it('detecta España desde +34', () => {
    expect(inferTimezoneFromPhone('+34600123456')).toBe('Europe/Madrid');
    expect(inferTimezoneFromPhone('+34 600 12 34 56')).toBe('Europe/Madrid');
    expect(inferTimezoneFromPhone('+34-600-12-34-56')).toBe('Europe/Madrid');
  });

  it('detecta Argentina desde +54', () => {
    expect(inferTimezoneFromPhone('+5491134567890')).toBe('America/Argentina/Buenos_Aires');
  });

  it('detecta México desde +52', () => {
    expect(inferTimezoneFromPhone('+525512345678')).toBe('America/Mexico_City');
  });

  it('detecta Colombia desde +57', () => {
    expect(inferTimezoneFromPhone('+573001234567')).toBe('America/Bogota');
  });

  it('detecta Chile desde +56', () => {
    expect(inferTimezoneFromPhone('+56912345678')).toBe('America/Santiago');
  });

  it('match por longitud descendente: +598 (Uruguay) gana sobre +5 inexistente', () => {
    expect(inferTimezoneFromPhone('+59891234567')).toBe('America/Montevideo');
    // +595 Paraguay (3 dígitos) gana sobre +5 (no existe)
    expect(inferTimezoneFromPhone('+595981234567')).toBe('America/Asuncion');
    // +593 Ecuador
    expect(inferTimezoneFromPhone('+593987654321')).toBe('America/Guayaquil');
  });

  it('detecta Brasil desde +55', () => {
    expect(inferTimezoneFromPhone('+5511987654321')).toBe('America/Sao_Paulo');
  });

  it('+1 → fallback US East (NANP — no diferenciamos por área)', () => {
    expect(inferTimezoneFromPhone('+12025551234')).toBe('America/New_York');
    // Números con prefijo NANP +1 (incl. R.Dominicana 809/829/849, Puerto Rico
    // 787/939, Canada, etc.) caen al fallback US East porque distinguirlos
    // requiere parsing del NANP — fuera de scope del MVP.
    expect(inferTimezoneFromPhone('+18091234567')).toBe('America/New_York');
  });

  it('devuelve null si el phone no es parseable', () => {
    expect(inferTimezoneFromPhone(null)).toBeNull();
    expect(inferTimezoneFromPhone(undefined)).toBeNull();
    expect(inferTimezoneFromPhone('')).toBeNull();
    expect(inferTimezoneFromPhone('   ')).toBeNull();
    expect(inferTimezoneFromPhone('letras')).toBeNull();
  });

  it('devuelve null si el prefijo no está en el mapa', () => {
    // +999 inexistente
    expect(inferTimezoneFromPhone('+9991234567')).toBeNull();
    // +666 inexistente
    expect(inferTimezoneFromPhone('+6661234567')).toBeNull();
  });

  it('phone demasiado corto (sin número detrás del prefijo) → null', () => {
    expect(inferTimezoneFromPhone('+34')).toBeNull();
    expect(inferTimezoneFromPhone('+341')).toBeNull();
  });

  it('acepta phone sin + leading', () => {
    expect(inferTimezoneFromPhone('34600123456')).toBe('Europe/Madrid');
  });

  it('detecta Cuba +53', () => {
    expect(inferTimezoneFromPhone('+5354123456')).toBe('America/Havana');
  });
});
