import { describe, it, expect } from 'vitest';
import { buildLeadLanguageDirective, languageNameEs, resolveLeadLanguage } from '../src/lib/lead-language.js';

/**
 * Idioma de la persona → directiva por turno (2026-11-04, Tania).
 */

const a = (content: string) => ({ role: 'assistant' as const, content });
const u = (content: string) => ({ role: 'user' as const, content });

describe('resolveLeadLanguage', () => {
  it('solo mira lo que escribe la persona, nunca lo nuestro', () => {
    const history = [a('Hola, por aquí Tânia 😊 en qué movimientos notas más molestias?'), u('Hi! I have had lower back pain for 2 years')];
    expect(resolveLeadLanguage(history, "I'm in London")).toBe('en');
  });

  it('una respuesta corta hereda el idioma anterior', () => {
    const history = [u('Olá! Tenho uma hérnia de disco há dois anos e queria saber se você pode me ajudar'), a('Olá!')];
    expect(resolveLeadLanguage(history, 'Sim')).toBe('pt');
  });

  it('sin señal, castellano', () => {
    expect(resolveLeadLanguage([], 'Hola')).toBe('es');
    expect(resolveLeadLanguage([], 'Ecuador')).toBe('es');
  });
});

describe('buildLeadLanguageDirective', () => {
  it('en castellano no inyecta nada', () => {
    expect(buildLeadLanguageDirective('es')).toBeNull();
  });

  it('en otro idioma nombra el idioma y manda traducir los literales sin cambiar su sentido', () => {
    const d = buildLeadLanguageDirective('en')!;
    expect(d).toContain('## Idioma de la persona');
    expect(d).toContain('**inglés**');
    expect(d).toContain('literales de tu bloque');
    expect(d).toContain('sin añadir cifras ni motivos');
    expect(buildLeadLanguageDirective('pt')).toContain('**portugués**');
    expect(buildLeadLanguageDirective('fr')).toContain('**francés**');
  });

  it('languageNameEs', () => {
    expect(languageNameEs('es')).toBe('castellano');
    expect(languageNameEs('fr')).toBe('francés');
  });
});
