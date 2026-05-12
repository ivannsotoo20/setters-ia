import { describe, it, expect } from 'vitest';
import {
  computeAutoPromotedPhase,
  AUTO_PROMOTE_SOURCES,
} from '../src/services/process-debounced.js';

// =============================================================================
// Sprint C (2026-05-12) — Tests para computeAutoPromotedPhase.
//
// Cubre: auto-promotion F1→F2 cuando lead responde a outbound clasificado.
// =============================================================================

describe('computeAutoPromotedPhase', () => {
  it('promotes F1→F2 cuando source=bienvenida y Generator dice 1', () => {
    const result = computeAutoPromotedPhase({
      currentPhase: 1,
      generatorPhase: 1,
      conversationSource: 'bienvenida',
    });
    expect(result).toBe(2);
  });

  it('promotes F1→F2 cuando source=lm y Generator dice 1', () => {
    const result = computeAutoPromotedPhase({
      currentPhase: 1,
      generatorPhase: 1,
      conversationSource: 'lm',
    });
    expect(result).toBe(2);
  });

  it('promotes F1→F2 cuando source=inbound y Generator dice 1', () => {
    const result = computeAutoPromotedPhase({
      currentPhase: 1,
      generatorPhase: 1,
      conversationSource: 'inbound',
    });
    expect(result).toBe(2);
  });

  it('respeta Generator si decide phase ≥ 2 (no overrides)', () => {
    const result = computeAutoPromotedPhase({
      currentPhase: 1,
      generatorPhase: 3,
      conversationSource: 'bienvenida',
    });
    expect(result).toBe(3);
  });

  it('no promueve si source=manual (no clasificada para auto-phase)', () => {
    const result = computeAutoPromotedPhase({
      currentPhase: 1,
      generatorPhase: 1,
      conversationSource: 'manual',
    });
    expect(result).toBe(1);
  });

  it('no promueve si conversationSource es null (inbound puro)', () => {
    const result = computeAutoPromotedPhase({
      currentPhase: 1,
      generatorPhase: 1,
      conversationSource: null,
    });
    expect(result).toBe(1);
  });

  it('no promueve si conversationSource es undefined', () => {
    const result = computeAutoPromotedPhase({
      currentPhase: 1,
      generatorPhase: 1,
      conversationSource: undefined,
    });
    expect(result).toBe(1);
  });

  it('no promueve si phase actual ya es 2+', () => {
    const result = computeAutoPromotedPhase({
      currentPhase: 2,
      generatorPhase: 1,
      conversationSource: 'bienvenida',
    });
    // Si phase actual es 2 y generator dice 1 (regresión), respetamos Generator.
    // Solo auto-promote si phase actual es exactamente 1.
    expect(result).toBe(1);
  });

  it('respeta Generator avance natural F3, F4, F5 desde F1 source clasificado', () => {
    for (const target of [3, 4, 5, 6, 7]) {
      const result = computeAutoPromotedPhase({
        currentPhase: 1,
        generatorPhase: target,
        conversationSource: 'bienvenida',
      });
      expect(result).toBe(target);
    }
  });

  it('AUTO_PROMOTE_SOURCES contiene exactamente bienvenida, lm, inbound', () => {
    expect(AUTO_PROMOTE_SOURCES.has('bienvenida')).toBe(true);
    expect(AUTO_PROMOTE_SOURCES.has('lm')).toBe(true);
    expect(AUTO_PROMOTE_SOURCES.has('inbound')).toBe(true);
    expect(AUTO_PROMOTE_SOURCES.has('manual')).toBe(false);
    expect(AUTO_PROMOTE_SOURCES.size).toBe(3);
  });
});
