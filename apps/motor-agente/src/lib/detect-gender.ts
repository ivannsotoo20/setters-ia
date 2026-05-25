/**
 * Hito 12.2 Fase B (2026-05-20) — Detección de género a partir del nombre del lead.
 *
 * Usado por el motor en F0 (al crear lead) SOLO si el trainer activó el filtro
 * de público objetivo (`targetClientGender != 'mixed'`). El resultado persiste
 * en `leads.detected_gender` y el composer lo lee para inyectar la directiva
 * de verificación al `coach_v5` / `core_v5_base` cuando hay mismatch.
 *
 * Heurística: diccionario es-ES inline (~250 nombres top por género + ~25
 * marcadamente ambiguos). Matching case-insensitive con accents stripped.
 * Cubre el ~75% de leads hispanos. Si no hay match → 'unknown'.
 *
 * Para 'unknown', el caller puede invocar `detectGender` (async) con cliente
 * Anthropic para usar Haiku como fallback. Coste ~$0.0001/lead, ~500ms.
 *
 * IMPORTANTE: la detección es probabilística. Nombres ambiguos en es-ES
 * (Yael, Trinidad como masculino regional) y nombres anglo neutros (Sam, Alex,
 * Jordan, Pat) devuelven 'ambiguous' — el setter NO debe formular la pregunta
 * de verificación en esos casos (el feature es best effort, sin enforce duro).
 */

import type Anthropic from '@anthropic-ai/sdk';

export type DetectedGender = 'male' | 'female' | 'ambiguous' | 'unknown';
export type GenderSource = 'heuristic' | 'llm';

export interface DetectGenderResult {
  gender: DetectedGender;
  source: GenderSource;
}

const NAMES_MALE = new Set<string>([
  // Top hispano masculinos
  'alejandro', 'daniel', 'david', 'pablo', 'pedro', 'jose', 'juan', 'carlos',
  'manuel', 'antonio', 'francisco', 'javier', 'luis', 'miguel', 'angel',
  'sergio', 'diego', 'mario', 'adrian', 'hugo', 'marcos', 'ivan', 'oscar',
  'jorge', 'eduardo', 'andres', 'cristian', 'raul', 'alberto', 'fernando',
  'rafael', 'roberto', 'ruben', 'ricardo', 'jaime', 'felipe', 'enrique',
  'alfonso', 'hector', 'israel', 'joaquin', 'lorenzo', 'mateo', 'nicolas',
  'salvador', 'tomas', 'vicente', 'victor', 'xavier', 'gabriel', 'gonzalo',
  'guillermo', 'ignacio', 'lucas', 'martin', 'patricio', 'rodrigo', 'santiago',
  'sebastian', 'simon', 'esteban', 'maximiliano', 'benjamin', 'bruno', 'camilo',
  'damian', 'emilio', 'joel', 'julian', 'leonardo', 'mauricio', 'ramon',
  'rodolfo', 'ulises', 'valentino', 'walter', 'yago', 'agustin', 'alvaro',
  'arnau', 'arturo', 'asier', 'bautista', 'beltran', 'cesar', 'cosme',
  'cristobal', 'dario', 'demian', 'edmundo', 'efrain', 'eliseo', 'emiliano',
  'emmanuel', 'eric', 'erik', 'ernesto', 'evaristo', 'ezequiel', 'facundo',
  'federico', 'feliciano', 'fidel', 'florencio', 'gerardo', 'german', 'gustavo',
  'hernan', 'horacio', 'humberto', 'ismael', 'jacobo', 'jeremias', 'jeronimo',
  'jesus', 'jonathan', 'josue', 'jovani', 'leandro', 'leonel', 'leopoldo',
  'lisandro', 'luciano', 'macario', 'marcial', 'mariano', 'marvin', 'matias',
  'maximo', 'maximiano', 'modesto', 'nelson', 'octavio', 'omar', 'orlando',
  'osvaldo', 'pascual', 'paulo', 'porfirio', 'rafael', 'reinaldo', 'rene',
  'rigoberto', 'roman', 'rosendo', 'samuel', 'saul', 'severo', 'sigfrido',
  'teodoro', 'tobias', 'ubaldo', 'uriel', 'valentin', 'venancio', 'wenceslao',
  'wilmer', 'wilson', 'yaiel', 'yamil', 'yoel',
  // Anglo masculinos comunes en hispanohablantes
  'aaron', 'adam', 'adrian', 'alex', 'andrew', 'anthony', 'brandon', 'brian',
  'caleb', 'carlos', 'charles', 'christian', 'christopher', 'connor', 'craig',
  'derek', 'dominic', 'douglas', 'dylan', 'eddie', 'edgar', 'edward', 'ethan',
  'eugene', 'evan', 'fabian', 'frank', 'gary', 'gavin', 'george', 'harold',
  'henry', 'ian', 'isaac', 'jack', 'jacob', 'jaden', 'james', 'jared', 'jason',
  'jeff', 'jeffrey', 'jeremy', 'john', 'johnny', 'jonas', 'joseph', 'josh',
  'joshua', 'justin', 'keith', 'kenneth', 'kevin', 'kyle', 'larry', 'lawrence',
  'logan', 'louis', 'mark', 'marshall', 'matthew', 'michael', 'mike', 'nathan',
  'noah', 'paul', 'peter', 'philip', 'ralph', 'randy', 'raymond', 'rick',
  'rob', 'robert', 'ryan', 'sean', 'scott', 'shawn', 'stanley', 'stephen',
  'steve', 'steven', 'thomas', 'timothy', 'travis', 'troy', 'tyler', 'walter',
  'wayne', 'will', 'william', 'zachary',
]);

const NAMES_FEMALE = new Set<string>([
  // Top hispano femeninos
  'maria', 'carmen', 'ana', 'isabel', 'laura', 'cristina', 'marta', 'lucia',
  'sofia', 'elena', 'patricia', 'sandra', 'andrea', 'paula', 'raquel', 'sara',
  'alba', 'claudia', 'beatriz', 'pilar', 'rocio', 'silvia', 'eva', 'nuria',
  'teresa', 'susana', 'monica', 'yolanda', 'esther', 'mercedes', 'irene',
  'natalia', 'daniela', 'carolina', 'adriana', 'camila', 'valeria', 'valentina',
  'diana', 'ines', 'margarita', 'mariana', 'olga', 'pamela', 'rebeca',
  'salome', 'sonia', 'tatiana', 'veronica', 'vanessa', 'victoria', 'antonia',
  'brenda', 'belen', 'bianca', 'catalina', 'celeste', 'charo', 'dolores',
  'elisa', 'estefania', 'florencia', 'francisca', 'gabriela', 'helena', 'inma',
  'itziar', 'jimena', 'josefa', 'julia', 'karen', 'karla', 'leticia', 'liliana',
  'lina', 'lorena', 'lourdes', 'macarena', 'magdalena', 'manuela', 'marina',
  'marisa', 'marisol', 'maite', 'miriam', 'mireia', 'montse', 'nieves',
  'noelia', 'norma', 'olivia', 'paloma', 'roxana', 'rosa', 'sabrina', 'selena',
  'soledad', 'tamara', 'vera', 'ximena', 'yanina', 'aida', 'aitana', 'alejandra',
  'alicia', 'amanda', 'amparo', 'ana belen', 'angeles', 'angela', 'angelica',
  'angelina', 'aranzazu', 'ariana', 'asuncion', 'aurora', 'azucena', 'barbara',
  'begona', 'berta', 'blanca', 'candela', 'caridad', 'casilda', 'cayetana',
  'cecilia', 'celia', 'chelo', 'clara', 'concepcion', 'concha', 'consuelo',
  'covadonga', 'dafne', 'dalia', 'debora', 'delia', 'denise', 'desire',
  'desiree', 'dora', 'edith', 'elsa', 'elvira', 'emilia', 'emma', 'encarna',
  'encarnacion', 'erika', 'ernestina', 'esmeralda', 'estela', 'estrella',
  'eugenia', 'eulalia', 'fatima', 'felipa', 'fermina', 'fernanda', 'filomena',
  'flor', 'fortuna', 'frida', 'gala', 'gema', 'genoveva', 'gertrudis', 'gloria',
  'gracia', 'graciela', 'griselda', 'guadalupe', 'guiomar', 'haydee', 'hilda',
  'hortensia', 'idoia', 'ileana', 'inmaculada', 'irma', 'isadora', 'isaura',
  'iva', 'ivana', 'jacqueline', 'janet', 'jenifer', 'jennifer', 'jessica',
  'jovita', 'juana', 'judit', 'judith', 'julieta', 'lara', 'leire', 'leonor',
  'lidia', 'lilia', 'lola', 'lorena', 'loreto', 'luana', 'luciana', 'luisa',
  'luna', 'macarena', 'malena', 'malvina', 'marcela', 'marga', 'maria jose',
  'mariela', 'mariluz', 'martina', 'matilda', 'matilde', 'mayte', 'melania',
  'melisa', 'melissa', 'mia', 'micaela', 'milagros', 'minerva', 'mirna',
  'modesta', 'morena', 'nadia', 'nadina', 'nahir', 'naomi', 'nazarena',
  'nelida', 'nerea', 'nilda', 'nina', 'noa', 'noelia', 'nora', 'norma',
  'octavia', 'ofelia', 'oksana', 'oriana', 'paola', 'paquita', 'pastora',
  'paz', 'penelope', 'perla', 'petra', 'piedad', 'pia', 'priscila', 'priscilla',
  'purificacion', 'ramona', 'reina', 'remedios', 'renata', 'ribera', 'rita',
  'romina', 'rosa maria', 'rosalia', 'rosario', 'rosaura', 'rosmery', 'roxana',
  'ruth', 'sabina', 'samara', 'samantha', 'saturnina', 'sayonara', 'sheila',
  'sheyla', 'simona', 'soraya', 'tania', 'tea', 'telma', 'thelma', 'tomasa',
  'trinidad', 'ursula', 'valeria', 'valentina', 'vanessa', 'velia', 'violeta',
  'virginia', 'wendy', 'yaiza', 'yamila', 'yanira', 'yasmin', 'yesenia',
  'yessica', 'yoana', 'yohanna', 'zaira', 'zoe', 'zulema',
  // Anglo femeninos comunes
  'abigail', 'alice', 'alyssa', 'amber', 'amy', 'angelina', 'ashley', 'barbara',
  'betty', 'brittany', 'caitlin', 'carla', 'carolyn', 'catherine', 'cheryl',
  'chloe', 'christine', 'cindy', 'crystal', 'cynthia', 'deborah', 'donna',
  'dorothy', 'elizabeth', 'emily', 'evelyn', 'fiona', 'gloria', 'hannah',
  'heather', 'helen', 'jane', 'janet', 'jean', 'jenna', 'jennifer', 'jessica',
  'joan', 'joyce', 'judy', 'julie', 'karen', 'katherine', 'kathleen', 'kathy',
  'kayla', 'kelly', 'kimberly', 'lauren', 'linda', 'lisa', 'lori', 'madison',
  'margaret', 'marie', 'martha', 'mary', 'megan', 'melissa', 'michelle',
  'nancy', 'natalie', 'nicole', 'olivia', 'pamela', 'patricia', 'rachel',
  'rebecca', 'ruth', 'sara', 'sarah', 'sharon', 'shirley', 'stephanie', 'susan',
  'tammy', 'tina', 'tracy', 'vanessa', 'wendy',
]);

/**
 * Nombres que en castellano son usados frecuentemente para ambos géneros, o
 * nombres anglo neutros (Sam, Alex). En estos casos NO formulamos pregunta de
 * verificación — el riesgo de falso positivo es alto.
 */
const NAMES_AMBIGUOUS = new Set<string>([
  // Hispano que se usan en ambos géneros con frecuencia
  'yael', 'cruz', 'guadalupe', 'loreto', 'trinidad', 'reyes', 'ariel',
  'arien', 'noa', 'aurora', 'consuelo', 'rosario', // últimos: aunque más femeninos,
  // se usan como masculino en algunas regiones
  // Anglo neutros
  'sam', 'alex', 'jordan', 'jordan', 'jamie', 'morgan', 'taylor', 'casey',
  'pat', 'riley', 'robin', 'chris', 'dakota', 'avery', 'cameron', 'devon',
  'drew', 'finley', 'hayden', 'jesse', 'kerry', 'lee', 'lou', 'mel', 'rene',
  'sandy', 'shawn', 'sidney', 'terry', 'tony', 'whitney',
]);

/**
 * Heurística sync pura: matchea contra el diccionario inline. Case-insensitive,
 * acentos stripped. Devuelve 'unknown' si el nombre no aparece en ningún set.
 *
 * Espera el primer nombre (no full name). Si llega "María José Pérez", solo
 * matchea contra "maria" (primer token).
 */
export function detectGenderHeuristic(name: string): DetectGenderResult {
  const trimmed = name.trim();
  if (trimmed.length === 0) return { gender: 'unknown', source: 'heuristic' };

  const firstToken = trimmed.split(/\s+/)[0]?.toLocaleLowerCase('es-ES');
  if (!firstToken || firstToken.length === 0) {
    return { gender: 'unknown', source: 'heuristic' };
  }

  const normalized = stripAccents(firstToken);
  if (NAMES_AMBIGUOUS.has(normalized)) return { gender: 'ambiguous', source: 'heuristic' };
  if (NAMES_MALE.has(normalized)) return { gender: 'male', source: 'heuristic' };
  if (NAMES_FEMALE.has(normalized)) return { gender: 'female', source: 'heuristic' };

  return { gender: 'unknown', source: 'heuristic' };
}

/**
 * Wrapper async — heurística primero, Haiku fallback si 'unknown' Y el caller
 * pasa cliente Anthropic. Si Haiku falla, devuelve el resultado heurístico.
 *
 * No llama Haiku si la heurística ya devolvió male/female/ambiguous — esos
 * casos son fiables.
 */
export async function detectGender(
  name: string,
  anthropic?: Anthropic,
): Promise<DetectGenderResult> {
  const heuristic = detectGenderHeuristic(name);
  if (heuristic.gender !== 'unknown') return heuristic;
  if (!anthropic) return heuristic;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 20,
      messages: [
        {
          role: 'user',
          content: GENDER_LLM_PROMPT.replace('{{NAME}}', name),
        },
      ],
    });
    const block = response.content.find((b) => b.type === 'text');
    if (!block || block.type !== 'text') return heuristic;
    const out = block.text.trim().toLowerCase();
    if (out === 'male' || out === 'female' || out === 'ambiguous') {
      return { gender: out, source: 'llm' };
    }
    return heuristic;
  } catch {
    return heuristic;
  }
}

const GENDER_LLM_PROMPT = `Clasifica el género más probable asociado a este nombre de pila, considerando contexto hispano/latino mayoritariamente.

Responde SOLO con una de estas tres palabras (sin puntuación, sin más texto):
- male (si es claramente masculino: Carlos, Juan, David)
- female (si es claramente femenino: María, Andrea, Laura)
- ambiguous (si es neutro / usado ambos géneros: Sam, Alex, Yael, Cruz)

Nombre: {{NAME}}

Respuesta:`;

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '');
}
