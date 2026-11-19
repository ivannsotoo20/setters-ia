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

// -----------------------------------------------------------------------------
// 2026-11-19 — Idiomas que NO atiende la entrenadora (Tania: "no quiero que
// converse en italiano"). La heurística de arriba solo conoce los cuatro idiomas
// en los que Tania hace la videollamada, así que un mensaje en italiano salía
// como castellano, portugués o ambiguo, no disparaba nada y el modelo contestaba
// en italiano (conv. 13067 el 7-nov, 13552, 15166). Esto amplía la detección a
// italiano y alemán SIN cambiar lo de arriba: `detectLeadLanguage` y
// `resolveConversationLanguage` siguen devolviendo exactamente lo mismo.
// -----------------------------------------------------------------------------

export type OtherLanguage = 'it' | 'de';
export type SpokenLanguage = LeadLanguage | OtherLanguage;
export type SpokenLanguageDetection = SpokenLanguage | 'ambiguous';

export const OTHER_LANGUAGES: readonly OtherLanguage[] = ['it', 'de'];
export const SPOKEN_LANGUAGES: readonly SpokenLanguage[] = [...LEAD_LANGUAGES, ...OTHER_LANGUAGES];

/**
 * Palabras funcionales de italiano y alemán. Fuera a propósito las que el
 * castellano usa a diario con otro sentido ("cosa", "come", "ha", "pero",
 * "vivo", "medico") para no restarle puntos a una lead que escribe en castellano.
 */
const OTHER_WORDS: Record<OtherLanguage, readonly string[]> = {
  it: [
    'il', 'gli', 'della', 'dello', 'degli', 'delle', 'che', 'non', 'sono', 'ho', 'hai', 'abbiamo',
    'di', 'da', 'per', 'anche', 'molto', 'molta', 'dolore', 'dolori', 'schiena', 'grazie', 'buongiorno',
    'buonasera', 'ciao', 'salve', 'sei', 'stato', 'stata', 'fatto', 'fare', 'anni', 'mesi', 'quando',
    'perché', 'perche', 'cosa', 'questo', 'questa', 'quello', 'quella', 'sempre', 'ancora', 'ernia',
    'posso', 'vorrei', 'voglio', 'però', 'gamba', 'gambe', 'camminare', 'dormire', 'lavoro', 'mio',
    'mia', 'miei', 'sto', 'sta', 'stai', 'dove', 'abito', 'scrivo', 'quanto', 'costa', 'prezzo',
    'aiutare', 'aiuto', 'più', 'piu', 'niente', 'qualcosa', 'così', 'cosi', 'già', 'gia', 'tutto',
    'tutti', 'bene', 'troppo', 'poi', 'dopo', 'senza', 'ogni', 'giorno', 'notte', 'mattina', 'sera',
    'faccio', 'fa', 'nel', 'nella', 'alla', 'alle', 'sul', 'sulla', 'ci', 'fisioterapista',
    'anca', 'fastidio', 'sì',
  ],
  de: [
    'ich', 'und', 'nicht', 'ist', 'das', 'der', 'die', 'mit', 'mein', 'meine', 'habe', 'hast',
    'rücken', 'rucken', 'schmerzen', 'schmerz', 'danke', 'hallo', 'seit', 'jahren', 'sehr', 'auch',
    'wie', 'was', 'ein', 'eine', 'bin', 'ja', 'nein', 'aber', 'für', 'fur', 'zu', 'von', 'auf',
    'sie', 'wir', 'ihr', 'guten', 'tag', 'morgen', 'bitte', 'kann', 'möchte', 'mochte', 'wo',
    'wohne', 'schreibe', 'kostet', 'preis', 'helfen', 'noch', 'schon', 'immer', 'jetzt', 'gut',
  ],
};

const OTHER_DIACRITICS: Record<OtherLanguage, RegExp> = {
  // ì y ò solo los usa el italiano entre los seis; à/è/ù las comparte con el francés.
  it: /[ìò]/g,
  de: /[äöüß]/g,
};

const OTHER_WORD_SETS: Record<OtherLanguage, Set<string>> = {
  it: new Set(OTHER_WORDS.it),
  de: new Set(OTHER_WORDS.de),
};

/**
 * Palabras con tilde que solo existen en italiano. Valen 3: la tilde de «più» o
 * de «è» suma 2 al francés en `scoreLeadLanguage` (que no se toca), y sin esto
 * una frase italiana corta salía como francés o ambigua.
 */
const ITALIAN_ACCENTED_RE =
  /(?<![\p{L}])(?:più|può|giù|già|così|perché|poiché|benché|affinché|però|è|cioè|città|metà|realtà|attività|difficoltà|età|qualità|novità|lunedì|martedì|mercoledì|giovedì|venerdì)(?![\p{L}])/gu;

/** Puntos por idioma con los seis idiomas; expuesto para los tests. */
export function scoreSpokenLanguage(text: string): Record<SpokenLanguage, number> {
  const base = scoreLeadLanguage(text);
  const score: Record<SpokenLanguage, number> = { ...base, it: 0, de: 0 };
  const lower = text.toLowerCase().normalize('NFC');
  score.it += (lower.match(ITALIAN_ACCENTED_RE) ?? []).length * 3;
  for (const lang of OTHER_LANGUAGES) {
    const hits = lower.match(OTHER_DIACRITICS[lang]);
    if (hits) score[lang] += hits.length * 2;
  }
  for (const w of tokenize(text)) {
    for (const lang of OTHER_LANGUAGES) {
      if (OTHER_WORD_SETS[lang].has(w)) score[lang] += 1;
    }
  }
  return score;
}

/**
 * Idioma de UN mensaje entre los seis, o `ambiguous`. Mismo umbral y margen que
 * `detectLeadLanguage`: con poca señal, ambiguo.
 */
export function detectSpokenLanguage(text: string): SpokenLanguageDetection {
  if (typeof text !== 'string' || text.trim().length === 0) return 'ambiguous';
  const score = scoreSpokenLanguage(text);
  const ranked = [...SPOKEN_LANGUAGES].sort((a, b) => score[b] - score[a]);
  const best = ranked[0]!;
  const second = ranked[1]!;
  if (score[best] < MIN_SCORE) return 'ambiguous';
  if (score[best] - score[second] < MIN_MARGIN) return 'ambiguous';
  return best;
}

/** Como `resolveConversationLanguage`, con los seis idiomas. Sin ninguno claro, castellano. */
export function resolveSpokenLanguage(leadMessages: ReadonlyArray<string>): SpokenLanguage {
  for (let i = leadMessages.length - 1; i >= 0; i--) {
    const detected = detectSpokenLanguage(leadMessages[i] ?? '');
    if (detected !== 'ambiguous') return detected;
  }
  return 'es';
}
