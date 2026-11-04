import { describe, it, expect } from 'vitest';
import {
  detectLeadLanguage,
  resolveConversationLanguage,
  scoreLeadLanguage,
} from '../src/lib/detect-language.js';

/**
 * Idioma de la persona (2026-11-04, Tania): castellano, portugués, inglés o
 * francés según escriba; lo demás, ambiguo (hereda el anterior o castellano).
 */

const ES = [
  'Hola, tengo presión en L5 y L1 y me duele sobre todo al caminar',
  'Ya casi año y medio. Me indicaron cirugía',
  'Sobre todo cuando paso muchas horas sentada en el trabajo',
  'Cuánto cuesta lo tuyo?',
  'Me levanto muy rígida por las mañanas y me cuesta muchísimo arrancar',
  'vivo en Madrid desde hace años',
  'Pues me limita para agacharme y para jugar con mis nietos',
  '¿Y esto tiene cura?',
  'Soy de Cuba',
  'La verdad es que no tengo ganas de nada, me cuesta todo',
];

const PT = [
  'Olá! Tenho uma hérnia de disco há dois anos e queria saber se você pode me ajudar',
  'Moro em Lisboa, a dor nas costas não me deixa trabalhar',
  'Quanto custa o acompanhamento?',
  'Bom dia, estou com muita dor na coluna desde o ano passado',
  'Não consigo ficar sentada muito tempo',
  'Obrigada pela resposta, vou pensar',
  'Eu já fiz fisioterapia mas não melhorou',
  'Sim, é isso mesmo, sobretudo de manhã',
];

const EN = [
  'Hi! I have had lower back pain for 2 years, herniated disc L5-S1. Can you help me?',
  "I'm in London",
  'Mostly after sitting all day at work, and in the mornings',
  'How much does the program cost?',
  'Thanks, I would like to know more about how you work',
  'My doctor recommended surgery but I am not sure',
  'Yes, it hurts when I bend down',
  'I live in Dublin and I write to you from there',
];

const FR = [
  "Bonjour, j'ai mal au dos depuis trois ans, une hernie discale L5-S1",
  "J'habite à Paris, est-ce que vous pouvez m'aider?",
  'Combien ça coûte?',
  'Merci pour votre réponse, je vais réfléchir',
  "Surtout le matin et quand je reste assise toute la journée",
  'Oui, mon médecin me conseille une opération',
  'Je ne sais pas comment commencer',
  "Non, je n'ai jamais fait de kiné",
];

describe('detectLeadLanguage', () => {
  it.each(ES)('castellano: %s', (t) => expect(detectLeadLanguage(t)).toBe('es'));
  it.each(PT)('portugués: %s', (t) => expect(detectLeadLanguage(t)).toBe('pt'));
  it.each(EN)('inglés: %s', (t) => expect(detectLeadLanguage(t)).toBe('en'));
  it.each(FR)('francés: %s', (t) => expect(detectLeadLanguage(t)).toBe('fr'));

  it('sin señal suficiente, ambiguo: respuestas de una palabra, emojis, nombres', () => {
    for (const t of ['Si', 'Ok', 'Ecuador', '👍', 'Lima', '', '   ', 'Shirley', 'L5-S1']) {
      expect(detectLeadLanguage(t)).toBe('ambiguous');
    }
  });

  it('los diacríticos propios pesan más que las palabras compartidas', () => {
    // "de", "para", "que" están en castellano y portugués; la "ã" decide.
    expect(detectLeadLanguage('Não é para tanto')).toBe('pt');
    expect(detectLeadLanguage('¿De qué?')).toBe('es');
  });

  it('expone la puntuación para depurar', () => {
    const s = scoreLeadLanguage('Hola, tengo dolor de espalda');
    expect(s.es).toBeGreaterThan(s.en);
    expect(s.es).toBeGreaterThan(s.pt);
  });
});

describe('resolveConversationLanguage', () => {
  it('manda el último mensaje no ambiguo', () => {
    expect(resolveConversationLanguage([EN[0]!, 'Yes', 'Ok'])).toBe('en');
    expect(resolveConversationLanguage([ES[0]!, 'Si'])).toBe('es');
    expect(resolveConversationLanguage([FR[0]!, PT[0]!])).toBe('pt');
  });

  it('sin ningún mensaje claro, castellano', () => {
    expect(resolveConversationLanguage([])).toBe('es');
    expect(resolveConversationLanguage(['Ok', '👍'])).toBe('es');
  });

  it('cambia con la persona: si vuelve al castellano, castellano', () => {
    expect(resolveConversationLanguage([EN[0]!, 'Perdona, mejor te escribo en español, me duele la espalda desde hace años'])).toBe('es');
  });
});
