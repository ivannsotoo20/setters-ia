import { describe, it, expect } from 'vitest';
import { buildPhaseFocusInstruction } from '../src/lib/phase-focus.js';

// =============================================================================
// Focal de fase y focal de cierre por zona (2026-09-26).
//
// La focal es el ÚLTIMO bloque del prompt y el modelo la lee como la orden
// vigente. En la conv 12203 (+57, Instagram) la directiva de zona mandaba cerrar
// y la focal decía "FASE 1… no extraer datos de cualificación": ganó la focal y
// el setter siguió 24 mensajes. Con `zoneClose`, la focal ES el cierre.
// =============================================================================

describe('buildPhaseFocusInstruction — cierre por zona', () => {
  const zoneFocus = buildPhaseFocusInstruction(1, false, { zoneClose: true });

  it('sustituye a la focal de la fase: no habla de fase ni de seguir cualificando', () => {
    expect(zoneFocus).not.toMatch(/FASE \d/);
    expect(zoneFocus).not.toContain('NO extraer datos de cualificación');
    expect(zoneFocus).toContain('PRIORIDAD ABSOLUTA');
    expect(zoneFocus).toContain('ESTE TURNO CIERRA POR RESIDENCIA');
  });

  it('manda el cierre del bloque tal cual, sin país, motivo, preguntas, propuesta ni enlace', () => {
    expect(zoneFocus).toContain('coach_qualification_doesnt');
    expect(zoneFocus).toContain('tal cual');
    expect(zoneFocus).toContain('sin nombrar el país ni el motivo');
    expect(zoneFocus).toContain('sin preguntas');
    expect(zoneFocus).toContain('sin propuesta de videollamada');
    expect(zoneFocus).toContain('sin ningún enlace');
    expect(zoneFocus).toContain('conversation_status="disqualified"');
  });

  it('única excepción: residencia declarada en zona → handoff B_derivacion', () => {
    expect(zoneFocus).toContain('en el formulario o en el chat');
    expect(zoneFocus).toContain('conversation_status="handoff"');
    expect(zoneFocus).toContain('handoff_cause="B_derivacion"');
    expect(zoneFocus).toContain('le escribe la entrenadora');
  });

  it('no lleva literales del coach (el literal lo pone el bloque)', () => {
    expect(zoneFocus).not.toContain('En mi perfil');
    expect(zoneFocus).not.toContain('Tania');
    expect(zoneFocus).not.toMatch(/https?:\/\//);
  });

  it('es la misma en cualquier fase: la zona manda sobre la fase', () => {
    for (const phase of [1, 2, 3, 4, 5, 6, 7]) {
      expect(buildPhaseFocusInstruction(phase, false, { zoneClose: true })).toBe(zoneFocus);
    }
  });

  it('manda también sobre el modo handoff', () => {
    expect(buildPhaseFocusInstruction(3, true, { zoneClose: true })).toBe(zoneFocus);
  });
});

describe('buildPhaseFocusInstruction — sin cierre por zona, nada cambia', () => {
  it('sin opciones, zoneClose false o undefined, devuelve la focal de la fase', () => {
    const f1 = buildPhaseFocusInstruction(1, false);
    expect(f1).toContain('AHORA ESTÁS EN FASE 1');
    expect(buildPhaseFocusInstruction(1, false, {})).toBe(f1);
    expect(buildPhaseFocusInstruction(1, false, { zoneClose: false })).toBe(f1);
    expect(f1).not.toContain('CIERRA POR RESIDENCIA');
  });

  it('las fases 2 a 6 siguen con su objetivo', () => {
    expect(buildPhaseFocusInstruction(2)).toContain('FASE 2');
    expect(buildPhaseFocusInstruction(5)).toContain('FASE 5');
    expect(buildPhaseFocusInstruction(6)).toContain('FASE 6');
  });

  it('el modo handoff sigue igual', () => {
    expect(buildPhaseFocusInstruction(3, true)).toContain('AHORA ESTÁS EN HANDOFF');
  });
});

describe('buildPhaseFocusInstruction — paso a la entrenadora por zona (D1, 2026-09-26)', () => {
  // +502 con "En Canadá" en el formulario: en la batería del 26-09, con la
  // excepción solo explicada dentro de la focal de cierre, el modelo la cerró.
  const handoffFocus = buildPhaseFocusInstruction(1, false, { zoneClose: true, zoneHandoff: true });

  it('manda sobre la de cierre: pasa a la entrenadora con handoff B, no cierra', () => {
    expect(handoffFocus).toContain('PASA A LA ENTRENADORA');
    expect(handoffFocus).toContain('handoff_cause="B_derivacion"');
    expect(handoffFocus).not.toContain('conversation_status="disqualified"');
  });

  it('sin enlace ni propuesta', () => {
    expect(handoffFocus).toContain('Sin propuesta de videollamada y sin enlace');
  });
});
