/**
 * Lista blanca de zona de la entrenadora: UNA fuente para el formulario y el chat.
 *
 * QUÉ RESUELVE (2026-09-26, Tania)
 *   La zona vivía en cuatro sitios que no se leían entre sí: una lista negra de
 *   ISO para el prefijo del chat (`no_contact_countries`), una lista de términos
 *   para el formulario y las menciones (`country_reject_terms`), el prompt del
 *   evaluador IA (`ai_criteria`, con una "Zona D" de Latinoamérica con filtro
 *   económico) y el bloque del coach. Perú no estaba vetado en ninguno, así que
 *   un abogado de Lima (conv 12145) salió aprobado por el formulario, el motor le
 *   dijo al setter "a efectos de zona cualifica" y llegó al enlace de agenda.
 *
 *   Iván, ese día: solo se contacta Europa (España incluida), EEUU, Canadá,
 *   Australia y Nueva Zelanda siempre, y México y Chile con filtro de trabajo;
 *   el resto de Latinoamérica (y del mundo) no. Eso es una LISTA BLANCA: una
 *   lista negra nunca cubre Haití, Trinidad, Marruecos ni el próximo país que
 *   nadie pensó en escribir.
 *
 * DÓNDE VIVE
 *   `tenant_configs.lead_qualification.zone_allowlist`:
 *     { "always": ["ES","PT",…,"US","CA","AU","NZ"], "filtered": ["MX","CL"] }
 *   Un tenant sin `zone_allowlist` sigue con la lista negra de siempre
 *   (`no_contact_countries`): este módulo devuelve null y nadie cambia de
 *   comportamiento.
 *
 * QUÉ NO HACE
 *   No decide residencia sobre origen ni prefijo sobre formulario: eso lo decide
 *   cada capa (lead-qualifier.ts en el formulario, zone-policy.ts en el chat).
 *   Aquí solo se responde "¿este país está en zona, con filtro o fuera?" y
 *   "¿qué país es este nombre?".
 */

import { normalizeText } from './text-match.js';

export type ZoneTier = 'always' | 'filtered' | 'out';

export interface ZoneAllowlist {
  /** ISO-2: se contacta siempre, sea cual sea su trabajo. */
  always: Set<string>;
  /** ISO-2: se contacta con filtro de trabajo / ingresos (México y Chile para Tania). */
  filtered: Set<string>;
}

/** Europa geográfica (ISO-2). Turquía y el Cáucaso quedan fuera a propósito. */
export const EUROPE_ISO: readonly string[] = [
  'AD', 'AL', 'AT', 'BA', 'BE', 'BG', 'BY', 'CH', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES',
  'FI', 'FO', 'FR', 'GB', 'GI', 'GR', 'HR', 'HU', 'IE', 'IS', 'IT', 'LI', 'LT', 'LU',
  'LV', 'MC', 'MD', 'ME', 'MK', 'MT', 'NL', 'NO', 'PL', 'PT', 'RO', 'RS', 'RU', 'SE',
  'SI', 'SK', 'SM', 'UA', 'VA', 'XK',
];

const ISO_RE = /^[A-Z]{2}$/;

function isoSet(raw: unknown): Set<string> {
  const out = new Set<string>();
  if (!Array.isArray(raw)) return out;
  for (const v of raw) {
    if (typeof v !== 'string') continue;
    const iso = v.trim().toUpperCase();
    if (ISO_RE.test(iso)) out.add(iso);
  }
  return out;
}

/**
 * Lee `zone_allowlist` de `lead_qualification`. Devuelve null si no existe o si
 * no trae ningún país en zona (una lista blanca vacía rechazaría a todo el
 * mundo: eso nunca es una configuración intencionada).
 */
export function parseZoneAllowlist(leadQualification: unknown): ZoneAllowlist | null {
  if (!leadQualification || typeof leadQualification !== 'object' || Array.isArray(leadQualification)) {
    return null;
  }
  const raw = (leadQualification as Record<string, unknown>).zone_allowlist;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const cfg = raw as Record<string, unknown>;
  const always = isoSet(cfg.always);
  const filtered = isoSet(cfg.filtered);
  for (const iso of always) filtered.delete(iso);
  if (always.size === 0 && filtered.size === 0) return null;
  return { always, filtered };
}

export function zoneOfIso(iso: string | null | undefined, allow: ZoneAllowlist): ZoneTier {
  if (!iso) return 'out';
  const up = iso.toUpperCase();
  if (allow.always.has(up)) return 'always';
  if (allow.filtered.has(up)) return 'filtered';
  return 'out';
}

/**
 * Nombres de país → ISO. Se comparan NORMALIZADOS (minúsculas, sin acentos, la
 * puntuación como espacio). Solo nombres de PAÍS: las ciudades y los gentilicios
 * no van aquí (una ciudad tiene homónimos y un gentilicio es origen, no
 * residencia). Sirve para dos cosas: traducir el `pais_detectado` del evaluador
 * IA a ISO, y aprobar en seco un formulario que escribe su país con todas las
 * letras.
 */
const COUNTRY_NAMES: Record<string, readonly string[]> = {
  // Europa
  ES: ['espana', 'spain', 'espanya', 'islas canarias', 'canarias', 'islas baleares'],
  PT: ['portugal'],
  FR: ['francia', 'france'],
  IT: ['italia', 'italy'],
  DE: ['alemania', 'germany', 'deutschland'],
  GB: ['reino unido', 'uk', 'united kingdom', 'inglaterra', 'england', 'escocia', 'scotland', 'gales', 'wales', 'gran bretana', 'great britain', 'irlanda del norte'],
  IE: ['irlanda', 'ireland'],
  NL: ['paises bajos', 'holanda', 'netherlands', 'the netherlands'],
  BE: ['belgica', 'belgium'],
  CH: ['suiza', 'switzerland'],
  AT: ['austria'],
  SE: ['suecia', 'sweden'],
  NO: ['noruega', 'norway'],
  DK: ['dinamarca', 'denmark'],
  FI: ['finlandia', 'finland'],
  PL: ['polonia', 'poland'],
  GR: ['grecia', 'greece'],
  HU: ['hungria', 'hungary'],
  CZ: ['republica checa', 'chequia', 'czechia', 'czech republic'],
  RO: ['rumania', 'rumanía', 'romania'],
  BG: ['bulgaria'],
  HR: ['croacia', 'croatia'],
  SI: ['eslovenia', 'slovenia'],
  SK: ['eslovaquia', 'slovakia'],
  EE: ['estonia'],
  LV: ['letonia', 'latvia'],
  LT: ['lituania', 'lithuania'],
  LU: ['luxemburgo', 'luxembourg'],
  MT: ['malta'],
  CY: ['chipre', 'cyprus'],
  IS: ['islandia', 'iceland'],
  AD: ['andorra'],
  MC: ['monaco'],
  SM: ['san marino'],
  LI: ['liechtenstein'],
  VA: ['vaticano', 'ciudad del vaticano'],
  GI: ['gibraltar'],
  AL: ['albania'],
  BA: ['bosnia', 'bosnia y herzegovina', 'bosnia herzegovina'],
  RS: ['serbia'],
  ME: ['montenegro'],
  MK: ['macedonia', 'macedonia del norte', 'north macedonia'],
  XK: ['kosovo'],
  MD: ['moldavia', 'moldova'],
  UA: ['ucrania', 'ukraine'],
  BY: ['bielorrusia', 'belarus'],
  RU: ['rusia', 'russia'],
  FO: ['islas feroe'],
  // Norteamérica y Oceanía
  US: ['estados unidos', 'estados unidos de america', 'eeuu', 'ee uu', 'usa', 'united states', 'united states of america'],
  CA: ['canada'],
  AU: ['australia'],
  NZ: ['nueva zelanda', 'new zealand'],
  // Latinoamérica y Caribe
  MX: ['mexico'],
  CL: ['chile'],
  PE: ['peru'],
  VE: ['venezuela'],
  CU: ['cuba'],
  DO: ['republica dominicana', 'rep dominicana', 'dominican republic'],
  CO: ['colombia'],
  BO: ['bolivia'],
  EC: ['ecuador'],
  GT: ['guatemala'],
  SV: ['el salvador'],
  AR: ['argentina'],
  HN: ['honduras'],
  NI: ['nicaragua'],
  CR: ['costa rica'],
  PA: ['panama'],
  PY: ['paraguay'],
  UY: ['uruguay'],
  BR: ['brasil', 'brazil'],
  PR: ['puerto rico'],
  BZ: ['belice', 'belize'],
  GY: ['guyana'],
  SR: ['surinam', 'suriname'],
  HT: ['haiti'],
  JM: ['jamaica'],
  TT: ['trinidad y tobago', 'trinidad and tobago', 'trinidad'],
  // Resto del mundo más habitual en los formularios
  TR: ['turquia', 'turkey'],
  MA: ['marruecos', 'morocco'],
  DZ: ['argelia', 'algeria'],
  EG: ['egipto', 'egypt'],
  IL: ['israel'],
  AE: ['emiratos arabes unidos', 'emiratos', 'dubai'],
  IN: ['india'],
  CN: ['china'],
  JP: ['japon', 'japan'],
  PH: ['filipinas', 'philippines'],
  GQ: ['guinea ecuatorial'],
};

/** Minúsculas, sin acentos, puntuación como espacio y espacios colapsados. */
export function normalizePlace(s: unknown): string {
  return normalizeText(s)
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const NAME_TO_ISO = new Map<string, string>();
for (const [iso, names] of Object.entries(COUNTRY_NAMES)) {
  for (const n of names) NAME_TO_ISO.set(normalizePlace(n), iso);
}
/** Nombres ordenados de más largo a más corto: "estados unidos de america" antes que "estados unidos". */
const NAMES_BY_LENGTH = [...NAME_TO_ISO.keys()].sort((a, b) => b.length - a.length);

const LEADING_FILLER = /^(?:(?:yo\s+)?(?:vivo|resido|estoy|radico)\s+(?:en|actualmente en)\s+|actualmente\s+(?:en\s+)?|desde\s+|en\s+)/;

/**
 * ISO del país cuando el texto ES un nombre de país (con "vivo en", "en" o
 * "desde" delante como mucho). Devuelve null para ciudades, frases o nombres que
 * no están en la tabla.
 *
 *   isoFromCountryName('Perú') → 'PE'
 *   isoFromCountryName('EE.UU.') → 'US'
 *   isoFromCountryName('vivo en España') → 'ES'
 *   isoFromCountryName('Lima') → null
 */
export function isoFromCountryName(text: unknown): string | null {
  const norm = normalizePlace(text).replace(LEADING_FILLER, '').trim();
  if (!norm) return null;
  return NAME_TO_ISO.get(norm) ?? null;
}

/**
 * Todos los países cuyo NOMBRE aparece como palabra completa dentro del texto
 * libre, en orden de aparición y sin repetir. "Cundinamarca" no es Dinamarca,
 * "Usaquén" no es USA; "Cañada de Gómez, Argentina" devuelve CA y AR (y el que
 * llama decide que un texto con dos países no se resuelve en seco).
 */
export function findCountryNames(text: unknown): string[] {
  let rest = ` ${normalizePlace(text)} `;
  const found: Array<{ iso: string; at: number }> = [];
  for (const name of NAMES_BY_LENGTH) {
    const needle = ` ${name} `;
    let at = rest.indexOf(needle);
    while (at >= 0) {
      found.push({ iso: NAME_TO_ISO.get(name)!, at });
      // Se tapa el tramo para que "estados unidos" no vuelva a casar dentro de
      // "estados unidos de america" ni "guinea" dentro de "guinea ecuatorial".
      rest = rest.slice(0, at + 1) + ' '.repeat(name.length) + rest.slice(at + 1 + name.length);
      at = rest.indexOf(needle);
    }
  }
  const seen = new Set<string>();
  return found
    .sort((a, b) => a.at - b.at)
    .map((f) => f.iso)
    .filter((iso) => (seen.has(iso) ? false : (seen.add(iso), true)));
}

/** Nombre en español de un ISO para enseñarlo al setter o en un motivo. */
export function countryNameEs(iso: string): string {
  const first = COUNTRY_NAMES[iso.toUpperCase()]?.[0];
  if (!first) return iso.toUpperCase();
  const pretty: Record<string, string> = {
    espana: 'España', peru: 'Perú', mexico: 'México', 'estados unidos': 'Estados Unidos',
    canada: 'Canadá', panama: 'Panamá', 'republica dominicana': 'República Dominicana',
    'republica checa': 'República Checa', belgica: 'Bélgica', hungria: 'Hungría', haiti: 'Haití',
    'paises bajos': 'Países Bajos', turquia: 'Turquía', japon: 'Japón', rumania: 'Rumanía',
  };
  return pretty[first] ?? first.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

/** Solo para tests. */
export const __TEST_COUNTRY_NAMES = COUNTRY_NAMES;
