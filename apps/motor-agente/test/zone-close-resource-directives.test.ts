import { describe, expect, it } from 'vitest';
import { renderZoneBlock, zoneCloseLinkRule } from '../src/lib/lead-origin.js';
import { buildPhaseFocusInstruction } from '../src/lib/phase-focus.js';

/**
 * D1 (2026-10-21, Tania) — con cierres de zona con recurso, las directivas dejan
 * que el cierre lleve su vídeo y siguen sin dejar el enlace de agenda. Sin ellos,
 * el texto de siempre: ningún enlace.
 */

const PREFIJO_FUERA = {
  kind: 'reject_by_prefix' as const,
  country: { iso: 'PE', name: 'Perú', prefix: '51' },
};
const DECLARADA = { kind: 'reject_by_declaration' as const, term: 'lima', excerpt: 'vivo en Lima' };

describe('zoneCloseLinkRule', () => {
  it('por defecto, ningún enlace', () => {
    expect(zoneCloseLinkRule({})).toBe('sin propuesta de videollamada y sin ningún enlace');
  });

  it('con recurso, el vídeo que encaja sí y la agenda no', () => {
    const rule = zoneCloseLinkRule({ closeWithResource: true });
    expect(rule).toContain('ni enlace de agenda');
    expect(rule).toContain('con su vídeo');
    expect(rule).not.toContain('sin ningún enlace');
  });
});

describe('directivas de cierre por zona con recurso', () => {
  it('la sección de zona, por prefijo y por residencia declarada', () => {
    for (const zone of [PREFIJO_FUERA, DECLARADA]) {
      const conRecurso = renderZoneBlock(zone as any, { closeWithResource: true })!;
      expect(conRecurso).toContain('ni enlace de agenda');
      expect(conRecurso).not.toContain('sin ningún enlace');
      expect(renderZoneBlock(zone as any, {})!).toContain('sin ningún enlace');
    }
  });

  it('la focal de cierre', () => {
    const conRecurso = buildPhaseFocusInstruction(2, false, { zoneClose: true, zoneCloseWithResource: true });
    expect(conRecurso).toContain('ni enlace de agenda');
    expect(conRecurso).toContain('sin preguntas y sin enlaces');
    expect(buildPhaseFocusInstruction(2, false, { zoneClose: true })).toContain('sin ningún enlace');
  });
});
