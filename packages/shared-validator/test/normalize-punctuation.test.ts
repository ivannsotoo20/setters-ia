import { describe, it, expect } from 'vitest';
import { collapseRepeatedPunctuation, normalizePartsPunctuation } from '../src/lib/normalize-punctuation.js';
import { canonicalLinkKey, extractUrls, urlsAllowed } from '../src/lib/link-key.js';

/**
 * Un solo signo (2026-11-04, Tania): «??» y «¿» fuera, por debajo del modelo.
 */

describe('collapseRepeatedPunctuation', () => {
  it('colapsa los signos de cierre repetidos a uno', () => {
    expect(collapseRepeatedPunctuation('Vaya, entonces caminar es justo donde más lo notas??')).toBe(
      'Vaya, entonces caminar es justo donde más lo notas?',
    );
    expect(collapseRepeatedPunctuation('Genial!!!')).toBe('Genial!');
    expect(collapseRepeatedPunctuation('en serio?!')).toBe('en serio?');
    expect(collapseRepeatedPunctuation('no me digas!?')).toBe('no me digas?');
  });

  it('quita los signos de apertura por defecto', () => {
    expect(collapseRepeatedPunctuation('¿Cómo te está afectando ahora mismo?')).toBe('Cómo te está afectando ahora mismo?');
    expect(collapseRepeatedPunctuation('¡Perfecto! ¿Y desde cuándo?')).toBe('Perfecto! Y desde cuándo?');
  });

  it('con stripOpeningMarks=false los conserva', () => {
    expect(collapseRepeatedPunctuation('¿Qué tal??', { stripOpeningMarks: false })).toBe('¿Qué tal?');
  });

  it('no toca lo demás: puntos suspensivos, enlaces, emojis, un solo signo', () => {
    const texto = 'Te la comparto: https://www.youtube.com/shorts/gb2Ts6AoLUc … pruébala y me dices 😊 vale?';
    expect(collapseRepeatedPunctuation(texto)).toBe(texto);
    expect(collapseRepeatedPunctuation('')).toBe('');
  });

  it('normaliza todas las burbujas del turno', () => {
    expect(normalizePartsPunctuation(['Hola!!', '¿Y tú??'])).toEqual(['Hola!', 'Y tú?']);
  });
});

describe('canonicalLinkKey', () => {
  it('el mismo vídeo de YouTube en todas sus formas da la misma clave', () => {
    const forms = [
      'https://youtu.be/ORPWNlJQ1WE',
      'https://www.youtube.com/watch?v=ORPWNlJQ1WE',
      'https://www.youtube.com/watch?v=ORPWNlJQ1WE&feature=youtu.be',
      'https://youtube.com/shorts/ORPWNlJQ1WE',
      'https://youtu.be/ORPWNlJQ1WE.',
    ];
    for (const f of forms) expect(canonicalLinkKey(f)).toBe('yt:ORPWNlJQ1WE');
    expect(canonicalLinkKey('https://youtu.be/otroVideo1')).not.toBe('yt:ORPWNlJQ1WE');
  });

  it('otras URLs: minúsculas, sin esquema ni www ni barra final ni signo pegado', () => {
    expect(canonicalLinkKey('https://www.Tania.com/recursos/')).toBe('tania.com/recursos');
    expect(canonicalLinkKey('http://tania.com/recursos,')).toBe('tania.com/recursos');
  });

  it('extractUrls y urlsAllowed', () => {
    const texto = 'Mira esto https://youtu.be/ORPWNlJQ1WE y esto https://www.youtube.com/shorts/gb2Ts6AoLUc.';
    expect(extractUrls(texto)).toHaveLength(2);
    expect(urlsAllowed(texto, ['https://www.youtube.com/watch?v=ORPWNlJQ1WE', 'https://youtube.com/shorts/gb2Ts6AoLUc'])).toBe(true);
    expect(urlsAllowed(texto, ['https://youtu.be/ORPWNlJQ1WE'])).toBe(false);
    expect(urlsAllowed('sin enlaces', [])).toBe(true);
  });
});
