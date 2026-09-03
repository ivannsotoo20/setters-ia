import { describe, it, expect } from 'vitest';
import { maskPhone, parseLeadFormDecision } from '@/lib/lead-form-submissions-query';

describe('lead-form-submissions-query', () => {
  describe('parseLeadFormDecision', () => {
    it('acepta los tres valores válidos', () => {
      expect(parseLeadFormDecision('aprobado')).toBe('aprobado');
      expect(parseLeadFormDecision('rechazado')).toBe('rechazado');
      expect(parseLeadFormDecision('sin_filtro')).toBe('sin_filtro');
    });

    it('cualquier otra cosa (o nada) = sin filtro → null', () => {
      expect(parseLeadFormDecision(undefined)).toBeNull();
      expect(parseLeadFormDecision(null)).toBeNull();
      expect(parseLeadFormDecision('')).toBeNull();
      expect(parseLeadFormDecision('APROBADO')).toBeNull();
      expect(parseLeadFormDecision("' OR 1=1")).toBeNull();
    });
  });

  describe('maskPhone', () => {
    it('deja solo los 3 últimos dígitos', () => {
      expect(maskPhone('+34600123456')).toBe('••• 456');
      expect(maskPhone('34 600 123 456')).toBe('••• 456');
    });

    it('con menos de 4 dígitos no revela nada', () => {
      expect(maskPhone('123')).toBe('•••');
    });

    it('null / vacío / sin dígitos → null', () => {
      expect(maskPhone(null)).toBeNull();
      expect(maskPhone(undefined)).toBeNull();
      expect(maskPhone('')).toBeNull();
      expect(maskPhone('abc')).toBeNull();
    });
  });
});
