import { describe, it, expect } from 'vitest';
import { interpolateTrainerPlaceholders } from '../src/interpolate.js';

describe('interpolateTrainerPlaceholders (Sprint Gamma 2.6)', () => {
  describe('reemplazos básicos', () => {
    it('reemplaza {{trainer_phone|fallback}} con phone cuando hay valor', () => {
      const out = interpolateTrainerPlaceholders('Llama al {{trainer_phone|equipo}}', {
        phone: '+34600123456',
      });
      expect(out).toBe('Llama al +34600123456');
    });

    it('reemplaza {{trainer_phone|fallback}} con fallback cuando phone es null', () => {
      const out = interpolateTrainerPlaceholders('Llama al {{trainer_phone|equipo}}', {
        phone: null,
      });
      expect(out).toBe('Llama al equipo');
    });

    it('reemplaza {{trainer_phone}} sin fallback con phone si hay valor', () => {
      const out = interpolateTrainerPlaceholders('Tel: {{trainer_phone}}', {
        phone: '+34600123456',
      });
      expect(out).toBe('Tel: +34600123456');
    });

    it('reemplaza {{trainer_phone}} sin fallback por string vacío si phone null', () => {
      const out = interpolateTrainerPlaceholders('Tel: {{trainer_phone}}', { phone: null });
      expect(out).toBe('Tel: ');
    });
  });

  describe('múltiples placeholders en el mismo texto', () => {
    it('reemplaza todas las ocurrencias', () => {
      const out = interpolateTrainerPlaceholders(
        'Tel1: {{trainer_phone|n/a}}, también: {{trainer_phone|n/a}}',
        { phone: '+34600' },
      );
      expect(out).toBe('Tel1: +34600, también: +34600');
    });

    it('mezcla con/sin fallback', () => {
      const out = interpolateTrainerPlaceholders('A: {{trainer_phone}} | B: {{trainer_phone|x}}', {
        phone: null,
      });
      expect(out).toBe('A:  | B: x');
    });
  });

  describe('ctx undefined / opcional', () => {
    it('cae al fallback cuando ctx no se pasa', () => {
      const out = interpolateTrainerPlaceholders('Tel: {{trainer_phone|sin tel}}');
      expect(out).toBe('Tel: sin tel');
    });

    it('phone vacío "" se trata como null y cae al fallback', () => {
      const out = interpolateTrainerPlaceholders('Tel: {{trainer_phone|sin tel}}', {
        phone: '',
      });
      expect(out).toBe('Tel: sin tel');
    });

    it('phone con solo whitespace cae al fallback', () => {
      const out = interpolateTrainerPlaceholders('Tel: {{trainer_phone|sin tel}}', {
        phone: '   ',
      });
      expect(out).toBe('Tel: sin tel');
    });
  });

  describe('defensa anti-rotura', () => {
    it('texto sin placeholders se devuelve idéntico', () => {
      const md = '## Causa B\n\nContenido normal sin placeholders';
      expect(interpolateTrainerPlaceholders(md, { phone: '+34600' })).toBe(md);
    });

    it('placeholders desconocidos NO se tocan (whitelist solo trainer_phone)', () => {
      const out = interpolateTrainerPlaceholders('{{trainer_email|x}} {{trainer_name|y}}', {
        phone: '+34',
      });
      // estos no son trainer_phone, se respetan literales
      expect(out).toContain('{{trainer_email|x}}');
      expect(out).toContain('{{trainer_name|y}}');
    });

    it('{{trainer_phone}} dentro de bloque markdown se interpola correctamente', () => {
      const md = `- **Teléfono**: {{trainer_phone|(no configurado)}}\n- Otra cosa`;
      const out = interpolateTrainerPlaceholders(md, { phone: '+34600123456' });
      expect(out).toContain('+34600123456');
      expect(out).not.toContain('{{');
    });

    it('phone con espacios alrededor se trimea antes de inyectar', () => {
      const out = interpolateTrainerPlaceholders('Tel: {{trainer_phone|x}}', {
        phone: '  +34600  ',
      });
      expect(out).toBe('Tel: +34600');
    });
  });
});
