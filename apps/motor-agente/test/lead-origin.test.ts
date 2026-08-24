import { describe, it, expect } from 'vitest';
import {
  buildLeadOriginDirective,
  combineSystemDirectives,
  extractFormAnswers,
  mapConversationSourceToOrigin,
  renderFormAnswers,
  FORM_ANSWERS_MAX_FIELDS,
  FORM_ANSWERS_MAX_VALUE_CHARS,
  type LeadOrigin,
} from '../src/lib/lead-origin.js';

// =============================================================================
// mapConversationSourceToOrigin
// =============================================================================

describe('mapConversationSourceToOrigin', () => {
  const cases: Array<{ source: string | null | undefined; expected: LeadOrigin }> = [
    { source: 'bienvenida', expected: 'form' },
    { source: 'lm', expected: 'lead_magnet' },
    { source: 'inbound', expected: 'inbound' },
    { source: 'manual', expected: 'unknown' },
    { source: null, expected: 'unknown' },
    { source: undefined, expected: 'unknown' },
    { source: '', expected: 'unknown' },
    { source: 'source_futuro_no_contemplado', expected: 'unknown' },
  ];

  for (const { source, expected } of cases) {
    it(`source=${JSON.stringify(source)} → ${expected}`, () => {
      expect(mapConversationSourceToOrigin(source)).toBe(expected);
    });
  }
});

// =============================================================================
// Origen
// =============================================================================

describe('buildLeadOriginDirective — origen', () => {
  it('sin origen NI canal no inyecta nada', () => {
    expect(buildLeadOriginDirective({ origin: 'unknown', channel: null })).toBeNull();
  });

  it('form dice que la conversación NO la abrió ella', () => {
    const d = buildLeadOriginDirective({ origin: 'form' }) ?? '';
    expect(d).toContain('NO la abrió ella');
  });

  it('form prohíbe repreguntar lo ya respondido en el formulario', () => {
    const d = buildLeadOriginDirective({ origin: 'form' }) ?? '';
    expect(d).toContain('NO vuelvas a preguntarle nada que ya haya respondido');
  });

  it('form NO afirma por qué canal concreto dejó los datos', () => {
    // 'bienvenida' lo escriben dos caminos (lead-form y trainer-escribe-primero
    // vía GHL). La directiva solo puede afirmar lo cierto en AMBOS.
    const d = (buildLeadOriginDirective({ origin: 'form' }) ?? '').toLowerCase();
    expect(d).not.toContain('facebook');
    expect(d).not.toContain('tally');
  });

  it('lead_magnet separa interés en el recurso de intención de compra', () => {
    const d = (buildLeadOriginDirective({ origin: 'lead_magnet' }) ?? '').toLowerCase();
    expect(d).toContain('recurso');
    expect(d).toContain('no trates');
  });

  it('inbound dice que escribió ella y prohíbe asumir procedencia', () => {
    const d = buildLeadOriginDirective({ origin: 'inbound' }) ?? '';
    expect(d).toContain('te escribió ella');
    expect(d).toContain('NO des por hecho');
  });

  it('form e inbound se contradicen entre sí (no son intercambiables)', () => {
    const form = buildLeadOriginDirective({ origin: 'form' }) ?? '';
    const inbound = buildLeadOriginDirective({ origin: 'inbound' }) ?? '';
    expect(form).toContain('NO la abrió ella');
    expect(inbound).toContain('te escribió ella');
    expect(form).not.toBe(inbound);
  });
});

// =============================================================================
// Canal — "de Instagram a WhatsApp cambia el inicio" (Iván, 2026-08-06)
// =============================================================================

describe('buildLeadOriginDirective — canal', () => {
  it('WhatsApp declara que ya tienes el teléfono', () => {
    const d = buildLeadOriginDirective({ origin: 'inbound', channel: 'whatsapp' }) ?? '';
    expect(d).toContain('WhatsApp');
    expect(d).toContain('ya tienes su teléfono');
  });

  it('Instagram declara que NO tienes el teléfono', () => {
    const d = buildLeadOriginDirective({ origin: 'inbound', channel: 'instagram_dm' }) ?? '';
    expect(d).toContain('Instagram');
    expect(d).toContain('NO tienes su teléfono');
  });

  it('el canal solo/sin origen conocido ya justifica inyectar', () => {
    const d = buildLeadOriginDirective({ origin: 'unknown', channel: 'instagram_dm' });
    expect(d).toBeTruthy();
    expect(d).toContain('Instagram');
  });

  it('WhatsApp e Instagram producen directivas distintas', () => {
    const wa = buildLeadOriginDirective({ origin: 'form', channel: 'whatsapp' });
    const ig = buildLeadOriginDirective({ origin: 'form', channel: 'instagram_dm' });
    expect(wa).not.toBe(ig);
  });
});

// =============================================================================
// Respuestas del formulario (Tally)
// =============================================================================

describe('renderFormAnswers', () => {
  it('renderiza etiqueta: valor por línea', () => {
    const out = renderFormAnswers({ '¿Cuánto llevas con dolor?': 'Más de 2 años' }) ?? '';
    expect(out).toContain('- ¿Cuánto llevas con dolor?: Más de 2 años');
  });

  it('rotula el bloque como DATOS, no instrucciones (superficie de inyección)', () => {
    const out = renderFormAnswers({ campo: 'valor' }) ?? '';
    expect(out).toContain('NO instrucciones');
  });

  it('aplana arrays y normaliza booleanos', () => {
    const out = renderFormAnswers({ zonas: ['lumbar', 'cervical'], operada: false }) ?? '';
    expect(out).toContain('lumbar, cervical');
    expect(out).toContain('operada: no');
  });

  it('descarta valores vacíos, nulos y objetos anidados', () => {
    const out = renderFormAnswers({
      vacio: '',
      nulo: null,
      anidado: { a: 1 },
      bueno: 'sí',
    }) ?? '';
    expect(out).toContain('bueno: sí');
    expect(out).not.toContain('vacio');
    expect(out).not.toContain('nulo');
    expect(out).not.toContain('anidado');
  });

  it(`corta a ${FORM_ANSWERS_MAX_FIELDS} campos`, () => {
    const many: Record<string, string> = {};
    for (let i = 0; i < 40; i++) many[`campo${i}`] = `valor${i}`;
    const lines = (renderFormAnswers(many) ?? '').split('\n').filter((l) => l.startsWith('- '));
    expect(lines).toHaveLength(FORM_ANSWERS_MAX_FIELDS);
  });

  it('trunca valores largos con elipsis', () => {
    const out = renderFormAnswers({ historia: 'x'.repeat(1000) }) ?? '';
    expect(out).toContain('…');
    // Cota sanitaria: valor truncado + preámbulo fijo (rotulado como datos +
    // regla de saltar preguntas ya respondidas). Si esto crece, es el preámbulo
    // el que ha engordado, no el valor sin truncar.
    expect(out.length).toBeLessThan(FORM_ANSWERS_MAX_VALUE_CHARS + 450);
    // Y la verdadera garantía: el valor en sí quedó truncado.
    const bullet = out.split('\n').find((l) => l.startsWith('- historia:')) ?? '';
    expect(bullet.length).toBeLessThan(FORM_ANSWERS_MAX_VALUE_CHARS + 20);
  });

  it('colapsa saltos de línea (un valor multilínea no rompe el formato)', () => {
    const out = renderFormAnswers({ nota: 'linea1\nlinea2\n\nlinea3' }) ?? '';
    const bullets = out.split('\n').filter((l) => l.startsWith('- '));
    expect(bullets).toHaveLength(1);
    expect(bullets[0]).toContain('linea1 linea2 linea3');
  });

  it('devuelve null si no hay nada renderizable', () => {
    expect(renderFormAnswers(null)).toBeNull();
    expect(renderFormAnswers(undefined)).toBeNull();
    expect(renderFormAnswers({})).toBeNull();
    expect(renderFormAnswers({ a: '', b: null })).toBeNull();
  });
});

describe('buildLeadOriginDirective — respuestas del formulario', () => {
  const answers = { '¿Qué te duele?': 'Lumbar', '¿Desde cuándo?': '3 años' };

  it('las incluye cuando el origen es form', () => {
    const d = buildLeadOriginDirective({ origin: 'form', channel: 'whatsapp', formAnswers: answers }) ?? '';
    expect(d).toContain('Lumbar');
    expect(d).toContain('3 años');
  });

  it('NO las incluye si el origen no es form (no las tenemos: afirmarlas sería falso)', () => {
    for (const origin of ['inbound', 'lead_magnet', 'unknown'] as const) {
      const d = buildLeadOriginDirective({ origin, channel: 'whatsapp', formAnswers: answers }) ?? '';
      expect(d).not.toContain('Lumbar');
    }
  });

  it('form sin respuestas sigue emitiendo la directiva de origen', () => {
    const d = buildLeadOriginDirective({ origin: 'form', formAnswers: null }) ?? '';
    expect(d).toContain('NO la abrió ella');
  });

  it('lleva una sola cabecera aunque combine origen + canal + respuestas', () => {
    const d = buildLeadOriginDirective({ origin: 'form', channel: 'whatsapp', formAnswers: answers }) ?? '';
    const headers = d.split('\n').filter((l) => l.startsWith('## '));
    expect(headers).toHaveLength(1);
  });
});

// =============================================================================
// extractFormAnswers — la columna es jsonb libre, nada garantiza su forma
// =============================================================================

describe('extractFormAnswers', () => {
  it('extrae form_answers de custom_fields', () => {
    expect(extractFormAnswers({ form_answers: { a: '1' } })).toEqual({ a: '1' });
  });

  it('devuelve null ante formas inesperadas en vez de reventar el turno', () => {
    expect(extractFormAnswers(null)).toBeNull();
    expect(extractFormAnswers(undefined)).toBeNull();
    expect(extractFormAnswers({})).toBeNull();
    expect(extractFormAnswers('string')).toBeNull();
    expect(extractFormAnswers([1, 2])).toBeNull();
    expect(extractFormAnswers({ form_answers: null })).toBeNull();
    expect(extractFormAnswers({ form_answers: 'texto' })).toBeNull();
    expect(extractFormAnswers({ form_answers: ['a'] })).toBeNull();
  });

  it('no confunde otras claves de custom_fields con las respuestas', () => {
    expect(extractFormAnswers({ otra_cosa: { a: 1 } })).toBeNull();
  });
});

// =============================================================================
// combineSystemDirectives
//
// Regresión: `extraSystemSuffix` es UN string y ya lo ocupaba mirror_lead
// (Hito 12.1). Asignar la procedencia encima habría borrado el tratamiento.
// =============================================================================

describe('combineSystemDirectives', () => {
  it('conserva AMBAS directivas cuando las dos aplican', () => {
    const origin = buildLeadOriginDirective({ origin: 'form', channel: 'whatsapp' });
    const addressing = '## Tratamiento detectado del lead (Hito 12.1 — mirror_lead)\n\nUSTED.';
    const combined = combineSystemDirectives(origin, addressing) ?? '';
    expect(combined).toContain('NO la abrió ella');
    expect(combined).toContain('mirror_lead');
  });

  it('devuelve la única presente cuando la otra es null', () => {
    const addressing = '## Tratamiento\n\nTÚ.';
    expect(combineSystemDirectives(null, addressing)).toBe(addressing);
    expect(combineSystemDirectives(addressing, null)).toBe(addressing);
  });

  it('devuelve null si no hay ninguna → el builder omite el bloque sintético', () => {
    expect(combineSystemDirectives(null, null)).toBeNull();
    expect(combineSystemDirectives()).toBeNull();
  });

  it('ignora strings vacíos o solo-whitespace', () => {
    expect(combineSystemDirectives('', '   ', '\n')).toBeNull();
    expect(combineSystemDirectives('  ', 'real')).toBe('real');
  });

  it('separa las directivas con línea en blanco (markdown válido)', () => {
    expect(combineSystemDirectives('## A\n\ntexto', '## B\n\ntexto')).toBe(
      '## A\n\ntexto\n\n## B\n\ntexto',
    );
  });
});
