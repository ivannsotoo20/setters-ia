import { describe, it, expect } from 'vitest';
import {
  classifyByKeywords,
  classifyInboundOnly,
  inferContentTypeFromUrl,
  matchesAnyKeyword,
  matchesKeywordPattern,
} from '../src/services/ghl-message-router.js';

describe('classifyByKeywords', () => {
  const keywords = [
    { type: 'bienvenida' as const, pattern: 'Hola! 👋' },
    { type: 'bienvenida' as const, pattern: 'Muy buenas señor!' },
    { type: 'lm' as const, pattern: 'aquí tienes el lead magnet' },
    { type: 'inbound' as const, pattern: 'gracias por escribir' },
  ];

  it('matches bienvenida case-insensitive ignoring spaces', () => {
    const result = classifyByKeywords('hola!👋 cómo estás', keywords);
    expect(result).toBe('bienvenida');
  });

  it('matches bienvenida with mixed case + extra spaces', () => {
    const result = classifyByKeywords('  Muy   Buenas   SEÑOR!   te saludo', keywords);
    expect(result).toBe('bienvenida');
  });

  it('matches lm', () => {
    const result = classifyByKeywords('Aquí tienes el lead magnet que pediste', keywords);
    expect(result).toBe('lm');
  });

  it('matches inbound auto-response', () => {
    const result = classifyByKeywords('Gracias por escribir, en breve te contestamos', keywords);
    expect(result).toBe('inbound');
  });

  it('returns null when no pattern matches', () => {
    const result = classifyByKeywords('Mensaje totalmente humano sin keyword', keywords);
    expect(result).toBeNull();
  });

  it('returns null on empty body', () => {
    expect(classifyByKeywords('', keywords)).toBeNull();
  });

  it('returns null when no keywords configured', () => {
    expect(classifyByKeywords('hola', [])).toBeNull();
  });

  it('precedence: bienvenida > lm > inbound when multiple match', () => {
    const overlap = [
      { type: 'inbound' as const, pattern: 'hola' },
      { type: 'bienvenida' as const, pattern: 'hola' },
    ];
    const result = classifyByKeywords('hola amigo', overlap);
    expect(result).toBe('bienvenida');
  });

  it('skips empty patterns safely', () => {
    const withEmpty = [
      { type: 'bienvenida' as const, pattern: '' },
      { type: 'lm' as const, pattern: 'magnet' },
    ];
    const result = classifyByKeywords('aquí va el magnet', withEmpty);
    expect(result).toBe('lm');
  });
});

describe('matchesAnyKeyword (Hito 10 sub-fase 3 — gate WA inbound)', () => {
  const waOpenKeywords = [
    { type: 'wa_open' as const, pattern: 'hola' },
    { type: 'wa_open' as const, pattern: 'INFO' },
    { type: 'wa_open' as const, pattern: 'me interesa' },
  ];

  it('returns true when text contains a keyword (case-insensitive)', () => {
    expect(matchesAnyKeyword('Hola entrenador!', waOpenKeywords)).toBe(true);
    expect(matchesAnyKeyword('quería info por favor', waOpenKeywords)).toBe(true);
    expect(matchesAnyKeyword('me   interesa   mucho', waOpenKeywords)).toBe(true);
  });

  it('returns false when no keyword matches', () => {
    expect(matchesAnyKeyword('saludos buenas noches', waOpenKeywords)).toBe(false);
  });

  it('returns false on empty body or empty keywords list', () => {
    expect(matchesAnyKeyword('', waOpenKeywords)).toBe(false);
    expect(matchesAnyKeyword('hola amigo', [])).toBe(false);
  });

  it('skips empty patterns without crashing', () => {
    const withEmpty = [
      { type: 'wa_open' as const, pattern: '' },
      { type: 'wa_open' as const, pattern: 'masterclass' },
    ];
    expect(matchesAnyKeyword('vengo por la masterclass', withEmpty)).toBe(true);
    expect(matchesAnyKeyword('nada que matchee', withEmpty)).toBe(false);
  });
});

describe('classifyInboundOnly (Iván 2026-05-25 — gate inbound IA por keyword)', () => {
  const mixedKeywords = [
    { type: 'bienvenida' as const, pattern: 'hola gracias' },
    { type: 'lm' as const, pattern: 'CLASE' },
    { type: 'inbound' as const, pattern: 'info' },
    { type: 'inbound' as const, pattern: 'programa' },
    { type: 'inbound' as const, pattern: 'precio' },
  ];

  it('returns "inbound" when body contains an inbound keyword', () => {
    expect(classifyInboundOnly('quiero info', mixedKeywords)).toBe('inbound');
    expect(classifyInboundOnly('cuanto cuesta el programa', mixedKeywords)).toBe('inbound');
    expect(classifyInboundOnly('cual es el precio?', mixedKeywords)).toBe('inbound');
  });

  it('is case-insensitive and ignores spaces', () => {
    expect(classifyInboundOnly('INFO PORFA', mixedKeywords)).toBe('inbound');
    expect(classifyInboundOnly('me  interesa  el   PROGRAMA', mixedKeywords)).toBe('inbound');
  });

  it('ignores keywords of other types (bienvenida, lm) even if pattern matches body', () => {
    // 'hola gracias' es type=bienvenida — NO debe disparar inbound classification
    expect(classifyInboundOnly('hola gracias por escribir', mixedKeywords)).toBeNull();
    // 'CLASE' es type=lm — tampoco
    expect(classifyInboundOnly('quiero la clase gratis', mixedKeywords)).toBeNull();
  });

  it('returns null when body matches nothing', () => {
    expect(classifyInboundOnly('hola que tal', mixedKeywords)).toBeNull();
  });

  it('returns null on empty body or no inbound keywords configured', () => {
    expect(classifyInboundOnly('', mixedKeywords)).toBeNull();
    const onlyBienvenida = [{ type: 'bienvenida' as const, pattern: 'hola' }];
    expect(classifyInboundOnly('hola', onlyBienvenida)).toBeNull();
  });

  it('returns null with empty keywords list', () => {
    expect(classifyInboundOnly('info programa precio', [])).toBeNull();
  });
});

describe('matchesKeywordPattern — bienvenidas guardadas enteras (Tania, 2026-10-07)', () => {
  // Sus tres palabras clave de bienvenida, tal cual están en el panel: la frase
  // entera con su emoji. La #29 estaba activa y sus bienvenidas no se contaban.
  const COMUNIDAD = 'Hola, te doy la bienvenida a esta comunidad 🎉';
  const PERFIL = 'Hola! Te doy la bienvenida a mi perfil 🥰';
  const SEGUIRME = 'Holaaa! Vi que empezaste a seguirme y quería saludarte. Espero que no te moleste 😊';

  it('casa la frase tal cual', () => {
    expect(matchesKeywordPattern(COMUNIDAD, COMUNIDAD)).toBe(true);
  });

  it('casa con el nombre de la persona metido', () => {
    expect(
      matchesKeywordPattern('Hola María José, te doy la bienvenida a esta comunidad 🎉', COMUNIDAD),
    ).toBe(true);
    expect(matchesKeywordPattern('Hola Laura! Te doy la bienvenida a mi perfil 🥰', PERFIL)).toBe(true);
  });

  it('casa con otro emoji, sin emoji, con otros signos o sin acentos', () => {
    expect(matchesKeywordPattern('Hola! Te doy la bienvenida a esta comunidad ✨💛', COMUNIDAD)).toBe(true);
    expect(matchesKeywordPattern('hola te doy la bienvenida a esta comunidad', COMUNIDAD)).toBe(true);
    expect(
      matchesKeywordPattern(
        'Holaa! Vi que empezaste a seguirme y queria saludarte, espero que no te moleste',
        SEGUIRME,
      ),
    ).toBe(true);
  });

  it('casa con texto antes o después de la bienvenida', () => {
    expect(
      matchesKeywordPattern(
        '¡Hola, Ana! Te doy la bienvenida a esta comunidad 🎉 Cuéntame, ¿qué te trajo por aquí?',
        COMUNIDAD,
      ),
    ).toBe(true);
  });

  it('tolera una palabra cambiada en una frase larga', () => {
    expect(matchesKeywordPattern('Hola, te doy la bienvenida a nuestra comunidad 🎉', COMUNIDAD)).toBe(
      true,
    );
  });

  it('no casa con un mensaje distinto que comparte palabras sueltas', () => {
    expect(matchesKeywordPattern('Hola, ¿cómo vas con la espalda esta semana?', COMUNIDAD)).toBe(false);
    expect(matchesKeywordPattern('Bienvenida de nuevo, ¿qué tal la comunidad?', COMUNIDAD)).toBe(false);
    expect(matchesKeywordPattern('Hola, te doy la bienvenida', COMUNIDAD)).toBe(false);
  });

  it('no casa si las palabras van desperdigadas por un mensaje largo', () => {
    expect(
      matchesKeywordPattern(
        'Hola Marta, te escribo porque ayer te doy por hecho que viste la bienvenida que te mandé a ti y a esta gente de la comunidad',
        COMUNIDAD,
      ),
    ).toBe(false);
  });

  it('una palabra clave corta no se queda sin su emoji: «Hola! 👋» no casa con cualquier hola', () => {
    expect(matchesKeywordPattern('Hola Marta, ¿qué tal vas?', 'Hola! 👋')).toBe(false);
    expect(matchesKeywordPattern('hola!👋 cómo estás', 'Hola! 👋')).toBe(true);
  });

  it('las palabras clave cortas ya no dependen de los acentos', () => {
    expect(matchesKeywordPattern('quiero mas informacion', 'Información')).toBe(true);
    expect(matchesKeywordPattern('Quiero más INFORMACIÓN', 'informacion')).toBe(true);
  });

  it('classifyByKeywords devuelve bienvenida para la bienvenida con nombre', () => {
    const tania = [
      { type: 'bienvenida' as const, pattern: SEGUIRME },
      { type: 'bienvenida' as const, pattern: PERFIL },
      { type: 'bienvenida' as const, pattern: COMUNIDAD },
      { type: 'inbound' as const, pattern: 'Espalda' },
      { type: 'inbound' as const, pattern: 'Información' },
    ];
    expect(classifyByKeywords('Hola Lucía, te doy la bienvenida a esta comunidad 🎊', tania)).toBe(
      'bienvenida',
    );
    expect(classifyByKeywords('Hola Lucía, ¿cómo sigue tu espalda?', tania)).toBe('inbound');
    expect(classifyByKeywords('Hola Lucía, ¿te viene bien el jueves?', tania)).toBeNull();
  });
});

describe('inferContentTypeFromUrl', () => {
  it('detects audio extensions', () => {
    for (const ext of ['mp3', 'ogg', 'wav', 'm4a', 'aac', 'opus']) {
      expect(inferContentTypeFromUrl(`https://media.gohighlevel.com/foo.${ext}`)).toBe('audio');
    }
  });

  it('detects image extensions', () => {
    for (const ext of ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif']) {
      expect(inferContentTypeFromUrl(`https://x/y.${ext}`)).toBe('image');
    }
  });

  it('detects video extensions (real video formats only, not mp4)', () => {
    for (const ext of ['mov', 'webm', 'mkv', 'avi']) {
      expect(inferContentTypeFromUrl(`https://x/y.${ext}`)).toBe('video');
    }
  });

  it('treats .mp4 as audio (IG DM voice notes use mp4 container)', () => {
    expect(inferContentTypeFromUrl('https://media/voice.mp4')).toBe('audio');
    expect(inferContentTypeFromUrl(
      'https://static-assets.internal.usercontent.site/conversations-assets/location/X/conversations/Y/abc.mp4',
    )).toBe('audio');
  });

  it('falls back to file for unknown / no extension', () => {
    expect(inferContentTypeFromUrl('https://x/y.pdf')).toBe('file');
    expect(inferContentTypeFromUrl('https://x/y')).toBe('file');
    expect(inferContentTypeFromUrl('')).toBe('file');
  });

  it('strips query string and fragment before checking extension', () => {
    expect(inferContentTypeFromUrl('https://x/y.mp3?token=abc&v=2')).toBe('audio');
    expect(inferContentTypeFromUrl('https://x/y.jpg#fragment')).toBe('image');
  });

  it('is case-insensitive', () => {
    expect(inferContentTypeFromUrl('https://x/Y.MP3')).toBe('audio');
    expect(inferContentTypeFromUrl('https://x/Y.JPG')).toBe('image');
  });
});
