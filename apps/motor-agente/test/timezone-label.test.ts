import { describe, expect, it } from 'vitest';
import { timezoneToLabel } from '../src/lib/timezone-label.js';

describe('timezoneToLabel', () => {
  it('labels España y Argentina del mapa', () => {
    expect(timezoneToLabel('Europe/Madrid')).toBe('hora España');
    expect(timezoneToLabel('America/Argentina/Buenos_Aires')).toBe('hora Argentina');
  });

  it('labels Latam comunes', () => {
    expect(timezoneToLabel('America/Mexico_City')).toBe('hora México');
    expect(timezoneToLabel('America/Bogota')).toBe('hora Colombia');
    expect(timezoneToLabel('America/Lima')).toBe('hora Perú');
    expect(timezoneToLabel('America/Santiago')).toBe('hora Chile');
  });

  it('null/empty → null', () => {
    expect(timezoneToLabel(null)).toBeNull();
    expect(timezoneToLabel(undefined)).toBeNull();
    expect(timezoneToLabel('')).toBeNull();
  });

  it('IANA fuera del mapa → fallback "hora <ciudad>"', () => {
    // No está en el mapa pero es IANA válido — devuelve fallback derivado.
    expect(timezoneToLabel('Asia/Tokyo')).toBe('hora Tokyo');
    expect(timezoneToLabel('Pacific/Auckland')).toBe('hora Auckland');
    expect(timezoneToLabel('Africa/Cairo')).toBe('hora Cairo');
  });

  it('underscores se sustituyen por espacios en fallback', () => {
    expect(timezoneToLabel('Asia/Hong_Kong')).toBe('hora Hong Kong');
  });

  it('US zones del mapa', () => {
    expect(timezoneToLabel('America/New_York')).toBe('hora Este (US)');
    expect(timezoneToLabel('America/Los_Angeles')).toBe('hora Pacífico (US)');
  });
});
