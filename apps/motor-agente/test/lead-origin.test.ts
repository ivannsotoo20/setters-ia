import { describe, it, expect } from 'vitest';
import {
  buildLeadOriginDirective,
  combineSystemDirectives,
  extractFormAnswers,
  mapConversationSourceToOrigin,
  renderFormAnswers,
  renderZoneBlock,
  FORM_ANSWERS_MAX_FIELDS,
  FORM_ANSWERS_MAX_VALUE_CHARS,
  type LeadOrigin,
} from '../src/lib/lead-origin.js';

// =============================================================================
// mapConversationSourceToOrigin
//
// 2026-09-12: el origen se deriva de `conversation_source` Y de `direction`.
// En el tenant 7 había 171 conversaciones de Instagram abiertas por la
// automatización (primer mensaje nuestro) con source='inbound' — el tipo de la
// palabra clave —, y la directiva le decía al setter "te escribió ella".
// =============================================================================

describe('mapConversationSourceToOrigin', () => {
  const cases: Array<{
    source: string | null | undefined;
    opts?: { direction?: string | null; hasFormAnswers?: boolean };
    expected: LeadOrigin;
  }> = [
    // bienvenida: formulario solo si tenemos sus respuestas
    { source: 'bienvenida', opts: { hasFormAnswers: true }, expected: 'form' },
    { source: 'bienvenida', opts: { direction: 'outbound' }, expected: 'welcome' },
    { source: 'bienvenida', expected: 'welcome' },
    // lm
    { source: 'lm', expected: 'lead_magnet' },
    // inbound: depende de quién abrió
    { source: 'inbound', opts: { direction: 'inbound' }, expected: 'inbound' },
    { source: 'inbound', opts: { direction: 'outbound' }, expected: 'keyword_outbound' },
    { source: 'inbound', expected: 'inbound' },
    // sin source: si escribió ella, eso sí se declara
    { source: null, opts: { direction: 'inbound' }, expected: 'inbound' },
    { source: null, opts: { direction: 'outbound' }, expected: 'unknown' },
    { source: 'manual', expected: 'unknown' },
    { source: undefined, expected: 'unknown' },
    { source: '', expected: 'unknown' },
    { source: 'source_futuro_no_contemplado', expected: 'unknown' },
  ];

  for (const { source, opts, expected } of cases) {
    it(`source=${JSON.stringify(source)} opts=${JSON.stringify(opts ?? {})} → ${expected}`, () => {
      expect(mapConversationSourceToOrigin(source, opts)).toBe(expected);
    });
  }
});

// =============================================================================
// Origen
// =============================================================================

describe('buildLeadOriginDirective — origen', () => {
  it('sin origen NI canal NI zona no inyecta nada', () => {
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
    const d = (buildLeadOriginDirective({ origin: 'form' }) ?? '').toLowerCase();
    expect(d).not.toContain('facebook');
    expect(d).not.toContain('tally');
  });

  it('welcome dice que abrimos nosotros y que NO hay formulario', () => {
    const d = buildLeadOriginDirective({ origin: 'welcome' }) ?? '';
    expect(d).toContain('NO la abrió ella');
    expect(d).toContain('bienvenida');
    expect(d).toContain('No tenemos respuestas de ningún formulario');
    expect(d).not.toContain('dejó sus datos en un formulario');
  });

  it('keyword_outbound dice que abrió la automatización por una palabra clave', () => {
    const d = buildLeadOriginDirective({ origin: 'keyword_outbound' }) ?? '';
    expect(d).toContain('NO la abrió ella');
    expect(d).toContain('palabra clave');
    expect(d).toContain('El primer mensaje del historial es nuestro');
    expect(d).not.toContain('te escribió ella');
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

  it('los orígenes abiertos por nosotros y el inbound se contradicen entre sí', () => {
    const inbound = buildLeadOriginDirective({ origin: 'inbound' }) ?? '';
    for (const origin of ['form', 'welcome', 'keyword_outbound', 'lead_magnet'] as const) {
      const d = buildLeadOriginDirective({ origin }) ?? '';
      expect(d).toContain('NO la abrió ella');
      expect(d).not.toBe(inbound);
    }
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
// Zona geográfica (2026-09-12)
// =============================================================================

describe('renderZoneBlock / buildLeadOriginDirective — zona', () => {
  const GT = { iso: 'GT', name: 'Guatemala', prefix: '502' };

  it('clear o ausente no declara nada', () => {
    expect(renderZoneBlock(null)).toBeNull();
    expect(renderZoneBlock(undefined)).toBeNull();
    expect(renderZoneBlock({ kind: 'clear' })).toBeNull();
  });

  it('reject_by_prefix: nombra el país al setter, decide por sí solo y prohíbe enlace y propuesta', () => {
    const d = renderZoneBlock({ kind: 'reject_by_prefix', country: GT }) ?? '';
    expect(d).toContain('Guatemala (+502)');
    expect(d).toContain('no cualifica por residencia');
    expect(d).toContain('sin ningún enlace');
    expect(d).toContain('sin propuesta de videollamada');
    expect(d).toContain('coach_qualification_doesnt');
    // La excepción pasa por la entrenadora, nunca por el enlace.
    expect(d).toContain('B_derivacion');
  });

  it('in_zone_by_prefix: cualifica y evita la pregunta de rutina', () => {
    const d = renderZoneBlock({ kind: 'in_zone_by_prefix', country: { iso: 'ES', name: 'España', prefix: '34' } }) ?? '';
    expect(d).toContain('España');
    expect(d).toContain('cualifica');
    expect(d).toContain('No le preguntes el país por rutina');
  });

  it('mention: obliga a confirmar residencia una vez y bloquea propuesta y enlace hasta entonces', () => {
    const d = renderZoneBlock({ kind: 'mention', term: 'colombia', excerpt: 'Colombia' }) ?? '';
    expect(d).toContain('«colombia»');
    expect(d).toContain('Nombrar un país no es residir en él');
    expect(d).toContain('una sola vez');
    expect(d).toContain('ni propuesta de videollamada ni enlace');
  });

  it('la zona sola ya justifica inyectar, y va como sección propia', () => {
    const d = buildLeadOriginDirective({ origin: 'unknown', channel: null, zone: { kind: 'reject_by_prefix', country: GT } }) ?? '';
    expect(d.startsWith('## Zona geográfica')).toBe(true);
  });

  it('con origen + canal + zona salen dos secciones, la de zona la última', () => {
    const d = buildLeadOriginDirective({
      origin: 'form',
      channel: 'whatsapp',
      zone: { kind: 'reject_by_prefix', country: GT },
    }) ?? '';
    const headers = d.split('\n').filter((l) => l.startsWith('## '));
    expect(headers).toHaveLength(2);
    expect(headers[0]).toContain('De dónde viene');
    expect(headers[1]).toContain('Zona geográfica');
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
    expect(out.length).toBeLessThan(FORM_ANSWERS_MAX_VALUE_CHARS + 450);
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
    for (const origin of ['inbound', 'welcome', 'keyword_outbound', 'lead_magnet', 'unknown'] as const) {
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
