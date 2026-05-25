/**
 * Hito 12.2 Fase B (2026-05-20) — Detección de nombre humano legible del lead.
 *
 * Inputs típicos del canal (GHL contact, ManyChat subscriber, YCloud profile):
 *   - `username` (handle): a veces aporta nombre real ("AndreaMartinez"),
 *     frecuentemente es garbage ("andrea12345", "user2381", "🔥Andre🔥").
 *   - `firstName` / `lastName` / `fullName`: cuando GHL los tiene, son los
 *     más fiables; pueden venir vacíos en leads ManyChat sin enriquecimiento.
 *
 * Output:
 *   - `name`: el primer nombre normalizado (capitalización) si se detecta uno
 *     humano legible. Null si no.
 *   - `status`: 'usable' (hay nombre humano), 'not_usable' (solo handles), o
 *     'unknown' (sin datos suficientes).
 *   - `source`: 'heuristic' siempre en la función sync. La función async puede
 *     devolver 'llm' si la heurística falló y Haiku resolvió.
 *
 * Coste: heurística pura es <1ms (regex). Llamada Haiku solo si el caller la
 * habilita pasando un cliente Anthropic — ~$0.0001/lead, ~500ms de latencia.
 *
 * Solo se ejecuta una vez por lead (en F0, al crear el lead) y el resultado
 * persiste en `leads.parsed_name` + `leads.parsed_name_status`.
 */

import type Anthropic from '@anthropic-ai/sdk';

export type ParsedNameStatus = 'usable' | 'not_usable' | 'unknown';
export type DetectionSource = 'heuristic' | 'llm';

export interface DetectLeadNameInput {
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
}

export interface DetectLeadNameResult {
  /** Primer nombre normalizado (capitalizado correctamente) si usable; null si no. */
  name: string | null;
  status: ParsedNameStatus;
  source: DetectionSource;
}

/**
 * Heurística pura síncrona. Cubre el ~80% de leads — handles obvios garbage
 * (con números, control chars, sin vocales) → 'not_usable'; nombres con
 * estructura humana clara → 'usable'.
 */
export function detectLeadNameHeuristic(input: DetectLeadNameInput): DetectLeadNameResult {
  const { username, firstName, lastName, fullName } = input;

  // Candidatos ordenados por prioridad: firstName combinado con lastName
  // (si ambos), luego fullName, luego firstName/lastName sueltos, luego username.
  // Combinar first+last antes de fullName porque GHL los tiene más limpios.
  const candidates: string[] = [];
  if (firstName && lastName) candidates.push(`${firstName} ${lastName}`);
  if (firstName) candidates.push(firstName);
  if (lastName) candidates.push(lastName);
  if (fullName) candidates.push(fullName);
  if (username) candidates.push(username);

  let hadAnyInput = false;
  for (const raw of candidates) {
    const cleaned = raw.trim();
    if (cleaned.length === 0) continue;
    hadAnyInput = true;
    if (looksLikeHumanName(cleaned)) {
      const firstToken = extractFirstToken(cleaned);
      if (firstToken) {
        return {
          name: normalizeCapitalization(firstToken),
          status: 'usable',
          source: 'heuristic',
        };
      }
    }
  }

  if (!hadAnyInput) {
    return { name: null, status: 'unknown', source: 'heuristic' };
  }
  return { name: null, status: 'not_usable', source: 'heuristic' };
}

/**
 * Wrapper async — heurística primero, Haiku fallback si la heurística devuelve
 * 'not_usable' Y el username tiene aspecto de "posible nombre con sufijo
 * numérico" (ej "andrea123"). En esos casos Haiku puede recuperar el nombre
 * real ("Andrea") aunque la regex lo descarte.
 *
 * Si `anthropic` es undefined, salta el LLM y devuelve el resultado heurístico.
 */
export async function detectLeadName(
  input: DetectLeadNameInput,
  anthropic?: Anthropic,
): Promise<DetectLeadNameResult> {
  const heuristic = detectLeadNameHeuristic(input);
  if (heuristic.status !== 'not_usable') return heuristic;
  if (!anthropic) return heuristic;

  // Heurística dice not_usable. ¿Hay material aprovechable en username/fullName?
  // Si todos son texto puro corto sin números, no merece la pena llamar Haiku
  // (heurística ya debería haberlo capturado — algo raro hay).
  const text = pickBestLLMCandidate(input);
  if (!text) return heuristic;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 50,
      messages: [
        {
          role: 'user',
          content: NAME_LLM_PROMPT.replace('{{INPUT}}', text),
        },
      ],
    });
    const block = response.content.find((b) => b.type === 'text');
    if (!block || block.type !== 'text') return heuristic;
    const llmOut = block.text.trim();
    // Formato esperado: "NONE" o "<nombre>"
    if (llmOut.toUpperCase().startsWith('NONE')) {
      return { name: null, status: 'not_usable', source: 'llm' };
    }
    const candidate = llmOut.split(/\s+/)[0]?.replace(/[^\p{L}\-']/gu, '');
    if (!candidate || candidate.length < 2 || candidate.length > 30) return heuristic;
    return {
      name: normalizeCapitalization(candidate),
      status: 'usable',
      source: 'llm',
    };
  } catch {
    return heuristic;
  }
}

const NAME_LLM_PROMPT = `Analiza este dato de contacto y dime si contiene un nombre humano legible (de persona real, hispano o anglo).

Regla:
- Si SI hay un nombre humano (aunque venga mezclado con números o suffix tipo "andrea123", "Andrea_Martinez"), responde SOLO con el PRIMER nombre limpio, capitalizado normal (ej "Andrea").
- Si NO hay nombre humano (solo handle/garbage: "user2381", "xxsharkboyxx", "🔥fire🔥"), responde literal: NONE

Dato: "{{INPUT}}"

Respuesta:`;

function pickBestLLMCandidate(input: DetectLeadNameInput): string | null {
  // Prefiere lo que tenga letras + posibles números (los handles con nombre
  // dentro: "andrea12345", "Andrea_M"). Salta strings 100% no-letra.
  const candidates = [input.fullName, input.firstName, input.username].filter(
    (s): s is string => typeof s === 'string' && s.trim().length > 0,
  );
  for (const c of candidates) {
    const trimmed = c.trim();
    if (/\p{L}{3,}/u.test(trimmed)) return trimmed;
  }
  return null;
}

/**
 * Heurística: ¿este string parece un nombre humano legible?
 * Criterios (todos deben cumplirse):
 *   - Longitud 2-80 chars (un nombre + apellido caben).
 *   - Sin dígitos.
 *   - Sin @ ni . (descarta emails, dominios, handles tipo "foo.bar").
 *   - Al menos 1 letra (\p{L} cubre Unicode incl. tildes, ñ).
 *   - Ratio de chars válidos (letras + espacios + apóstrofes + guiones) ≥ 70%.
 *     Esto descarta strings con muchos emojis/símbolos: "🔥Andre🔥", "*ANDREA*".
 *   - Sin secuencias de mismo char 4+ veces ("aaaa", "zzzz"). Los handles
 *     "xxxAndrew" pasarían pero raro en práctica.
 *   - Al menos una vocal — los handles "xkfjghkf" raros sin vocales no son nombres.
 */
function looksLikeHumanName(s: string): boolean {
  if (s.length < 2 || s.length > 80) return false;
  if (/\d/.test(s)) return false;
  if (/[@.]/.test(s)) return false;
  if (!/\p{L}/u.test(s)) return false;
  const validChars = s.match(/[\p{L}\s'\-]/gu)?.length ?? 0;
  if (validChars / s.length < 0.7) return false;
  if (/(.)\1{3,}/i.test(s)) return false;
  if (!/[aeiouáéíóúü]/i.test(s)) return false;
  return true;
}

/** Devuelve el primer token "word" del string limpiado. */
function extractFirstToken(s: string): string | null {
  // Separar por whitespace o guiones bajos.
  const tokens = s
    .split(/[\s_]+/)
    .map((t) => t.replace(/[^\p{L}\-']/gu, ''))
    .filter((t) => t.length >= 2);
  return tokens[0] ?? null;
}

/** "MARTINEZ" → "Martinez", "andrea" → "Andrea", "Mª" → "Mª" (no toca). */
function normalizeCapitalization(s: string): string {
  if (s.length === 0) return s;
  const first = s[0]!.toLocaleUpperCase('es-ES');
  const rest = s.slice(1).toLocaleLowerCase('es-ES');
  return first + rest;
}
