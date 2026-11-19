import { describe, expect, it } from 'vitest';
import {
  decideLanguageTurn,
  defaultUnsupportedText,
  hasSentUnsupportedNotice,
  outputInDisallowedLanguage,
  parseLanguagePolicy,
  resolveSpokenLeadLanguage,
  unsupportedLanguageParts,
} from '../src/lib/lead-language.js';

// 2026-11-19 — Tania: "únicamente en español, portugués, inglés y francés… Si
// alguien escribe en otro idioma, que indique los idiomas disponibles y pregunte
// si puede continuar en alguno de ellos". Ver lib/lead-language.ts.

const TANIA = { languages: { allowed: ['es', 'pt', 'en', 'fr'] } };
const ITALIANO =
  'Ciao soffro di mal di schiena/ anca da un po di anni! Lo scorso Dicembre però ho scoperto di avere un ernia l4';

describe('parseLanguagePolicy', () => {
  it('sin la clave no hay política (nada cambia para el resto de tenants)', () => {
    expect(parseLanguagePolicy(null)).toBeNull();
    expect(parseLanguagePolicy({})).toBeNull();
    expect(parseLanguagePolicy({ languages: { allowed: [] } })).toBeNull();
    expect(parseLanguagePolicy({ languages: { allowed: ['xx'] } })).toBeNull();
  });

  it('con idiomas y sin texto, el texto por defecto nombra los idiomas', () => {
    const p = parseLanguagePolicy(TANIA)!;
    expect([...p.allowed]).toEqual(['es', 'pt', 'en', 'fr']);
    expect(p.unsupportedText).toBe(
      'Perdona, por aquí solo puedo atenderte en castellano, portugués, inglés o francés. Podemos seguir en alguno de ellos?',
    );
  });

  it('el texto de la entrenadora manda y cada párrafo es una burbuja', () => {
    const p = parseLanguagePolicy({
      languages: { allowed: ['ES', 'pt'], unsupported_text: 'Primera burbuja\n\nSegunda burbuja' },
    })!;
    expect(p.allowed.has('es')).toBe(true);
    expect(unsupportedLanguageParts(p)).toEqual(['Primera burbuja', 'Segunda burbuja']);
  });

  it('defaultUnsupportedText con un solo idioma', () => {
    expect(defaultUnsupportedText(['es'])).toContain('solo puedo atenderte en castellano.');
  });
});

describe('decideLanguageTurn', () => {
  const policy = parseLanguagePolicy(TANIA);

  it('italiano sin aviso previo → aviso; con el aviso ya enviado → pausa y aviso a la entrenadora', () => {
    const spoken = resolveSpokenLeadLanguage([], ITALIANO);
    expect(spoken).toBe('it');
    expect(decideLanguageTurn({ policy, spokenLanguage: spoken, history: [] })).toBe('notice');
    const history = [
      { role: 'user', content: ITALIANO },
      { role: 'assistant', content: unsupportedLanguageParts(policy!)[0]! },
    ];
    expect(hasSentUnsupportedNotice(history, policy!)).toBe(true);
    expect(decideLanguageTurn({ policy, spokenLanguage: 'it', history })).toBe('handoff');
  });

  it('si tras el aviso sigue en castellano, conversación normal', () => {
    const history = [
      { role: 'user', content: ITALIANO },
      { role: 'assistant', content: unsupportedLanguageParts(policy!)[0]! },
    ];
    const spoken = resolveSpokenLeadLanguage(history, 'Sí, podemos seguir en español, lo entiendo bastante bien');
    expect(spoken).toBe('es');
    expect(decideLanguageTurn({ policy, spokenLanguage: spoken, history })).toBe('ok');
  });

  it('«Schiena» suelto no dispara nada (ambiguo → castellano)', () => {
    expect(resolveSpokenLeadLanguage([], 'Schiena')).toBe('es');
  });

  it('portugués, inglés y francés pasan', () => {
    for (const lang of ['pt', 'en', 'fr'] as const) {
      expect(decideLanguageTurn({ policy, spokenLanguage: lang, history: [] })).toBe('ok');
    }
  });

  it('sin política, siempre ok', () => {
    expect(decideLanguageTurn({ policy: null, spokenLanguage: 'it', history: [] })).toBe('ok');
  });
});

describe('outputInDisallowedLanguage', () => {
  const policy = parseLanguagePolicy(TANIA);
  it('el turno en italiano de la conv. 13067 no sale', () => {
    expect(
      outputInDisallowedLanguage(
        'Tranquilla, Tania fa le videochiamate anche in italiano, quindi non ti preoccupare per la lingua 😊',
        policy,
      ),
    ).toBe('it');
  });
  it('castellano, ambiguo o sin política pasan', () => {
    expect(outputInDisallowedLanguage('Entiendo, 4 años es ya bastante tiempo arrastrando esto', policy)).toBeNull();
    expect(outputInDisallowedLanguage('Genial! 😊', policy)).toBeNull();
    expect(outputInDisallowedLanguage('Grazie mille per tutto, ci vediamo', null)).toBeNull();
  });
});
