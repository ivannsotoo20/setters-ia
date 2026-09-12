import { describe, it, expect } from 'vitest';
import {
  describeConversationOrigin,
  matchesOriginFilter,
  originKeyOf,
  parseOriginFilterValue,
} from '../../lib/conversation-origin';

/**
 * Tania (2026-09-12): "Inbound debe ser solo cuando es la persona la que me
 * escribe directamente abriendo conversación. Se está contabilizando como
 * inbound desde bienvenidas a respuestas a palabras clave".
 */
describe('originKeyOf', () => {
  it('escribió ella primero → inbound, diga lo que diga la etiqueta', () => {
    expect(originKeyOf({ conversation_source: 'inbound', direction: 'inbound' })).toBe('inbound');
    expect(originKeyOf({ conversation_source: null, direction: 'inbound' })).toBe('inbound');
    expect(originKeyOf({ conversation_source: 'bienvenida', direction: 'inbound' })).toBe('inbound');
  });

  it('la automatización contestó a una palabra clave → keyword, no inbound', () => {
    expect(originKeyOf({ conversation_source: 'inbound', direction: 'outbound' })).toBe('keyword');
    expect(originKeyOf({ conversation_source: 'inbound', direction: null })).toBe('keyword');
  });

  it('bienvenida, lead magnet y manual', () => {
    expect(originKeyOf({ conversation_source: 'bienvenida', direction: 'outbound' })).toBe('welcome');
    expect(originKeyOf({ conversation_source: 'lm', direction: 'outbound' })).toBe('lead_magnet');
    expect(originKeyOf({ conversation_source: 'manual', direction: 'outbound' })).toBe('manual');
    expect(originKeyOf({ conversation_source: null, direction: 'outbound' })).toBe('unknown');
  });

  it('describeConversationOrigin etiqueta en español', () => {
    expect(describeConversationOrigin({ conversation_source: 'inbound', direction: 'outbound' }).label).toBe(
      'Palabra clave',
    );
    expect(describeConversationOrigin({ conversation_source: null, direction: 'inbound' }).label).toContain(
      'Inbound',
    );
  });
});

describe('matchesOriginFilter', () => {
  const keyword = { conversation_source: 'inbound', direction: 'outbound' };
  const realInbound = { conversation_source: 'inbound', direction: 'inbound' };
  const welcome = { conversation_source: 'bienvenida', direction: 'outbound' };

  it('el filtro "inbound" solo deja pasar a quien escribió primero', () => {
    expect(matchesOriginFilter(realInbound, ['inbound'])).toBe(true);
    expect(matchesOriginFilter(keyword, ['inbound'])).toBe(false);
    expect(matchesOriginFilter(welcome, ['inbound'])).toBe(false);
  });

  it('acepta los valores crudos antiguos por compatibilidad de enlaces guardados', () => {
    expect(parseOriginFilterValue('bienvenida')).toBe('welcome');
    expect(parseOriginFilterValue('lm')).toBe('lead_magnet');
    expect(matchesOriginFilter(welcome, ['bienvenida'])).toBe(true);
    expect(matchesOriginFilter(keyword, ['bienvenida'])).toBe(false);
  });

  it('sin filtro, o con valores desconocidos, todo pasa', () => {
    expect(matchesOriginFilter(keyword, [])).toBe(true);
    expect(matchesOriginFilter(keyword, ['lo-que-sea'])).toBe(true);
  });
});
