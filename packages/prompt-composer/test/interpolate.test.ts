import { describe, it, expect } from 'vitest';
import {
  buildGenderVerificationDirective,
  buildLeadAddressingDirective,
  interpolatePhasePriorities,
  interpolateTrainerPlaceholders,
  renderHandoffDirective,
} from '../src/interpolate.js';
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

// =============================================================================
// Cerebro v5 — {{current_phase_focus}} + interpolatePhasePriorities
// =============================================================================

describe('interpolateTrainerPlaceholders — {{current_phase_focus}} (Cerebro v5)', () => {
  it('reemplaza con currentPhaseFocus cuando está presente', () => {
    const out = interpolateTrainerPlaceholders(
      'Foco: {{current_phase_focus|sin foco definido}}',
      {
        phone: null,
        currentPhaseFocus: 'AHORA EN FASE 3 — CUALIFICACIÓN. Hard cap 2 mensajes.',
      },
    );
    expect(out).toBe('Foco: AHORA EN FASE 3 — CUALIFICACIÓN. Hard cap 2 mensajes.');
  });

  it('cae al fallback cuando currentPhaseFocus es null', () => {
    const out = interpolateTrainerPlaceholders(
      'Foco: {{current_phase_focus|sin foco definido}}',
      { phone: null, currentPhaseFocus: null },
    );
    expect(out).toBe('Foco: sin foco definido');
  });

  it('cae al fallback cuando ctx no se pasa', () => {
    const out = interpolateTrainerPlaceholders(
      'Foco: {{current_phase_focus|sin foco definido}}',
    );
    expect(out).toBe('Foco: sin foco definido');
  });

  it('whitespace-only se trata como null y cae al fallback', () => {
    const out = interpolateTrainerPlaceholders('{{current_phase_focus|FB}}', {
      phone: null,
      currentPhaseFocus: '   ',
    });
    expect(out).toBe('FB');
  });
});

describe('interpolatePhasePriorities (Cerebro v5)', () => {
  const samplePrompt = [
    '<phase1 priority="{{phase1_priority|reference}}">F1</phase1>',
    '<phase2 priority="{{phase2_priority|reference}}">F2</phase2>',
    '<phase3 priority="{{phase3_priority|reference}}">F3</phase3>',
    '<phase4 priority="{{phase4_priority|reference}}">F4</phase4>',
    '<phase5 priority="{{phase5_priority|reference}}">F5</phase5>',
    '<phase6 priority="{{phase6_priority|reference}}">F6</phase6>',
  ].join('\n');

  it('marca solo la fase activa con priority="active"', () => {
    const out = interpolatePhasePriorities(samplePrompt, 3);
    expect(out).toContain('<phase3 priority="active">');
    expect(out).toContain('<phase1 priority="reference">');
    expect(out).toContain('<phase2 priority="reference">');
    expect(out).toContain('<phase4 priority="reference">');
    expect(out).toContain('<phase5 priority="reference">');
    expect(out).toContain('<phase6 priority="reference">');
    expect(out).not.toContain('{{phase');
  });

  it('funciona para fase 1 (extremo bajo)', () => {
    const out = interpolatePhasePriorities(samplePrompt, 1);
    expect(out).toContain('<phase1 priority="active">');
    expect(out).toContain('<phase6 priority="reference">');
  });

  it('funciona para fase 6 (extremo alto)', () => {
    const out = interpolatePhasePriorities(samplePrompt, 6);
    expect(out).toContain('<phase6 priority="active">');
    expect(out).toContain('<phase1 priority="reference">');
  });

  it('respeta fallbacks personalizados distintos a "reference"', () => {
    const customPrompt = '<phase2 priority="{{phase2_priority|inactive}}">F2</phase2>';
    const out = interpolatePhasePriorities(customPrompt, 3);
    expect(out).toContain('<phase2 priority="inactive">');
  });

  it('placeholders sin fallback caen a "reference" cuando NO son la fase activa', () => {
    const noFallback = '<phase2 priority="{{phase2_priority}}">F2</phase2>';
    const out = interpolatePhasePriorities(noFallback, 3);
    expect(out).toContain('<phase2 priority="reference">');
  });

  it('placeholders sin fallback caen a "active" cuando SÍ son la fase activa', () => {
    const noFallback = '<phase3 priority="{{phase3_priority}}">F3</phase3>';
    const out = interpolatePhasePriorities(noFallback, 3);
    expect(out).toContain('<phase3 priority="active">');
  });

  it('fuera de rango (0, 7) cae a fallback en todas las fases (defensivo)', () => {
    const out = interpolatePhasePriorities(samplePrompt, 7);
    expect(out).not.toContain('priority="active"');
    expect(out).toContain('priority="reference"');
    expect(out).not.toContain('{{phase');
  });

  it('texto sin placeholders se devuelve idéntico', () => {
    const md = '## Sección estática\n\nSin placeholders de fase aquí.';
    expect(interpolatePhasePriorities(md, 3)).toBe(md);
  });
});

// =============================================================================
// Hito 12.2 — buildLeadAddressingDirective
// =============================================================================

describe('buildLeadAddressingDirective (Hito 12.2)', () => {
  it('mode=never → directiva NO menciones nombre, independiente del lead', () => {
    const d = buildLeadAddressingDirective({
      mode: 'never',
      maxMentions: 3,
      leadInference: { parsedName: 'Andrea', parsedNameStatus: 'usable', detectedGender: 'female' },
    });
    expect(d).toContain('NO debes mencionar el nombre del lead');
  });

  it('mode=auto + maxMentions=0 → degrada a "no menciones"', () => {
    const d = buildLeadAddressingDirective({
      mode: 'auto',
      maxMentions: 0,
      leadInference: { parsedName: 'Andrea', parsedNameStatus: 'usable', detectedGender: 'female' },
    });
    expect(d).toContain('NO debes mencionar el nombre');
  });

  it('mode=auto + usable + name → instrucción con nombre y maxMentions', () => {
    const d = buildLeadAddressingDirective({
      mode: 'auto',
      maxMentions: 2,
      leadInference: { parsedName: 'Andrea', parsedNameStatus: 'usable', detectedGender: 'female' },
    });
    expect(d).toContain('**Andrea**');
    expect(d).toContain('máximo 2 veces');
    expect(d).not.toContain('modo flexible');
  });

  it('mode=auto + not_usable → "no menciones (datos no aportan)"', () => {
    const d = buildLeadAddressingDirective({
      mode: 'auto',
      maxMentions: 2,
      leadInference: { parsedName: null, parsedNameStatus: 'not_usable', detectedGender: 'unknown' },
    });
    expect(d).toContain('NO aportan un nombre humano legible');
  });

  it('mode=always + name → instrucción con nombre + nota flexible', () => {
    const d = buildLeadAddressingDirective({
      mode: 'always',
      maxMentions: 3,
      leadInference: { parsedName: 'Andrea', parsedNameStatus: 'not_usable', detectedGender: 'unknown' },
    });
    expect(d).toContain('**Andrea**');
    expect(d).toContain('modo flexible');
  });

  it('mode=always + sin nombre → directiva fallback "no inventes"', () => {
    const d = buildLeadAddressingDirective({
      mode: 'always',
      maxMentions: 3,
      leadInference: { parsedName: null, parsedNameStatus: 'unknown', detectedGender: 'unknown' },
    });
    expect(d).toContain('NO aportan un nombre');
    expect(d).toContain('NO inventes');
  });

  it('mode=auto + leadInference null → directiva "no menciones"', () => {
    const d = buildLeadAddressingDirective({
      mode: 'auto',
      maxMentions: 2,
      leadInference: null,
    });
    expect(d).toContain('NO inventes un nombre');
  });

  it('maxMentions=1 → "vez" singular', () => {
    const d = buildLeadAddressingDirective({
      mode: 'auto',
      maxMentions: 1,
      leadInference: { parsedName: 'Carlos', parsedNameStatus: 'usable', detectedGender: 'male' },
    });
    expect(d).toContain('máximo 1 vez');
    expect(d).not.toContain('1 veces');
  });
});

// =============================================================================
// Hito 12.2 — buildGenderVerificationDirective
// =============================================================================

describe('buildGenderVerificationDirective (Hito 12.2)', () => {
  it('target=mixed → null (feature off)', () => {
    const d = buildGenderVerificationDirective({
      targetClientGender: 'mixed',
      verificationStyle: 'soft',
      leadInference: { parsedName: 'Andrea', parsedNameStatus: 'usable', detectedGender: 'female' },
    });
    expect(d).toBeNull();
  });

  it('target=male + lead=male → null (mismo género, no aplica)', () => {
    const d = buildGenderVerificationDirective({
      targetClientGender: 'male',
      verificationStyle: 'soft',
      leadInference: { parsedName: 'Carlos', parsedNameStatus: 'usable', detectedGender: 'male' },
    });
    expect(d).toBeNull();
  });

  it('target=male + lead=female → directiva soft (mismatch)', () => {
    const d = buildGenderVerificationDirective({
      targetClientGender: 'male',
      verificationStyle: 'soft',
      leadInference: { parsedName: 'Andrea', parsedNameStatus: 'usable', detectedGender: 'female' },
    });
    expect(d).not.toBeNull();
    expect(d).toContain('SOLO con hombres');
    expect(d).toContain('Estilo suave');
    expect(d).toContain('Fase 1');
    expect(d).not.toContain('Estilo directo');
  });

  it('target=female + lead=male → directiva soft con etiqueta "mujeres"', () => {
    const d = buildGenderVerificationDirective({
      targetClientGender: 'female',
      verificationStyle: 'soft',
      leadInference: { parsedName: 'Carlos', parsedNameStatus: 'usable', detectedGender: 'male' },
    });
    expect(d).not.toBeNull();
    expect(d).toContain('SOLO con mujeres');
  });

  it('verificationStyle=direct → menciona explícitamente el filtro', () => {
    const d = buildGenderVerificationDirective({
      targetClientGender: 'male',
      verificationStyle: 'direct',
      leadInference: { parsedName: 'Andrea', parsedNameStatus: 'usable', detectedGender: 'female' },
    });
    expect(d).not.toBeNull();
    expect(d).toContain('Estilo directo');
    expect(d).toContain('programa es solo para hombres');
  });

  it('lead=ambiguous → null (no formula pregunta)', () => {
    const d = buildGenderVerificationDirective({
      targetClientGender: 'male',
      verificationStyle: 'soft',
      leadInference: { parsedName: 'Sam', parsedNameStatus: 'usable', detectedGender: 'ambiguous' },
    });
    expect(d).toBeNull();
  });

  it('lead=unknown → null', () => {
    const d = buildGenderVerificationDirective({
      targetClientGender: 'male',
      verificationStyle: 'soft',
      leadInference: { parsedName: null, parsedNameStatus: 'not_usable', detectedGender: 'unknown' },
    });
    expect(d).toBeNull();
  });

  it('leadInference null → null', () => {
    const d = buildGenderVerificationDirective({
      targetClientGender: 'male',
      verificationStyle: 'soft',
      leadInference: null,
    });
    expect(d).toBeNull();
  });
});

// =============================================================================
// Hito 12.2 — placeholder {{lead_addressing_directive}}
// =============================================================================

describe('interpolateTrainerPlaceholders — {{lead_addressing_directive}}', () => {
  it('reemplaza con directiva cuando ctx.leadAddressingDirective tiene valor', () => {
    const text = 'Personalización: {{lead_addressing_directive|fallback genérico}}';
    const ctx: TrainerContext = {
      phone: null,
      leadAddressingDirective: 'Llama al lead Andrea',
    };
    const out = interpolateTrainerPlaceholders(text, ctx);
    expect(out).toBe('Personalización: Llama al lead Andrea');
  });

  it('cae a fallback cuando leadAddressingDirective es null', () => {
    const text = 'Personalización: {{lead_addressing_directive|no menciones nombre}}';
    const ctx: TrainerContext = {
      phone: null,
      leadAddressingDirective: null,
    };
    const out = interpolateTrainerPlaceholders(text, ctx);
    expect(out).toBe('Personalización: no menciones nombre');
  });

  it('cae a "" cuando no hay fallback ni valor', () => {
    const text = 'Sin nada: {{lead_addressing_directive}}';
    const ctx: TrainerContext = { phone: null };
    const out = interpolateTrainerPlaceholders(text, ctx);
    expect(out).toBe('Sin nada: ');
  });
});
