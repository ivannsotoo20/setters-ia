/**
 * Idioma en el que escribe la persona (2026-11-04, Tania: "la IA puede continuar
 * la conversación en el idioma en el que me escriba"; hace la videollamada en
 * castellano, portugués, inglés y francés).
 *
 * Heurística determinista, sin modelo: palabras funcionales de cada idioma más
 * los diacríticos que solo usa uno (ã/õ → portugués, ¿/¡/ñ → castellano, œ/è/ê
 * → francés). Vive aquí, junto a `detectAddressing`, porque el motor la usa para
 * la directiva por turno y porque el panel la reutiliza en los seguimientos.
 *
 * Diseño:
 *  - Cada palabra funcional suma 1 punto a su idioma; las que comparten varios
 *    ("de", "que", "no") suman a todos los que las usan, así no deciden nada.
 *  - Los diacríticos exclusivos suman 2: una sola "ã" vale más que tres "de".
 *  - Gana el idioma con más puntos si llega a 2 y saca al menos 1 al segundo;
 *    si no, `ambiguous` ("Si", "Ok", un emoji, un nombre propio).
 *  - En la conversación manda el último mensaje no ambiguo; sin ninguno, castellano.
 *
 * Es una heurística: una lead que mezcla ("hola, I have back pain") sale por el
 * idioma con más señales. Los fixtures están en
 * `packages/shared-validator/test/detect-language.test.ts`.
 */

export type LeadLanguage = 'es' | 'pt' | 'en' | 'fr';
export type LeadLanguageDetection = LeadLanguage | 'ambiguous';

export const LEAD_LANGUAGES: readonly LeadLanguage[] = ['es', 'pt', 'en', 'fr'];

const WORDS: Record<LeadLanguage, readonly string[]> = {
  es: [
    'que', 'de', 'la', 'el', 'en', 'y', 'los', 'las', 'un', 'una', 'por', 'con', 'para', 'no', 'me',
    'mi', 'es', 'pero', 'como', 'tengo', 'hola', 'desde', 'hace', 'años', 'anos', 'dolor', 'espalda',
    'muy', 'ya', 'sí', 'si', 'también', 'cuando', 'porque', 'qué', 'cómo', 'estoy', 'soy', 'gracias',
    'buenas', 'buenos', 'días', 'tarde', 'noche', 'quiero', 'puedo', 'mucho', 'poco', 'ahora', 'todo',
    'bien', 'mal', 'duele', 'vivo', 'escribo', 'cuánto', 'cuanto', 'cuesta', 'precio', 'programa',
    'ayudar', 'ayuda', 'más', 'mas', 'nada', 'algo', 'así', 'eso', 'esto', 'le', 'lo', 'se', 'te',
  ],
  pt: [
    'não', 'nao', 'você', 'voce', 'eu', 'é', 'uma', 'um', 'com', 'para', 'por', 'que', 'de', 'da',
    'do', 'das', 'dos', 'em', 'na', 'no', 'tenho', 'estou', 'obrigado', 'obrigada', 'bom', 'boa',
    'dia', 'tarde', 'noite', 'também', 'tambem', 'muito', 'mas', 'quando', 'porque', 'sim', 'já',
    'ja', 'dor', 'costas', 'coluna', 'anos', 'meses', 'quero', 'posso', 'olá', 'ola', 'desde', 'faz',
    'há', 'minha', 'meu', 'isso', 'esta', 'está', 'ele', 'ela', 'gente', 'agora', 'tudo', 'bem',
    'moro', 'escrevo', 'quanto', 'custa', 'preço', 'preco', 'ajudar', 'ajuda', 'mais', 'nada',
    'algo', 'assim', 'aqui', 'lá', 'hérnia', 'hernia', 'ainda', 'então', 'entao', 'são', 'sou',
    'pela', 'pelo', 'pelas', 'pelos', 'vou', 'pensar', 'resposta', 'fico', 'ficar', 'consigo',
    'sentada', 'sentado', 'manhã', 'manha', 'trabalho', 'muita',
  ],
  en: [
    'the', 'and', 'i', 'you', 'my', 'is', 'it', 'to', 'of', 'in', 'for', 'with', 'have', 'had',
    'has', 'am', 'was', 'not', 'but', 'can', 'do', 'does', 'this', 'that', 'pain', 'back', 'years',
    'months', 'hello', 'hi', 'thanks', 'thank', 'please', 'since', 'very', 'just', 'what', 'how',
    'when', 'because', 'yes', 'would', 'could', 'like', 'want', 'help', 'me', 'so', 'about', 'your',
    'are', 'been', 'from', 'there', 'here', 'now', 'all', 'good', 'bad', 'live', 'writing', 'much',
    'cost', 'price', 'program', 'programme', 'hurts', 'herniated', 'disc', 'lower', 'still', 'also',
    "i'm", "i've", "i'd", "it's", "that's", "don't", "can't", "didn't", "isn't", 'sure', 'morning',
    'mornings', 'work', 'sitting', 'day',
  ],
  fr: [
    'je', 'tu', 'il', 'elle', 'nous', 'vous', 'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de',
    'et', 'est', 'pas', 'ne', 'mais', 'pour', 'avec', 'dans', 'que', 'qui', 'mon', 'ma', 'mes', 'ai',
    'suis', 'bonjour', 'merci', 'salut', 'depuis', 'très', 'tres', 'mal', 'dos', 'ans', 'mois', 'oui',
    'non', 'comment', 'quand', 'parce', 'car', 'aussi', 'veux', 'peux', 'maintenant', 'tout', 'bien',
    'ça', 'ca', 'cette', 'ce', 'sur', 'au', 'aux', 'habite', 'écris', 'ecris', 'combien', 'coûte',
    'coute', 'prix', 'programme', 'aider', 'aide', 'plus', 'rien', 'ici', 'hernie', 'encore', 'où',
    "j'ai", "j'habite", "c'est", "n'ai", "qu'il", "d'où", 'votre', 'vos', 'matin', 'journée',
    'journee', 'assise', 'assis', 'médecin', 'medecin', 'jamais', 'réponse', 'reponse',
  ],
};

/** Letras y signos que solo usa (o usa sobre todo) un idioma. Valen 2 puntos. */
const DIACRITICS: Record<LeadLanguage, RegExp> = {
  es: /[ñ¿¡]/g,
  pt: /[ãõ]/g,
  en: /(?!)/g,
  fr: /[œèêùûîô]/g,
};

const WORD_SETS: Record<LeadLanguage, Set<string>> = {
  es: new Set(WORDS.es),
  pt: new Set(WORDS.pt),
  en: new Set(WORDS.en),
  fr: new Set(WORDS.fr),
};

const MIN_SCORE = 2;
const MIN_MARGIN = 1;

/**
 * Palabras en minúsculas, con el apóstrofo dentro de la palabra ("i'm", "j'ai",
 * "c'est" son señales de un idioma). De una letra solo cuenta la "i" inglesa.
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFC')
    .replace(/’/g, "'")
    .split(/[^\p{L}']+/u)
    .map((w) => w.replace(/^'+|'+$/g, ''))
    .filter((w) => w.length > 1 || w === 'i');
}

/** Puntos por idioma de un texto; expuesto para los tests. */
export function scoreLeadLanguage(text: string): Record<LeadLanguage, number> {
  const score: Record<LeadLanguage, number> = { es: 0, pt: 0, en: 0, fr: 0 };
  const lower = text.toLowerCase().normalize('NFC');
  for (const lang of LEAD_LANGUAGES) {
    const hits = lower.match(DIACRITICS[lang]);
    if (hits) score[lang] += hits.length * 2;
  }
  for (const w of tokenize(text)) {
    for (const lang of LEAD_LANGUAGES) {
      if (WORD_SETS[lang].has(w)) score[lang] += 1;
    }
  }
  return score;
}

/** Idioma de UN mensaje, o `ambiguous` si no hay señal suficiente. */
export function detectLeadLanguage(text: string): LeadLanguageDetection {
  if (typeof text !== 'string' || text.trim().length === 0) return 'ambiguous';
  const score = scoreLeadLanguage(text);
  const ranked = [...LEAD_LANGUAGES].sort((a, b) => score[b] - score[a]);
  const best = ranked[0]!;
  const second = ranked[1]!;
  if (score[best] < MIN_SCORE) return 'ambiguous';
  if (score[best] - score[second] < MIN_MARGIN) return 'ambiguous';
  return best;
}

/**
 * Idioma de la conversación: el del último mensaje de la persona que no sea
 * ambiguo ("Si", "Ok" heredan el anterior). Sin ninguno, castellano.
 */
export function resolveConversationLanguage(leadMessages: ReadonlyArray<string>): LeadLanguage {
  for (let i = leadMessages.length - 1; i >= 0; i--) {
    const detected = detectLeadLanguage(leadMessages[i] ?? '');
    if (detected !== 'ambiguous') return detected;
  }
  return 'es';
}
