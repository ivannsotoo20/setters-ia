import { describe, it, expect } from 'vitest';
import { interpolateTrainerPlaceholders, renderHandoffDirective } from '../src/interpolate.js';
import type { TrainerContext } from '../src/types.js';

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

// =============================================================================
// Sprint Gamma 2.6b — renderHandoffDirective + placeholder {{handoff_directive}}
// =============================================================================

describe('renderHandoffDirective (Sprint 2.6b)', () => {
  describe('modo legacy (handoff.enabled=false o ctx undefined)', () => {
    it('ctx undefined → frase genérica sin canal', () => {
      const out = renderHandoffDirective();
      expect(out).toContain('NO ofrezcas ningún canal');
      expect(out).toContain('el equipo te contactará en breve');
    });

    it('ctx con phone pero handoff disabled → comparte phone (compat v2)', () => {
      const ctx: TrainerContext = { phone: '+34600123456' };
      const out = renderHandoffDirective(ctx);
      expect(out).toContain('+34600123456');
      expect(out).toContain('una sola vez');
      expect(out).toContain('NUNCA inventes otros canales');
    });

    it('ctx sin phone y handoff disabled → frase genérica', () => {
      const ctx: TrainerContext = { phone: null };
      const out = renderHandoffDirective(ctx);
      expect(out).toContain('NO ofrezcas ningún canal');
    });
  });

  describe('modo personalizado share_phone', () => {
    it('con phone → comparte', () => {
      const out = renderHandoffDirective({
        phone: '+34659487594',
        handoff: { enabled: true, mode: 'share_phone', template: 'warm', customMessage: null },
      });
      expect(out).toContain('+34659487594');
      expect(out).toContain('una sola vez');
    });

    it('sin phone → degrada a silent automático con warning explícito', () => {
      const out = renderHandoffDirective({
        phone: null,
        handoff: { enabled: true, mode: 'share_phone', template: 'warm', customMessage: null },
      });
      expect(out).toContain('NO lo tiene configurado');
      expect(out).toContain('degrada a silencioso');
      expect(out).toContain('NO ofrezcas ningún canal');
    });
  });

  describe('modo personalizado silent', () => {
    it('emite directiva NO compartir + email al trainer', () => {
      const out = renderHandoffDirective({
        phone: '+34600',
        handoff: { enabled: true, mode: 'silent', template: 'warm', customMessage: null },
      });
      expect(out).toContain('NO ofrezcas ningún canal');
      expect(out).toContain('atenderá manualmente tras recibir email');
      expect(out).not.toContain('+34600');
    });
  });

  describe('modo personalizado custom_message', () => {
    it('template=warm → preset cálido inyectado', () => {
      const out = renderHandoffDirective({
        phone: null,
        handoff: { enabled: true, mode: 'custom_message', template: 'warm', customMessage: null },
      });
      expect(out).toContain('Te paso con mi equipo personalmente');
      expect(out).toContain('🙏');
      expect(out).toContain('EXACTAMENTE');
    });

    it('template=professional → preset profesional inyectado', () => {
      const out = renderHandoffDirective({
        phone: null,
        handoff: {
          enabled: true,
          mode: 'custom_message',
          template: 'professional',
          customMessage: null,
        },
      });
      expect(out).toContain('Cierro la conversación aquí');
      expect(out).toContain('te responderá lo antes posible');
    });

    it('template=free + customMessage set → usa el texto libre', () => {
      const out = renderHandoffDirective({
        phone: null,
        handoff: {
          enabled: true,
          mode: 'custom_message',
          template: 'free',
          customMessage: 'Te respondo mañana en cuanto abra la academia 💪',
        },
      });
      expect(out).toContain('Te respondo mañana en cuanto abra la academia');
      expect(out).toContain('EXACTAMENTE');
    });

    it('template=free + customMessage null → degrada a warm preset', () => {
      const out = renderHandoffDirective({
        phone: null,
        handoff: {
          enabled: true,
          mode: 'custom_message',
          template: 'free',
          customMessage: null,
        },
      });
      // Cae al warm preset
      expect(out).toContain('Te paso con mi equipo personalmente');
    });

    it('NUNCA añade canales que el trainer no haya mencionado', () => {
      const out = renderHandoffDirective({
        phone: '+34600',
        handoff: {
          enabled: true,
          mode: 'custom_message',
          template: 'free',
          customMessage: 'Solo cierro y vuelvo mañana',
        },
      });
      expect(out).toContain('NO añadas canales');
      expect(out).not.toContain('+34600'); // phone NO se inyecta en custom mode
    });
  });
});

describe('interpolateTrainerPlaceholders + {{handoff_directive}} (Sprint 2.6b)', () => {
  it('reemplaza {{handoff_directive}} con renderHandoffDirective output', () => {
    const text = 'Antes\n{{handoff_directive}}\nDespués';
    const out = interpolateTrainerPlaceholders(text, {
      phone: '+34600',
      handoff: { enabled: true, mode: 'silent', template: 'warm', customMessage: null },
    });
    expect(out).toContain('Antes');
    expect(out).toContain('Después');
    expect(out).toContain('NO ofrezcas ningún canal');
    expect(out).not.toContain('{{handoff_directive}}');
  });

  it('handoff_directive sin ctx también funciona (cae a legacy)', () => {
    const text = '{{handoff_directive}}';
    const out = interpolateTrainerPlaceholders(text);
    expect(out).not.toContain('{{');
    expect(out.length).toBeGreaterThan(50); // emitió algo
  });

  it('NO-ROTURA: directiva total + handoff_v4 contexto < 3500 chars con custom message al máximo', () => {
    const fakeHandoffV4Body =
      'Protocolo handoff doble capa con causas A B C D + reglas R10-R15 +'.padEnd(2500, ' x');
    const text = fakeHandoffV4Body + '\n\n{{handoff_directive}}';
    const out = interpolateTrainerPlaceholders(text, {
      phone: '+34659487594',
      handoff: {
        enabled: true,
        mode: 'custom_message',
        template: 'free',
        customMessage: 'a'.repeat(250),
      },
    });
    expect(out.length).toBeLessThan(3500);
  });
});

describe('interpolateTrainerPlaceholders — {{available_slots}} (Hito 10.6)', () => {
  it('reemplaza con el bloque markdown cuando availableSlotsBlock está presente', () => {
    const ctx: TrainerContext = {
      phone: null,
      availableSlotsBlock: '- lunes 19 may, 17:00  (2026-05-19T17:00:00+02:00)\n- martes 20 may, 10:00  (2026-05-20T10:00:00+02:00)',
    };
    const out = interpolateTrainerPlaceholders(
      'Slots disponibles:\n{{available_slots|fallback}}',
      ctx,
    );
    expect(out).toContain('lunes 19 may, 17:00');
    expect(out).toContain('martes 20 may, 10:00');
    expect(out).not.toContain('fallback');
  });

  it('cae al fallback cuando availableSlotsBlock es null', () => {
    const out = interpolateTrainerPlaceholders(
      '{{available_slots|Pide al lead cuándo le viene mejor.}}',
      { phone: null, availableSlotsBlock: null },
    );
    expect(out).toBe('Pide al lead cuándo le viene mejor.');
  });

  it('cae al fallback cuando availableSlotsBlock es string vacío', () => {
    const out = interpolateTrainerPlaceholders(
      '{{available_slots|N/A}}',
      { phone: null, availableSlotsBlock: '   ' },
    );
    expect(out).toBe('N/A');
  });

  it('cae a string vacío si no hay fallback ni slots', () => {
    const out = interpolateTrainerPlaceholders('{{available_slots}}', {
      phone: null,
    });
    expect(out).toBe('');
  });

  it('funciona junto con otros placeholders del trainer', () => {
    const out = interpolateTrainerPlaceholders(
      'Tel: {{trainer_phone|sin tel}} | Slots: {{available_slots|sin slots}}',
      {
        phone: '+34666',
        availableSlotsBlock: '- jueves 22 may, 18:00  (2026-05-22T18:00:00+02:00)',
      },
    );
    expect(out).toContain('Tel: +34666');
    expect(out).toContain('jueves 22 may, 18:00');
  });
});

describe('interpolateTrainerPlaceholders — {{lead_timezone_label}} / {{trainer_timezone_label}} (Hito 11)', () => {
  it('reemplaza lead_timezone_label cuando está presente', () => {
    const out = interpolateTrainerPlaceholders(
      'el martes a las 13h {{lead_timezone_label|hora local}}, ¿te encaja?',
      {
        phone: null,
        leadTimezoneLabel: 'hora Argentina',
      },
    );
    expect(out).toBe('el martes a las 13h hora Argentina, ¿te encaja?');
  });

  it('cae al fallback cuando leadTimezoneLabel es null', () => {
    const out = interpolateTrainerPlaceholders(
      'el martes a las 13h {{lead_timezone_label|hora local}}, ¿te encaja?',
      { phone: null, leadTimezoneLabel: null },
    );
    expect(out).toBe('el martes a las 13h hora local, ¿te encaja?');
  });

  it('reemplaza trainer_timezone_label cuando está presente', () => {
    const out = interpolateTrainerPlaceholders(
      'tu zona ({{trainer_timezone_label|tu zona}}) vs lead',
      {
        phone: null,
        trainerTimezoneLabel: 'hora España',
      },
    );
    expect(out).toBe('tu zona (hora España) vs lead');
  });

  it('los dos placeholders coexisten en el mismo texto', () => {
    const out = interpolateTrainerPlaceholders(
      'lead: {{lead_timezone_label|hora local}} | trainer: {{trainer_timezone_label|tu zona}}',
      {
        phone: null,
        leadTimezoneLabel: 'hora Argentina',
        trainerTimezoneLabel: 'hora España',
      },
    );
    expect(out).toBe('lead: hora Argentina | trainer: hora España');
  });

  it('si ctx no se pasa, ambos placeholders caen a sus fallbacks', () => {
    const out = interpolateTrainerPlaceholders(
      '{{lead_timezone_label|X}} {{trainer_timezone_label|Y}}',
    );
    expect(out).toBe('X Y');
  });

  it('whitespace-only se trata como null y cae al fallback', () => {
    const out = interpolateTrainerPlaceholders('{{lead_timezone_label|FB}}', {
      phone: null,
      leadTimezoneLabel: '   ',
    });
    expect(out).toBe('FB');
  });
});
