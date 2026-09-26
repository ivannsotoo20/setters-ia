/**
 * Política de zona geográfica de la entrenadora, evaluada por el MOTOR.
 *
 * QUÉ RESUELVE (2026-09-12, Tania)
 *   El setter seguía llevando a videollamada a personas de países a los que la
 *   entrenadora no lleva (El Salvador, Guatemala, Venezuela, Colombia…). La regla
 *   vivía solo en el bloque del coach como criterio "reactivo": se evaluaba si la
 *   persona soltaba una pista. Dos fugas medidas en producción:
 *     - WhatsApp: el prefijo (+502, +503…) ya decía el país desde el primer
 *       mensaje y nadie lo miraba. Iván: "con el simple hecho de ver el prefijo
 *       ya tiene que ser más que suficiente".
 *     - Instagram: la persona escribió "Colombia" o "aquí en Venezuela" y el
 *       modelo siguió hasta mandar el enlace.
 *
 * QUÉ HACE
 *   Dos señales deterministas, calculadas por turno y declaradas al setter como
 *   HECHOS en la directiva runtime (lead-origin.ts). El cómo cerrar sigue siendo
 *   voz y vive en el bloque del coach:
 *     1. Prefijo telefónico → país. Si está en `no_contact_countries` de la
 *        política del tenant, la persona NO cualifica por residencia. Decide por
 *        sí solo; el validador V20 además impide que salga cualquier enlace.
 *     2. Menciones en el chat: cualquier término de `country_reject_terms`
 *        (países, gentilicios, ciudades inequívocas — la misma lista que usa el
 *        cualificador del formulario) escrito por la persona. Nombrar un país no
 *        es residir en él, así que esto NO cierra: obliga a confirmar residencia
 *        antes de proponer nada.
 *
 * 2026-09-26 — LISTA BLANCA (zone-config.ts)
 *   Con la lista negra, todo prefijo reconocido que no estuviera en
 *   `no_contact_countries` salía "en zona", y el setter leía "a efectos de zona
 *   cualifica". Perú no estaba en la lista y un +51 (conv 12145) llegó al enlace
 *   de agenda. Iván decidió lista blanca: se contacta Europa, EEUU, Canadá,
 *   Australia y Nueva Zelanda siempre, México y Chile con filtro de trabajo, y
 *   nada más. Con `zone_allowlist` configurada, el prefijo se evalúa contra ella:
 *     - país en 'always'   → in_zone_by_prefix (tier 'always').
 *     - país en 'filtered' → in_zone_by_prefix (tier 'filtered'): la directiva le
 *       recuerda al setter la condición de trabajo.
 *     - cualquier otro país → reject_by_prefix, salvo que su formulario declare
 *       residencia en zona → prefix_out_residence_in (ver el tipo).
 *     - número completo con un prefijo que el mapa no conoce → reject_by_prefix
 *       con país 'ZZ'. Con lista blanca, lo desconocido no es zona: un número de
 *       Camerún no puede colarse por no estar en el mapa.
 *   Sin `zone_allowlist`, el prefijo se evalúa exactamente como antes (lista
 *   negra).
 *
 *   Y la residencia DICHA en el chat ("vivo en Managua", "acá en Montevideo",
 *   "te escribo desde Lima") ya no es una mención que obliga a preguntar: es
 *   reject_by_declaration y cierra como el prefijo. Una mención suelta
 *   ("Colombia", "me operaron en Cuba", "soy peruana") sigue siendo pista.
 *
 * DÓNDE VIVE LA CONFIGURACIÓN
 *   `tenant_configs.lead_qualification` (JSONB), las claves `no_contact_countries`
 *   (ISO-2, p. ej. ["VE","CU","DO","CO","BO","EC","GT","SV","AR"]),
 *   `country_reject_terms` (ya existía para el formulario) y, desde 2026-09-26,
 *   `zone_allowlist` ({ always: [ISO], filtered: [ISO] }) y `zone_close_message`
 *   (el literal del cierre, burbuja a burbuja). Un tenant sin ninguna de ellas
 *   no tiene política: `loadZonePolicy` devuelve null y el turno sigue
 *   exactamente igual que antes.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { inferCountryFromPhone, normalizePhoneDigits, type PhoneCountry } from './phone-country.js';
import { escapeRegex, findWholeWordTerm, normalizeText } from './text-match.js';
import {
  countryNameEs,
  findCountryNames,
  parseZoneAllowlist,
  zoneOfIso,
  type ZoneAllowlist,
} from './zone-config.js';

export interface ZonePolicy {
  /** ISO 3166-1 alpha-2 en mayúsculas. Lista negra: solo manda si no hay `allowlist`. */
  noContactCountries: Set<string>;
  /** Términos (país / gentilicio / ciudad) que, escritos por la persona, obligan a confirmar residencia. */
  countryRejectTerms: string[];
  /**
   * Lista blanca de zona (`lead_qualification.zone_allowlist`). Si existe, el
   * prefijo se evalúa contra ella y `noContactCountries` deja de mirarse.
   */
  allowlist?: ZoneAllowlist;
  /**
   * El cierre de residencia fuera de zona, burbuja a burbuja, tal y como lo
   * escribió la entrenadora (`lead_qualification.zone_close_message`). Con él,
   * el motor manda ESE texto cuando cierra por zona en vez de fiarse de que el
   * modelo lo copie: en la batería del 26-09 el cierre a un +57 salió con
   * "Ahora mismo no puedo llevar tu caso directamente…" delante, y el motivo es
   * justo lo que no se dice. Tiene que coincidir con el literal del bloque del
   * coach (para Tania, el literal 8 de coach_qualification_doesnt): el bloque
   * lo sigue necesitando para los cierres que decide el modelo.
   */
  closeParts?: string[];
}

/** Tramo de zona de un prefijo que cualifica. Solo existe con lista blanca. */
export type InZoneTier = 'always' | 'filtered';

export type ZoneVerdict =
  /**
   * El prefijo del teléfono es de un país al que la entrenadora no lleva: no
   * cualifica por residencia. Con lista blanca, `country.iso === 'ZZ'` es un
   * número completo cuyo prefijo no está en el mapa.
   */
  | { kind: 'reject_by_prefix'; country: PhoneCountry }
  /**
   * El prefijo es de fuera, pero su FORMULARIO declara residencia en un país de
   * la zona (+502 con "En Canadá"). Decisión D1 de Iván (2026-09-26): el
   * formulario se aprueba (manda la residencia declarada) y en el chat NO se la
   * cierra: se pasa a la entrenadora (handoff B_derivacion) para que lo
   * confirme. Antes dependía de que el modelo leyera el formulario, y en la
   * batería del 26-09 la cerró con el literal. Solo con lista blanca.
   */
  | {
      kind: 'prefix_out_residence_in';
      country: PhoneCountry;
      declaredIso: string;
      declaredName: string;
    }
  /**
   * El prefijo es de un país al que la entrenadora lleva. `tier` solo viene con
   * lista blanca: 'filtered' es zona con condición de trabajo (México y Chile
   * para Tania). Sin `tier`, es el veredicto de la lista negra de siempre.
   */
  | { kind: 'in_zone_by_prefix'; country: PhoneCountry; tier?: InZoneTier }
  /**
   * Sin teléfono utilizable, y ella ha DICHO que vive en un sitio de la lista de
   * términos ("vivo en Managua", "acá en Montevideo", "te escribo desde Lima").
   * Es residencia declarada, no una pista: cierra igual que el prefijo. En la
   * batería del 26-09 el modelo recibió "vivo en Managua" como mención y siguió
   * con "entonces pasas bastantes horas sentada??".
   */
  | { kind: 'reject_by_declaration'; term: string; excerpt: string }
  /** Sin teléfono utilizable, pero la persona ha nombrado un término de la lista en el chat. */
  | { kind: 'mention'; term: string; excerpt: string }
  /** Nada que declarar. */
  | { kind: 'clear' };

/** El turno tiene que CERRAR por zona (V20 + V21, focal de cierre). */
export function isZoneRejectVerdict(v: ZoneVerdict): boolean {
  return v.kind === 'reject_by_prefix' || v.kind === 'reject_by_declaration';
}

const MAX_EXCERPT_CHARS = 90;

/**
 * Dígitos mínimos (prefijo incluido, tras quitar "+" y "00") para tratar como
 * número completo uno cuyo prefijo no se reconoce. Por debajo es un número
 * truncado o basura, y un dato roto no cierra a nadie: se sigue sin veredicto
 * de prefijo. Los 62 teléfonos con dato en BD (2026-09-26) van en E.164 con "+"
 * y tienen entre 11 y 13 dígitos.
 */
export const UNKNOWN_PREFIX_MIN_DIGITS = 8;

/** Lo que se le enseña al setter cuando el prefijo no está en el mapa. */
export const UNKNOWN_COUNTRY_ISO = 'ZZ';
const UNKNOWN_COUNTRY_NAME = 'un país fuera de su zona de contacto';

const MAX_CLOSE_PARTS = 4;
const MAX_CLOSE_PART_CHARS = 300;

export function parseZonePolicy(raw: unknown): ZonePolicy | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const cfg = raw as Record<string, unknown>;

  const countries = new Set<string>();
  if (Array.isArray(cfg.no_contact_countries)) {
    for (const c of cfg.no_contact_countries) {
      if (typeof c !== 'string') continue;
      const iso = c.trim().toUpperCase();
      if (/^[A-Z]{2}$/.test(iso)) countries.add(iso);
    }
  }

  const terms: string[] = [];
  if (Array.isArray(cfg.country_reject_terms)) {
    for (const t of cfg.country_reject_terms) {
      if (typeof t !== 'string') continue;
      const clean = t.trim();
      if (clean.length > 0 && clean.length <= 60) terms.push(clean);
    }
  }

  // La lista blanca vive en la misma columna; su parser (zone-config.ts)
  // devuelve null si no está o si no trae ningún país en zona.
  const allowlist = parseZoneAllowlist(cfg);

  if (countries.size === 0 && terms.length === 0 && !allowlist) return null;
  const policy: ZonePolicy = { noContactCountries: countries, countryRejectTerms: terms };
  if (allowlist) policy.allowlist = allowlist;
  const closeParts = parseCloseParts(cfg.zone_close_message);
  if (closeParts) policy.closeParts = closeParts;
  return policy;
}

/**
 * `zone_close_message`: array de 1-4 burbujas no vacías (o un string, que es
 * una burbuja). Cualquier otra cosa se ignora y el cierre lo escribe el modelo.
 */
function parseCloseParts(raw: unknown): string[] | null {
  const list = typeof raw === 'string' ? [raw] : Array.isArray(raw) ? raw : null;
  if (!list) return null;
  const parts = list
    .filter((p): p is string => typeof p === 'string')
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && p.length <= MAX_CLOSE_PART_CHARS);
  if (parts.length === 0 || parts.length > MAX_CLOSE_PARTS) return null;
  return parts;
}

/**
 * Lee la política del tenant. Best-effort: cualquier fallo devuelve null y el
 * turno sigue sin señal de zona (mejor un turno sin dato que un turno caído).
 */
export async function loadZonePolicy(
  supabase: SupabaseClient,
  tenantId: number,
): Promise<ZonePolicy | null> {
  try {
    const { data, error } = await supabase
      .from('tenant_configs')
      .select('lead_qualification')
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (error || !data) return null;
    return parseZonePolicy(data.lead_qualification);
  } catch {
    return null;
  }
}

export function evaluateZone(input: {
  phone: string | null | undefined;
  /** Mensajes escritos por la PERSONA (nunca los del setter ni los del sistema). */
  leadMessages: string[];
  policy: ZonePolicy | null;
  /**
   * La residencia que declaró en su formulario (la respuesta a "¿Dónde vives?"),
   * si vino por formulario. Solo se usa con lista blanca y prefijo de fuera,
   * para la excepción D1.
   */
  declaredResidence?: string | null;
}): ZoneVerdict {
  const { phone, leadMessages, policy } = input;
  if (!policy) return { kind: 'clear' };

  if (policy.allowlist) {
    const byPrefix = evaluatePrefixAgainstAllowlist(phone, policy.allowlist);
    if (byPrefix?.kind === 'reject_by_prefix') {
      const declaredIn = declaredResidenceInZone(input.declaredResidence, policy);
      if (declaredIn) {
        return {
          kind: 'prefix_out_residence_in',
          country: byPrefix.country,
          declaredIso: declaredIn,
          declaredName: countryNameEs(declaredIn),
        };
      }
    }
    if (byPrefix) return byPrefix;
  } else {
    // Lista negra (comportamiento previo a 2026-09-26, intacto para los tenants
    // sin `zone_allowlist`).
    const country = inferCountryFromPhone(phone);
    if (country && policy.noContactCountries.size > 0) {
      if (policy.noContactCountries.has(country.iso)) {
        return { kind: 'reject_by_prefix', country };
      }
      return { kind: 'in_zone_by_prefix', country };
    }
  }

  if (policy.countryRejectTerms.length > 0) {
    // 1. La residencia DICHA manda, y manda la más reciente: se recorre del último
    //    mensaje al primero y el primero que declara dónde vive decide. Si declara
    //    un sitio de fuera sin ambigüedad, cierra; si declara otra cosa ("ahora vivo
    //    en Madrid") o es ambiguo, las declaraciones anteriores ya no cuentan.
    for (let i = leadMessages.length - 1; i >= 0; i--) {
      const message = leadMessages[i];
      if (typeof message !== 'string' || message.trim() === '') continue;
      const statement = classifyResidenceStatement(message, policy.countryRejectTerms);
      if (statement?.kind === 'out') {
        return { kind: 'reject_by_declaration', term: statement.term, excerpt: excerptAround(message) };
      }
      if (statement?.kind === 'other') break;
    }
    // 2. Si no, la primera mención suelta obliga a preguntar.
    for (const message of leadMessages) {
      if (typeof message !== 'string' || message.trim() === '') continue;
      const term = findWholeWordTerm(normalizeText(message), policy.countryRejectTerms);
      if (term) return { kind: 'mention', term, excerpt: excerptAround(message) };
    }
  }

  return { kind: 'clear' };
}

/**
 * ISO del país de zona que declara la residencia del formulario, o null. Solo
 * cuenta si el texto nombra un país de la lista blanca (always o filtered) y
 * NINGUNA señal de fuera (país de fuera o término de no contacto): "En Canadá"
 * sí; "Cañada de Gómez, Argentina", "Vivo en Madrid" (Madrid no es un nombre de
 * país) o "Canadá / Guatemala" no, y en esos casos manda el prefijo.
 */
function declaredResidenceInZone(
  residence: string | null | undefined,
  policy: ZonePolicy,
): string | null {
  if (!policy.allowlist || typeof residence !== 'string' || residence.trim() === '') return null;
  const isos = findCountryNames(residence);
  if (isos.length === 0) return null;
  if (isos.some((iso) => zoneOfIso(iso, policy.allowlist!) === 'out')) return null;
  if (findWholeWordTerm(normalizeText(residence), policy.countryRejectTerms)) return null;
  return isos[0]!;
}

/**
 * Frases de residencia en primera persona que atan un lugar a DONDE VIVE, no a
 * de dónde es: "vivo en X", "resido en X", "vivimos aquí en X", "acá en X",
 * "te escribo desde X". Deliberadamente fuera: "soy de X" (origen), "me operaron
 * en X", "estuve en X", "aquí en X" (en España se dice de viaje o de la calle en
 * la que está), y cualquier frase con "no" delante del verbo ("ya no vivo en
 * Lima"). Los verbos van anclados a inicio de palabra: "convivo" y "describo" no
 * son "vivo" ni "escribo".
 */
const RESIDENCE_LEADS = [
  String.raw`(?<![a-z0-9])(?<!(?:^|[^a-z0-9])no\s{1,3})(?:vivo|resido|radico|vivimos|residimos|estoy\s+viviendo)\s+(?:(?:aqui|aca|ahora|actualmente)\s+)?en`,
  String.raw`(?<![a-z0-9])aca\s+en`,
  String.raw`(?<![a-z0-9])(?:te\s+|les\s+|os\s+)?escribo\s+desde`,
];

/**
 * Términos de la lista que existen también en España como pueblo, barrio o
 * calle (El Rosario y Puerto Rico en Canarias, Santo Domingo de la Calzada, el
 * Alto de San Isidro, la plaza del Callao) o que son palabras corrientes
 * ("manta", "la plata"). "Vivo en" + uno de ellos no cierra: se queda en
 * mención y el setter pregunta. Revisión adversarial del 26-09.
 */
const HOMONYMS_IN_ZONE = new Set(
  ['rosario', 'puerto rico', 'santo domingo', 'el alto', 'callao', 'manta', 'la plata'].map((t) =>
    normalizeText(t),
  ),
);

type ResidenceStatement = { kind: 'out'; term: string } | { kind: 'other' };

/**
 * ¿Este mensaje declara dónde vive? `out` si TODAS sus frases de residencia
 * apuntan a un término de fuera inequívoco ("vivo en Lima"); `other` si alguna
 * apunta a otro sitio o a un homónimo ("te escribo desde Colombia pero vivo en
 * Valencia", "vivo en El Rosario, en Tenerife"); null si no declara nada. Lo que
 * va entre ¿…? no cuenta ("¿Vivo en Lima? No, en Madrid"), y "X de …" tampoco
 * ("Santo Domingo de la Calzada").
 */
function classifyResidenceStatement(message: string, terms: string[]): ResidenceStatement | null {
  const text = normalizeText(message).replace(/¿[^?]*\?/g, ' ');
  let leads = 0;
  for (const lead of RESIDENCE_LEADS) leads += (text.match(new RegExp(lead, 'g')) ?? []).length;
  if (leads === 0) return null;

  let outTerm: string | null = null;
  let outCount = 0;
  // Sin repetidos: un término dos veces en la config contaría doble y taparía la
  // otra frase de residencia del mensaje.
  const unique = new Set(terms.map((raw) => normalizeText(raw)));
  for (const t of unique) {
    if (!t || HOMONYMS_IN_ZONE.has(t)) continue;
    for (const lead of RESIDENCE_LEADS) {
      const re = new RegExp(
        `${lead}\\s+(?:el\\s+|la\\s+)?${escapeRegex(t)}(?![a-z0-9])(?!\\s+de\\s)`,
        'g',
      );
      const hits = (text.match(re) ?? []).length;
      if (hits > 0) {
        outCount += hits;
        outTerm ??= t;
      }
    }
  }
  if (outTerm && outCount >= leads) return { kind: 'out', term: outTerm };
  return { kind: 'other' };
}

/**
 * Primer término de la lista que el mensaje declara como lugar de residencia,
 * sin ambigüedad, o null. Ver `classifyResidenceStatement`.
 */
export function findDeclaredResidenceTerm(message: string, terms: string[]): string | null {
  const statement = classifyResidenceStatement(message, terms);
  return statement?.kind === 'out' ? statement.term : null;
}

/**
 * Veredicto del prefijo contra la lista blanca, o null si el teléfono no da
 * para decidir (sin número, o demasiado corto para ser un número completo): en
 * ese caso el turno sigue con las menciones del chat, como sin teléfono.
 */
function evaluatePrefixAgainstAllowlist(
  phone: string | null | undefined,
  allowlist: ZoneAllowlist,
): ZoneVerdict | null {
  const country = inferCountryFromPhone(phone);
  if (country) {
    const tier = zoneOfIso(country.iso, allowlist);
    if (tier === 'out') return { kind: 'reject_by_prefix', country };
    return { kind: 'in_zone_by_prefix', country, tier };
  }
  const digits = normalizePhoneDigits(phone);
  if (digits && digits.length >= UNKNOWN_PREFIX_MIN_DIGITS) {
    return {
      kind: 'reject_by_prefix',
      country: {
        iso: UNKNOWN_COUNTRY_ISO,
        name: UNKNOWN_COUNTRY_NAME,
        // Tres cifras como pista para quien lea el log o la directiva; no es
        // necesariamente el prefijo real (los hay de una a tres cifras).
        prefix: digits.slice(0, 3),
      },
    };
  }
  return null;
}

function excerptAround(message: string): string {
  const flat = message.replace(/\s+/g, ' ').trim();
  return flat.length > MAX_EXCERPT_CHARS ? `${flat.slice(0, MAX_EXCERPT_CHARS)}…` : flat;
}
