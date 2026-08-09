import { describe, it, expect } from 'vitest';
import { buildSourceTags, slugifyTag } from '../src/lib/source-tags.js';
import { matchKeyword, classifyByKeywords } from '../src/services/ghl-message-router.js';

// =============================================================================
// slugifyTag — formato acordado con Iván: minúsculas y guiones
// =============================================================================

describe('slugifyTag', () => {
  const cases: Array<[string, string]> = [
    ['Guía Espalda', 'guia-espalda'],
    ['GUÍA ESPALDA 2026', 'guia-espalda-2026'],
    ['clase gratis', 'clase-gratis'],
    ['  espacios  raros  ', 'espacios-raros'],
    ['con.puntos,y;signos!', 'con-puntos-y-signos'],
    ['ñoño', 'nono'],
    ['---guiones---', 'guiones'],
    ['Rutina 5 min/día', 'rutina-5-min-dia'],
  ];

  for (const [input, expected] of cases) {
    it(`"${input}" → "${expected}"`, () => {
      expect(slugifyTag(input)).toBe(expected);
    });
  }

  it('nunca deja mayúsculas, acentos ni espacios', () => {
    const out = slugifyTag('ÁÉÍÓÚ Ñ Ü camión');
    expect(out).toBe(out.toLowerCase());
    expect(out).not.toMatch(/[\s]/);
    expect(out).toMatch(/^[a-z0-9-]*$/);
  });

  it('corta etiquetas kilométricas (GHL no es un cajón de sastre)', () => {
    expect(slugifyTag('palabra '.repeat(30)).length).toBeLessThanOrEqual(40);
  });

  it('un texto sin nada aprovechable devuelve cadena vacía, no un guion suelto', () => {
    expect(slugifyTag('¡¿!?')).toBe('');
    expect(slugifyTag('   ')).toBe('');
  });
});

// =============================================================================
// buildSourceTags
// =============================================================================

describe('buildSourceTags', () => {
  it('inbound por Instagram', () => {
    expect(buildSourceTags({ source: 'inbound', channel: 'instagram_dm' })).toEqual([
      'inbound',
      'instagram',
    ]);
  });

  it('acepta las dos nomenclaturas de canal', () => {
    expect(buildSourceTags({ source: 'inbound', channel: 'instagram' })).toEqual(
      buildSourceTags({ source: 'inbound', channel: 'instagram_dm' }),
    );
  });

  it('lead magnet añade el recurso concreto, no solo la categoría', () => {
    expect(
      buildSourceTags({ source: 'lm', matchedKeyword: 'Guía Espalda', channel: 'instagram_dm' }),
    ).toEqual(['lead-magnet', 'lead-magnet-guia-espalda', 'instagram']);
  });

  it('lead magnet sin keyword se queda en la categoría', () => {
    expect(buildSourceTags({ source: 'lm' })).toEqual(['lead-magnet']);
  });

  it('solo el lead magnet se desglosa: inbound no genera inbound-info', () => {
    const tags = buildSourceTags({ source: 'inbound', matchedKeyword: 'info' });
    expect(tags).toEqual(['inbound']);
  });

  it('bienvenida etiqueta la categoría', () => {
    expect(buildSourceTags({ source: 'bienvenida', channel: 'whatsapp' })).toEqual([
      'bienvenida',
      'whatsapp',
    ]);
  });

  it('manual no etiqueta nada: es intervención humana, no procedencia', () => {
    expect(buildSourceTags({ source: 'manual', channel: 'whatsapp' })).toEqual(['whatsapp']);
  });

  it('sin origen ni canal devuelve vacío (y el caller no llama a GHL)', () => {
    expect(buildSourceTags({ source: null })).toEqual([]);
    expect(buildSourceTags({ source: undefined })).toEqual([]);
    expect(buildSourceTags({ source: 'valor_futuro_desconocido' })).toEqual([]);
  });

  it('todas las etiquetas salen en minúsculas y con guiones', () => {
    const tags = buildSourceTags({
      source: 'lm',
      matchedKeyword: 'CLASE Gratuita de Espalda',
      channel: 'instagram_dm',
    });
    for (const t of tags) {
      expect(t).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it('no repite etiquetas', () => {
    const tags = buildSourceTags({ source: 'lm', matchedKeyword: 'lead magnet' });
    expect(new Set(tags).size).toBe(tags.length);
  });
});

// =============================================================================
// matchKeyword — necesario para saber DE QUÉ recurso vino
// =============================================================================

describe('matchKeyword', () => {
  const KW = [
    { type: 'bienvenida' as const, pattern: 'gracias por escribir' },
    { type: 'lm' as const, pattern: 'Guía Espalda' },
    { type: 'lm' as const, pattern: 'Clase gratis' },
    { type: 'inbound' as const, pattern: 'info' },
  ];

  it('devuelve el patrón concreto que casó, no solo el tipo', () => {
    expect(matchKeyword('Te dejo la Clase gratis por aquí', KW)).toEqual({
      type: 'lm',
      pattern: 'Clase gratis',
    });
  });

  it('distingue entre dos lead magnets distintos', () => {
    expect(matchKeyword('aquí tienes la Guía Espalda', KW)?.pattern).toBe('Guía Espalda');
    expect(matchKeyword('te paso la Clase gratis', KW)?.pattern).toBe('Clase gratis');
  });

  it('respeta la precedencia bienvenida > lm > inbound', () => {
    expect(matchKeyword('gracias por escribir, te paso la Clase gratis', KW)?.type).toBe(
      'bienvenida',
    );
  });

  it('sin match devuelve null', () => {
    expect(matchKeyword('un mensaje cualquiera', KW)).toBeNull();
    expect(matchKeyword('', KW)).toBeNull();
  });

  it('classifyByKeywords sigue devolviendo lo mismo que antes del refactor', () => {
    for (const body of [
      'gracias por escribir',
      'te paso la Clase gratis',
      'quiero info',
      'nada que ver',
      '',
    ]) {
      expect(classifyByKeywords(body, KW)).toBe(matchKeyword(body, KW)?.type ?? null);
    }
  });
});

// =============================================================================
// El encadenado real: keyword del trainer → etiqueta en GHL
// =============================================================================

describe('encadenado keyword → etiqueta', () => {
  it('un lead magnet con tilde acaba en una etiqueta limpia', () => {
    const matched = matchKeyword('aquí tienes la Guía Espalda', [
      { type: 'lm', pattern: 'Guía Espalda' },
    ]);
    const tags = buildSourceTags({
      source: matched?.type,
      matchedKeyword: matched?.pattern,
      channel: 'instagram_dm',
    });
    expect(tags).toEqual(['lead-magnet', 'lead-magnet-guia-espalda', 'instagram']);
  });
});
