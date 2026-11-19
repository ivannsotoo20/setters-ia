import { describe, expect, it } from 'vitest';
import {
  detectLeadLanguage,
  detectSpokenLanguage,
  resolveConversationLanguage,
  resolveSpokenLanguage,
} from '../src/lib/detect-language.js';

// 2026-11-19 — Mensajes reales del tenant 7 en italiano (Tania no atiende en
// italiano) y la garantía de que la detección de los cuatro idiomas no cambia.

const ITALIANO = [
  'Ciao soffro di mal di schiena/ anca da un po di anni! Lo scorso Dicembre però ho scoperto di avere un ernia l4',
  'Per il momento ho fatto una sola seduta dal fisioterapista…però sicuramente dopo i suoi trattamenti voglio in',
  'Le cose più semplici! In primis alzarmi dal letto la mattina senza dolore …e senza sentirmi un rottame 😅',
  "Nell' ultimo anno mi sono molto limitata in tutto,a guudare, a camminare, a piegarmi . Troppo dolore poi per r",
  'Mi dicono non è grave niente di operabile però ho dolori dappertutto dalle gambe alla schiena ho fatto le infi',
  'Questo dolore è iniziato due mesi fa, ma non è la prima volta: mi era già successo l’anno scorso.',
];

const CASTELLANO = [
  'Hola, mi padre tiene dolor en la espalda, se operó de hernia discal a nivel L5- S1 y el dolor persiste. ¿Cómo podrías ayudarlo?',
  'Ha tomado medicamentos y sigue tomando, ha probado fisio, infiltraciones, osteopatía...',
  'Cuando camino y mucho tiempo parado , al sentarme mucho tiempo, doblarme o cargar cosas movimientos de inclinación',
  'Una pregunta cuánto sería el costo',
  'me da miedo que me vuelva el dolor del todo',
  'Tengo una cosa en la lumbar que me come la vida',
];

describe('detectSpokenLanguage', () => {
  it.each(ITALIANO)('italiano: %s', (m) => expect(detectSpokenLanguage(m)).toBe('it'));
  it.each(CASTELLANO)('el castellano nunca sale como italiano ni alemán: %s', (m) =>
    expect(['es', 'ambiguous']).toContain(detectSpokenLanguage(m)),
  );
  it('el castellano claro sale como castellano', () => {
    expect(detectSpokenLanguage(CASTELLANO[0]!)).toBe('es');
    expect(detectSpokenLanguage(CASTELLANO[2]!)).toBe('es');
  });
  it('alemán', () => {
    expect(detectSpokenLanguage('Hallo, ich habe seit drei Jahren Rückenschmerzen und kann nicht gut schlafen')).toBe('de');
  });
  it('portugués, inglés y francés como antes', () => {
    expect(detectSpokenLanguage('Olá, tenho dor nas costas há muitos anos e não consigo dormir')).toBe('pt');
    expect(detectSpokenLanguage('Hi, I have had lower back pain for years and it is getting worse')).toBe('en');
    expect(detectSpokenLanguage("Bonjour, j'ai mal au dos depuis des années et je ne dors pas bien")).toBe('fr');
  });
  it('lo corto sigue siendo ambiguo («Schiena», «Si», «Ok»)', () => {
    for (const m of ['Schiena', 'Si', 'Ok', '👍']) expect(detectSpokenLanguage(m)).toBe('ambiguous');
  });
});

describe('resolveSpokenLanguage', () => {
  it('manda el último mensaje no ambiguo', () => {
    expect(resolveSpokenLanguage([ITALIANO[0]!, 'Si'])).toBe('it');
    expect(resolveSpokenLanguage([ITALIANO[0]!, CASTELLANO[0]!])).toBe('es');
    expect(resolveSpokenLanguage(['Schiena'])).toBe('es');
  });
});

describe('la detección de cuatro idiomas no cambia', () => {
  it('detectLeadLanguage nunca devuelve it/de', () => {
    for (const m of ITALIANO) expect(['es', 'pt', 'en', 'fr', 'ambiguous']).toContain(detectLeadLanguage(m));
    expect(['es', 'pt', 'en', 'fr']).toContain(resolveConversationLanguage(ITALIANO));
  });
});
