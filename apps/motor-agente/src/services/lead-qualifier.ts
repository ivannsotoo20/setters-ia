import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { inferCountryFromPhone, type PhoneCountry } from '../lib/phone-country.js';
import { findWholeWordTerm, normalizeText } from '../lib/text-match.js';
import {
  countryNameEs,
  findCountryNames,
  isoFromCountryName,
  normalizePlace,
  parseZoneAllowlist,
  zoneOfIso,
  type ZoneAllowlist,
  type ZoneTier,
} from '../lib/zone-config.js';

/**
 * Cualificación de leads de formulario ANTES de enviar la bienvenida (2026-08-25).
 *
 * Puerto del workflow n8n "Formulario Tally" de Tania, que se apagó con la
 * migración. Secuencia:
 *
 *   1. REGLA DURA — dolor reciente: si alguna respuesta es literalmente uno de
 *      los valores de rechazo ("Menos de 3 meses") → rechazado sin gastar IA.
 *   2. REGLAS DE PAÍS sobre la RESIDENCIA declarada (el campo cuyo label casa
 *      con `country_label_regex`, nunca el del WhatsApp — ver pickResidenceAnswer).
 *      Dos variantes según el tenant:
 *        a) CON `zone_allowlist` (lista blanca, Tania desde 2026-09-26):
 *           aprueba en seco solo si la residencia ES un país "siempre" Y el
 *           prefijo también es de un país "siempre"; rechaza en seco solo si la
 *           residencia no trae más que países fuera de zona o términos de no
 *           contacto ("Lima, Perú"; no "Barcelona, soy peruana") Y el prefijo
 *           tampoco está en zona. Todo lo demás, a la IA.
 *        b) SIN `zone_allowlist` (lista negra de siempre): Tier A por nombre de
 *           país como palabra completa aprueba; un término de
 *           `country_reject_terms` rechaza. Si el texto trae las dos cosas
 *           ("vivo en Madrid, España, soy colombiana") no decide nadie en seco.
 *   3. TODO LO DEMÁS → evaluador IA con los criterios del entrenador
 *      (config.ai_criteria). Con lista blanca, su aprobado pasa por una RED de
 *      zona que solo puede vetar (applyZoneVeto).
 *
 * Evaluador caído, decisión no reconocida o sin criterios:
 *   - sin lista blanca: FAIL-OPEN como siempre (se aprueba con aviso). El n8n
 *     original moría en silencio y el lead se perdía sin bienvenida ni registro.
 *   - con lista blanca: decide el prefijo. En zona → aprobado con aviso; fuera
 *     o desconocido → rechazado. Con una lista blanca lo que no se sabe no es
 *     zona: el fail-open aprobaba a un +51 en cuanto la IA fallaba.
 *
 * La llamada IA se registra en `llm_calls` con role='qualifier' — va contra la
 * clave Anthropic del tenant y su coste tiene que ser visible.
 *
 * Cada `motivo` dice qué regla decidió: el panel /leads/formularios se lo
 * enseña a la entrenadora tal cual.
 */

export interface LeadQualificationConfig {
  enabled?: boolean;
  /** Respuestas literales que rechazan en seco (p. ej. "Menos de 3 meses"). */
  pain_reject_values?: string[];
  /** Regex (i) sobre el LABEL de la respuesta que contiene el país declarado. */
  country_label_regex?: string;
  /**
   * Países, gentilicios y ciudades inequívocas que la entrenadora NO contacta
   * nunca. Se comparan como palabra completa sobre el país declarado,
   * normalizado (minúsculas, sin acentos). Las ciudades con homónimo en otra
   * zona (Córdoba, Valencia, Mérida, Cuenca, Santa Cruz, La Paz, Cartagena)
   * no van aquí: las resuelve el evaluador IA con el prefijo telefónico.
   */
  country_reject_terms?: string[];
  /**
   * Lista blanca de zona `{ always: [ISO], filtered: [ISO] }` (lib/zone-config.ts).
   * Sin ella el tenant sigue con la lista negra de `country_reject_terms`.
   */
  zone_allowlist?: unknown;
  /** System prompt del evaluador IA. Sin él, el paso 3 no evalúa (ver cabecera). */
  ai_criteria?: string;
}

export interface QualifyInput {
  supabase: SupabaseClient;
  anthropic: Anthropic;
  tenantId: number;
  /** Respuestas del formulario aplanadas: label → valor. */
  answers: Record<string, unknown>;
  /** Teléfono E.164 — el prefijo desambigua país y alimenta las reglas de zona. */
  phone: string;
  /**
   * Label de la respuesta que ES el teléfono, cuando el aplanador lo sabe
   * (flattenTallyPayload). Nunca se usa como residencia.
   */
  phoneLabel?: string | null;
  /**
   * Config ya cargada por el caller (el endpoint la lee para la regla de
   * reenvío). `undefined` = se lee aquí.
   */
  config?: LeadQualificationConfig | null;
}

export interface QualifyResult {
  decision: 'aprobado' | 'rechazado' | 'sin_filtro';
  motivo: string | null;
  /** Quién decidió: reglas deterministas, el evaluador IA, o nadie. */
  evaluadoPor: 'reglas' | 'ia' | 'ninguno';
  /** ISO-2 del país de residencia con el que se decidió, si se llegó a saber. */
  paisIso?: string | null;
}

/**
 * Zona de contacto garantizado de la lista negra (tenants SIN zone_allowlist).
 * Son los mismos países que el Set de nombres que había antes (2026-08-25),
 * ahora por ISO para comparar con findCountryNames por palabra completa.
 */
const TIER_A_ISO = new Set([
  'ES', 'FR', 'IT', 'DE', 'PT', 'GB', 'IE', 'NL', 'BE', 'CH', 'AT', 'SE', 'NO', 'DK',
  'FI', 'PL', 'GR', 'HU', 'CZ', 'RO', 'BG', 'HR', 'SI', 'SK', 'EE', 'LV', 'LT', 'LU',
  'MT', 'CY', 'IS', 'US', 'CA', 'AU', 'NZ',
]);

// Normalización y comparación por palabra completa: compartidas con la política
// de zona del chat (lib/zone-policy.ts) desde 2026-09-12. Viven en lib/text-match.ts.
const norm = normalizeText;
const matchesTerm = findWholeWordTerm;

export async function loadQualificationConfig(
  supabase: SupabaseClient,
  tenantId: number,
): Promise<LeadQualificationConfig | null> {
  const { data } = await supabase
    .from('tenant_configs')
    .select('lead_qualification')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  const cfg = data?.lead_qualification as LeadQualificationConfig | null | undefined;
  return cfg ?? null;
}

export async function qualifyFormLead(input: QualifyInput): Promise<QualifyResult> {
  const config =
    input.config !== undefined
      ? input.config
      : await loadQualificationConfig(input.supabase, input.tenantId);
  if (!config || config.enabled !== true) {
    return { decision: 'sin_filtro', motivo: null, evaluadoPor: 'ninguno' };
  }

  const values = Object.values(input.answers).map((v) => String(v ?? '').trim());

  // 1. Dolor reciente → rechazo determinista.
  const rejectValues = (config.pain_reject_values ?? []).map((v) => v.trim());
  const hit = values.find((v) => rejectValues.includes(v));
  if (hit) {
    return {
      decision: 'rechazado',
      motivo: `Respuesta de rechazo directo: "${hit}" (criterio mínimo no cumplido).`,
      evaluadoPor: 'reglas',
    };
  }

  // 2. País de residencia declarado.
  const zone = parseZoneAllowlist(config);
  const prefix = inferCountryFromPhone(input.phone);
  const rejectTerms = config.country_reject_terms ?? [];
  const residence = pickResidenceAnswer(
    input.answers,
    safeRegex(config.country_label_regex ?? 'vives|pais'),
    input.phoneLabel ?? null,
  );
  if (residence) {
    const byCountry = zone
      ? decideByZone(residence.value, prefix, zone, rejectTerms)
      : decideByBlacklist(residence.value, rejectTerms);
    if (byCountry) return byCountry;
  }

  // 3. Evaluador IA.
  if (!config.ai_criteria || config.ai_criteria.trim().length === 0) {
    return evaluatorUnavailable('Sin criterios IA configurados', zone, prefix);
  }
  const ai = await runAiEvaluator(input, config.ai_criteria);
  if (ai.kind === 'unavailable') return evaluatorUnavailable(ai.reason, zone, prefix);

  const verdict: QualifyResult = {
    decision: ai.decision,
    motivo: ai.razonamiento,
    evaluadoPor: 'ia',
    paisIso: ai.paisIso ?? isoFromCountryName(ai.paisDetectado),
  };
  return zone ? applyZoneVeto(verdict, ai, zone, prefix) : verdict;
}

function safeRegex(pattern: string): RegExp {
  try {
    return new RegExp(pattern, 'i');
  } catch {
    return /vives|pais/i;
  }
}

// ----------------------------------------------------------------------------
// Campo de residencia
// ----------------------------------------------------------------------------

/** Un valor que es un número de teléfono y nada más ("+51 987 654 321"). */
const PHONE_SHAPED = /^\+?[\d\s().-]{6,}$/;
/** Un label que pregunta por el teléfono. Mismo criterio que flattenTallyPayload. */
const PHONE_LABEL = /tel[eé]fono|whatsapp|phone|m[oó]vil|celular/i;

/**
 * La respuesta que contiene la RESIDENCIA declarada.
 *
 * Bug real (2026-09-26): se tomaba la PRIMERA respuesta cuyo label casaba con
 * `country_label_regex` ('vives|pais|país'). En el Tally de Tania el campo del
 * WhatsApp ("…déjame aquí tu número de WhatsApp (incluye prefijo de tu
 * país)…") va ANTES que "¿Donde vives actualmente?", así que el "país" que
 * leían las reglas era el teléfono: de 126 formularios, 0 decididos por país.
 * El abogado de Lima (conv 12145) pasó directo a la IA sin que la regla de
 * país lo viera.
 *
 * Ahora se descartan: el label que el aplanador identificó como teléfono, y
 * cualquier respuesta con forma de teléfono. Entre las que quedan se prefiere
 * una cuyo label no hable de teléfono; si solo queda esa, se usa.
 */
export function pickResidenceAnswer(
  answers: Record<string, unknown>,
  labelRegex: RegExp,
  phoneLabel: string | null,
): { label: string; value: string } | null {
  const candidates: Array<{ label: string; value: string }> = [];
  for (const [label, raw] of Object.entries(answers)) {
    if (!labelRegex.test(label)) continue;
    if (phoneLabel && label.trim() === phoneLabel.trim()) continue;
    const value = String(raw ?? '').trim();
    if (!value || PHONE_SHAPED.test(value)) continue;
    candidates.push({ label, value });
  }
  return candidates.find((c) => !PHONE_LABEL.test(c.label)) ?? candidates[0] ?? null;
}

// ----------------------------------------------------------------------------
// Reglas de país
// ----------------------------------------------------------------------------

function tierOf(iso: string | null | undefined, zone: ZoneAllowlist): ZoneTier | null {
  return iso ? zoneOfIso(iso, zone) : null;
}

function describePrefix(prefix: PhoneCountry | null): string {
  return prefix ? `+${prefix.prefix}, ${prefix.name}` : 'no reconocido';
}

/** "prefijo fuera de zona (+51, Perú)" o, si no se reconoce, que no se reconoce. */
function prefixOutsideZoneText(prefix: PhoneCountry | null): string {
  return prefix
    ? `prefijo fuera de zona (${describePrefix(prefix)})`
    : 'prefijo no reconocido (con lista blanca, lo desconocido no es zona)';
}

function quote(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return `«${t.length > 60 ? `${t.slice(0, 60)}…` : t}»`;
}

/**
 * Reglas deterministas CON lista blanca. Devuelve null cuando no hay certeza:
 * entonces decide la IA (y su aprobado pasa por la red de zona).
 *
 * Doctrina: en el formulario manda la RESIDENCIA, no el origen ni el prefijo.
 * Por eso ninguna regla decide sola con una de las dos señales:
 *   - "Barcelona, soy peruana" lleva un término de no contacto, pero reside en
 *     España → IA, con +34 y también con un +51 (su WhatsApp de origen).
 *   - "Santo Domingo de la Calzada" con +34 es La Rioja → IA.
 *   - "En Canadá" con +502 declara residencia en zona con prefijo fuera → IA
 *     (Iván: se aprueba y en el chat el setter deriva para que Tania confirme).
 */
function decideByZone(
  residence: string,
  prefix: PhoneCountry | null,
  zone: ZoneAllowlist,
  rejectTerms: string[],
): QualifyResult | null {
  const prefixTier = tierOf(prefix?.iso, zone);

  // Aprobación: el texto ES un país "siempre" y el prefijo también. "Sevilla,
  // España" no entra aquí a propósito: el texto libre con ciudad es donde se
  // colaba "Pandi cundinamarca" → Dinamarca, y eso lo resuelve la IA.
  const declaredIso = isoFromCountryName(residence);
  if (declaredIso && zoneOfIso(declaredIso, zone) === 'always' && prefixTier === 'always') {
    return {
      decision: 'aprobado',
      motivo:
        `Regla de zona: residencia declarada en zona de contacto (${countryNameEs(declaredIso)}) ` +
        `y prefijo en zona (${describePrefix(prefix)}).`,
      evaluadoPor: 'reglas',
      paisIso: declaredIso,
    };
  }

  // Rechazo: la residencia apunta fuera, no nombra ningún país en zona, el
  // prefijo no la contradice y el texto no trae nada más que señales de fuera.
  const named = findCountryNames(residence);
  const namedInZone = named.filter((iso) => zoneOfIso(iso, zone) !== 'out');
  if (namedInZone.length > 0) return null;
  if (prefixTier === 'always' || prefixTier === 'filtered') return null;
  const out = residenceOnlyOutSignals(residence, zone, rejectTerms);
  if (!out) return null;

  const cause = out.iso
    ? `nombra un país fuera de zona (${countryNameEs(out.iso)})`
    : `está en la lista de no contacto de la entrenadora ("${out.term}")`;
  return {
    decision: 'rechazado',
    motivo:
      `Regla de zona: la residencia declarada ${quote(residence)} ${cause} ` +
      `y el ${prefixOutsideZoneText(prefix)}.`,
    evaluadoPor: 'reglas',
    paisIso: out.iso ?? prefix?.iso ?? null,
  };
}

/** Separadores de trozos en una residencia: "Lima, Perú", "Lima / Perú", "Lima - Perú". */
const RESIDENCE_SEPARATORS = /[,;/|()]+|\s+-\s+/;
/** Lo que se escribe delante del sitio ("vivo en", "en", "desde"), ya normalizado. */
const RESIDENCE_FILLER =
  /^(?:(?:yo\s+)?(?:vivo|resido|estoy|radico)\s+(?:en|actualmente en)\s+|actualmente\s+(?:en\s+)?|desde\s+|en\s+)/;

/**
 * La residencia SOLO trae señales de fuera de zona: cada trozo es, entero, un país
 * fuera de zona o un término de no contacto ("Lima, Perú", "Bogotá", "vivo en
 * Lima"). Devuelve el primer país y el primer término, o null si algún trozo es
 * otra cosa.
 *
 * Revisión 2026-09-26: la regla rechazaba en seco cualquier texto que NOMBRARA un
 * país o término de fuera. "Barcelona, soy peruana" o "Madrid, soy de Perú" con un
 * +51 salían rechazados sin IA, y es justo el caso D1 de Iván (reside en zona con
 * el WhatsApp de su país de origen: se aprueba y el setter deriva para que Tania
 * lo confirme). Un trozo que no es señal de fuera puede ser la residencia real,
 * así que lo decide la IA; su aprobado sigue pasando por la red de zona. Coste:
 * "Lima Perú" sin coma también va a la IA (unos 0,004 $), y la IA lo rechaza.
 */
function residenceOnlyOutSignals(
  residence: string,
  zone: ZoneAllowlist,
  rejectTerms: string[],
): { iso: string | null; term: string | null } | null {
  const termsByNorm = new Map(rejectTerms.map((t) => [normalizePlace(t), t] as const));
  let iso: string | null = null;
  let term: string | null = null;
  let pieces = 0;
  for (const raw of residence.split(RESIDENCE_SEPARATORS)) {
    const piece = normalizePlace(raw).replace(RESIDENCE_FILLER, '').trim();
    if (!piece) continue;
    pieces += 1;
    const pieceIso = isoFromCountryName(piece);
    if (pieceIso) {
      if (zoneOfIso(pieceIso, zone) !== 'out') return null;
      iso ??= pieceIso;
      continue;
    }
    const hit = termsByNorm.get(piece);
    if (!hit) return null;
    term ??= hit;
  }
  return pieces > 0 ? { iso, term } : null;
}

/**
 * Reglas deterministas SIN lista blanca: las de siempre (Tier A aprueba, un
 * término de no contacto rechaza), con dos bugs fuera:
 *   - El Tier A comparaba por SUBSTRING: "Pandi cundinamarca" aprobaba por
 *     Dinamarca, "Usaquén" por USA, "Cañada de Gómez, Argentina" por Canadá.
 *     Ahora es nombre de país como palabra completa, y TODOS los países que
 *     nombra el texto tienen que ser Tier A.
 *   - Si el texto nombra un país Tier A y trae además un término de no
 *     contacto, no decide ninguna regla: lo resuelve la IA con el prefijo.
 */
function decideByBlacklist(residence: string, rejectTerms: string[]): QualifyResult | null {
  const named = findCountryNames(residence);
  const tierA = named.filter((iso) => TIER_A_ISO.has(iso));
  const term = matchesTerm(norm(residence), rejectTerms);

  if (tierA.length > 0 && term) return null;
  if (named.length > 0 && tierA.length === named.length) {
    return {
      decision: 'aprobado',
      motivo: 'País en zona de contacto garantizado (Europa / USA / Canadá / AU / NZ).',
      evaluadoPor: 'reglas',
      paisIso: tierA[0] ?? null,
    };
  }
  if (term) {
    return {
      decision: 'rechazado',
      motivo: `País de residencia en la lista de no contacto de la entrenadora ("${residence.slice(0, 60)}").`,
      evaluadoPor: 'reglas',
    };
  }
  return null;
}

/**
 * Sin evaluador (caído, respuesta ilegible o sin criterios). Sin lista blanca,
 * fail-open como siempre. Con lista blanca decide el prefijo: el fail-open
 * aprobaba a cualquiera, prefijo de Perú incluido, en cuanto la IA fallaba.
 */
function evaluatorUnavailable(
  reason: string,
  zone: ZoneAllowlist | null,
  prefix: PhoneCountry | null,
): QualifyResult {
  if (!zone) {
    return { decision: 'aprobado', motivo: `${reason} — se aprueba con aviso.`, evaluadoPor: 'ninguno' };
  }
  const tier = tierOf(prefix?.iso, zone);
  if (tier === 'always' || tier === 'filtered') {
    return {
      decision: 'aprobado',
      motivo: `${reason} — se aprueba con aviso: el prefijo está en zona (${describePrefix(prefix)}).`,
      evaluadoPor: 'ninguno',
      paisIso: prefix?.iso ?? null,
    };
  }
  return {
    decision: 'rechazado',
    motivo: `${reason} y ${prefixOutsideZoneText(prefix)}: se rechaza por prudencia.`,
    evaluadoPor: 'reglas',
    paisIso: prefix?.iso ?? null,
  };
}

/**
 * Red posterior a la IA, SOLO VETO: nunca convierte un rechazo en aprobado.
 *
 * Caso real (conv 12145): el evaluador aprobó a un abogado de Lima como "Zona
 * D" de un prompt viejo y el setter lo llevó al enlace. Un prompt se puede
 * desalinear con la lista blanca; esta red no: si la IA aprueba a alguien cuyo
 * país (el que ella misma detectó; si no lo dio, el del prefijo) está fuera de
 * zona, se rechaza.
 *
 * Si la IA da un ISO y un nombre de país que no coinciden y uno de los dos está
 * fuera, gana el veto: la contradicción ya es señal de que algo se leyó mal.
 *
 * Residencia en zona con prefijo fuera (+502 "En Canadá") se respeta: Iván lo
 * aprueba y en el chat el setter deriva para que Tania confirme. El motivo lo
 * deja escrito para que se vea en el panel.
 */
function applyZoneVeto(
  verdict: QualifyResult,
  ai: AiDecision,
  zone: ZoneAllowlist,
  prefix: PhoneCountry | null,
): QualifyResult {
  if (verdict.decision !== 'aprobado') return verdict;

  const fromAi = [ai.paisIso, isoFromCountryName(ai.paisDetectado)].filter(
    (iso): iso is string => Boolean(iso),
  );
  const candidates = fromAi.length > 0 ? fromAi : prefix ? [prefix.iso] : [];

  if (candidates.length === 0) {
    return {
      decision: 'rechazado',
      motivo:
        'La IA aprobó pero no se pudo determinar el país de residencia (ni el evaluador lo ' +
        'identificó ni el prefijo es reconocible); fuera de la lista blanca no se contacta.',
      evaluadoPor: 'reglas',
      paisIso: null,
    };
  }
  const outIso = candidates.find((iso) => zoneOfIso(iso, zone) === 'out');
  if (outIso) {
    return {
      decision: 'rechazado',
      motivo:
        `La IA aprobó pero el país de residencia detectado (${countryNameEs(outIso)}) ` +
        'está fuera de la zona de contacto.',
      evaluadoPor: 'reglas',
      paisIso: outIso,
    };
  }

  const residenceIso = candidates[0]!;
  // Solo se anota un prefijo CONOCIDO y fuera: uno que la tabla de prefijos no
  // reconoce no contradice nada que haya que confirmar.
  const prefixOutsideZone = fromAi.length > 0 && tierOf(prefix?.iso, zone) === 'out';
  return {
    ...verdict,
    paisIso: residenceIso,
    motivo: prefixOutsideZone
      ? `${verdict.motivo ?? 'Aprobado por el evaluador IA.'} [Residencia en zona ` +
        `(${countryNameEs(residenceIso)}) con prefijo fuera de zona (${describePrefix(prefix)}): ` +
        'confirmar la residencia en el chat.]'
      : verdict.motivo,
  };
}

// ----------------------------------------------------------------------------
// Evaluador IA
// ----------------------------------------------------------------------------

const QUALIFIER_MODEL = 'claude-sonnet-5';

/**
 * El orden de las propiedades es el orden en que el modelo las escribe. Hasta
 * 2026-09-26 `decision` iba primero: el modelo se comprometía antes de
 * razonar, y en un caso real (fila 53) razonó "corresponde aprobar" y devolvió
 * "rechazado". Ahora razona, fija el país y decide al final.
 */
const QUALIFIER_TOOL = {
  name: 'qualify_lead',
  description:
    'Devuelve la cualificación del lead según los criterios del sistema. Rellena los campos ' +
    'en orden: primero el razonamiento, luego el país de residencia, y la decisión al final, ' +
    'coherente con el razonamiento.',
  input_schema: {
    type: 'object' as const,
    required: ['razonamiento', 'pais_detectado', 'pais_iso', 'decision'],
    properties: {
      razonamiento: {
        type: 'string',
        description:
          '1-3 frases en español. Si rechaza, el eje decisivo; si aprueba, los tres ejes confirmados.',
        maxLength: 600,
      },
      pais_detectado: {
        type: 'string',
        description:
          'País de RESIDENCIA en español (el país, no la ciudad: "España", "México", "Perú"), o "indeterminado".',
        maxLength: 60,
      },
      pais_iso: {
        type: 'string',
        description: 'Código ISO 3166-1 alpha-2 del país de residencia (ES, MX, PE…), o "XX" si es indeterminado.',
        maxLength: 2,
      },
      categoria_ocupacion: {
        type: 'string',
        enum: ['cualificada', 'basica', 'sin_trabajo', 'ambigua'],
      },
      decision: { type: 'string', enum: ['aprobado', 'rechazado'] },
    },
  },
};

interface AiDecision {
  kind: 'decision';
  decision: 'aprobado' | 'rechazado';
  razonamiento: string | null;
  paisDetectado: string | null;
  /** ISO-2 válido o null ('XX', ausente o ilegible). */
  paisIso: string | null;
}

type AiOutcome = AiDecision | { kind: 'unavailable'; reason: string };

/** Códigos que el modelo escribe por costumbre y no son ISO-2. */
const ISO_ALIASES: Record<string, string> = { UK: 'GB', EL: 'GR' };

function parseIso(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const up = raw.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(up) || up === 'XX') return null;
  return ISO_ALIASES[up] ?? up;
}

async function runAiEvaluator(input: QualifyInput, criteria: string): Promise<AiOutcome> {
  const startedAt = Date.now();
  const lineas = Object.entries(input.answers)
    .map(([label, value]) => `${label}: ${String(value ?? '').slice(0, 500)}`)
    .join('\n');
  const userContent =
    `Teléfono (usa el prefijo para desambiguar país si hace falta): ${input.phone}\n\n` +
    `Respuestas del formulario:\n${lineas}`;

  try {
    const response = await input.anthropic.messages.create({
      model: QUALIFIER_MODEL,
      max_tokens: 1024,
      thinking: { type: 'disabled' },
      system: criteria,
      tools: [QUALIFIER_TOOL],
      tool_choice: { type: 'tool', name: 'qualify_lead' },
      messages: [{ role: 'user', content: userContent }],
    });

    const toolUse = response.content.find((b) => b.type === 'tool_use') as
      | { type: 'tool_use'; input: Record<string, unknown> }
      | undefined;
    const out = toolUse?.input ?? {};
    const decision = out.decision;
    const razonamiento = typeof out.razonamiento === 'string' ? out.razonamiento : null;
    const paisDetectado = typeof out.pais_detectado === 'string' ? out.pais_detectado.trim() : null;
    const paisIso = parseIso(out.pais_iso);

    await logQualifierCall(input, {
      status: 'success',
      latencyMs: Date.now() - startedAt,
      usage: response.usage,
      decision: typeof decision === 'string' ? decision : 'invalid',
      paisDetectado,
      paisIso,
      categoria: typeof out.categoria_ocupacion === 'string' ? out.categoria_ocupacion : null,
    });

    if (decision === 'aprobado' || decision === 'rechazado') {
      return { kind: 'decision', decision, razonamiento, paisDetectado, paisIso };
    }
    return { kind: 'unavailable', reason: 'Evaluador IA devolvió una decisión no reconocida' };
  } catch (err) {
    await logQualifierCall(input, {
      status: 'error',
      latencyMs: Date.now() - startedAt,
      errorMessage: err instanceof Error ? err.message : String(err),
    }).catch(() => undefined);
    return {
      kind: 'unavailable',
      reason: `Evaluador IA no disponible (${err instanceof Error ? err.message.slice(0, 80) : 'error'})`,
    };
  }
}

interface LogParams {
  status: 'success' | 'error';
  latencyMs: number;
  usage?: { input_tokens?: number; output_tokens?: number };
  decision?: string;
  paisDetectado?: string | null;
  paisIso?: string | null;
  categoria?: string | null;
  errorMessage?: string;
}

/**
 * Registro best-effort en llm_calls (role='qualifier'). El coste exacto lo
 * calcula el panel a partir de tokens; aquí basta con dejarlos anotados —
 * esta llamada no usa caché, así que input/output tokens lo cuentan todo.
 * El país detectado se guarda junto a la decisión: sin él no había forma de
 * auditar por qué la IA aprobó a alguien fuera de zona.
 */
async function logQualifierCall(input: QualifyInput, p: LogParams): Promise<void> {
  try {
    await input.supabase.from('llm_calls').insert({
      tenant_id: input.tenantId,
      conversation_id: null,
      provider: 'anthropic',
      model: QUALIFIER_MODEL,
      role: 'qualifier',
      status: p.status,
      tokens_in: p.usage?.input_tokens ?? null,
      tokens_out: p.usage?.output_tokens ?? null,
      // Sonnet 5: $3/M in + $15/M out, sin caché en esta llamada.
      cost:
        p.usage != null
          ? ((p.usage.input_tokens ?? 0) * 3 + (p.usage.output_tokens ?? 0) * 15) / 1_000_000
          : null,
      latency_ms: p.latencyMs,
      error_message: p.errorMessage ?? null,
      request_payload: { kind: 'lead_qualifier' },
      response_payload: p.decision
        ? {
            decision: p.decision,
            pais_detectado: p.paisDetectado ?? null,
            pais_iso: p.paisIso ?? null,
            categoria_ocupacion: p.categoria ?? null,
          }
        : null,
    });
  } catch {
    // El log nunca tumba la cualificación.
  }
}
