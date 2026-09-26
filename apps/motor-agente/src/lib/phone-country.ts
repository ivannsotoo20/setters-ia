/**
 * País del lead a partir del prefijo internacional de su teléfono (E.164).
 *
 * Nació el 2026-09-12 por Tania: el setter seguía llevando a videollamada a
 * personas de Guatemala o El Salvador cuando el número (+502, +503) ya lo decía
 * desde el primer mensaje. La regla de zona vivía solo en el bloque del coach,
 * como criterio "reactivo" que dependía de que la persona nombrara su país. Con
 * el prefijo delante, esperar a que lo diga es regalar turnos y llamadas.
 *
 * 2026-09-26 — el mapa pasa a cubrir el mundo que escribe de verdad. Con la
 * zona en LISTA BLANCA (zone-config.ts) un prefijo que no se reconoce ya no es
 * neutro, y el mapa tenía dos agujeros medidos:
 *   - Todo +1 que no fuera R. Dominicana o Puerto Rico salía 'US': Jamaica
 *     (+1876) o Trinidad (+1868) "cualificaban" como Estados Unidos. El Caribe
 *     del plan de numeración norteamericano (NANP) va ahora como países propios.
 *   - De Europa solo estaban los vecinos de España: Polonia, Suecia, Grecia…
 *     devolvían null. Van todos los prefijos europeos, más el resto de
 *     Latinoamérica y los del resto del mundo más habituales.
 *
 * Complementa a `phone-to-timezone.ts` (mismo mapa de prefijos, otra salida):
 * aquella responde "qué hora es allí", esta responde "qué país es". Se mantienen
 * separadas porque un país puede tener varios husos y un huso varios países.
 *
 * Match por longitud descendente (4 antes que 3 antes que 2 antes que 1) para
 * que +598 (Uruguay) no caiga en +5, +1876 (Jamaica) no caiga en +1 (US/CA) y
 * +77 (Kazajistán) no caiga en +7 (Rusia).
 */

export interface PhoneCountry {
  /** ISO 3166-1 alpha-2, en mayúsculas. */
  iso: string;
  /** Nombre en español tal y como se le enseña al setter. */
  name: string;
  /** Prefijo internacional sin `+`. */
  prefix: string;
}

const PREFIX_TO_COUNTRY: Record<string, { iso: string; name: string }> = {
  // Europa, prefijos de dos cifras (+3x / +4x)
  '30': { iso: 'GR', name: 'Grecia' },
  '31': { iso: 'NL', name: 'Países Bajos' },
  '32': { iso: 'BE', name: 'Bélgica' },
  '33': { iso: 'FR', name: 'Francia' },
  '34': { iso: 'ES', name: 'España' },
  '36': { iso: 'HU', name: 'Hungría' },
  '39': { iso: 'IT', name: 'Italia' },
  '40': { iso: 'RO', name: 'Rumanía' },
  '41': { iso: 'CH', name: 'Suiza' },
  '43': { iso: 'AT', name: 'Austria' },
  '44': { iso: 'GB', name: 'Reino Unido' },
  '45': { iso: 'DK', name: 'Dinamarca' },
  '46': { iso: 'SE', name: 'Suecia' },
  '47': { iso: 'NO', name: 'Noruega' },
  '48': { iso: 'PL', name: 'Polonia' },
  '49': { iso: 'DE', name: 'Alemania' },
  // Europa, prefijos de tres cifras (+35x, +37x, +38x, +42x) y Feroe
  '298': { iso: 'FO', name: 'Islas Feroe' },
  '350': { iso: 'GI', name: 'Gibraltar' },
  '351': { iso: 'PT', name: 'Portugal' },
  '352': { iso: 'LU', name: 'Luxemburgo' },
  '353': { iso: 'IE', name: 'Irlanda' },
  '354': { iso: 'IS', name: 'Islandia' },
  '355': { iso: 'AL', name: 'Albania' },
  '356': { iso: 'MT', name: 'Malta' },
  '357': { iso: 'CY', name: 'Chipre' },
  '358': { iso: 'FI', name: 'Finlandia' },
  '359': { iso: 'BG', name: 'Bulgaria' },
  '370': { iso: 'LT', name: 'Lituania' },
  '371': { iso: 'LV', name: 'Letonia' },
  '372': { iso: 'EE', name: 'Estonia' },
  '373': { iso: 'MD', name: 'Moldavia' },
  // Armenia cae en el bloque europeo de numeración, pero es Cáucaso: fuera de
  // EUROPE_ISO a propósito (zone-config.ts). Se nombra para no dejarla en null.
  '374': { iso: 'AM', name: 'Armenia' },
  '375': { iso: 'BY', name: 'Bielorrusia' },
  '376': { iso: 'AD', name: 'Andorra' },
  '377': { iso: 'MC', name: 'Mónaco' },
  '378': { iso: 'SM', name: 'San Marino' },
  '380': { iso: 'UA', name: 'Ucrania' },
  '381': { iso: 'RS', name: 'Serbia' },
  '382': { iso: 'ME', name: 'Montenegro' },
  '383': { iso: 'XK', name: 'Kosovo' },
  '385': { iso: 'HR', name: 'Croacia' },
  '386': { iso: 'SI', name: 'Eslovenia' },
  '387': { iso: 'BA', name: 'Bosnia y Herzegovina' },
  '389': { iso: 'MK', name: 'Macedonia del Norte' },
  '420': { iso: 'CZ', name: 'República Checa' },
  '421': { iso: 'SK', name: 'Eslovaquia' },
  '423': { iso: 'LI', name: 'Liechtenstein' },
  // +7 es Rusia y Kazajistán a la vez. Kazajistán son los +76 y +77: sin esas
  // dos entradas, un número kazajo se leería como Rusia, y Rusia está en
  // EUROPE_ISO (zona siempre). Ganan a '7' por longitud.
  '7': { iso: 'RU', name: 'Rusia' },
  '76': { iso: 'KZ', name: 'Kazajistán' },
  '77': { iso: 'KZ', name: 'Kazajistán' },
  // Latinoamérica hispanohablante
  '54': { iso: 'AR', name: 'Argentina' },
  '52': { iso: 'MX', name: 'México' },
  '57': { iso: 'CO', name: 'Colombia' },
  '51': { iso: 'PE', name: 'Perú' },
  '56': { iso: 'CL', name: 'Chile' },
  '58': { iso: 'VE', name: 'Venezuela' },
  '598': { iso: 'UY', name: 'Uruguay' },
  '595': { iso: 'PY', name: 'Paraguay' },
  '593': { iso: 'EC', name: 'Ecuador' },
  '591': { iso: 'BO', name: 'Bolivia' },
  '506': { iso: 'CR', name: 'Costa Rica' },
  '507': { iso: 'PA', name: 'Panamá' },
  '503': { iso: 'SV', name: 'El Salvador' },
  '502': { iso: 'GT', name: 'Guatemala' },
  '504': { iso: 'HN', name: 'Honduras' },
  '505': { iso: 'NI', name: 'Nicaragua' },
  '53': { iso: 'CU', name: 'Cuba' },
  '240': { iso: 'GQ', name: 'Guinea Ecuatorial' },
  // Resto de Latinoamérica y Caribe fuera del NANP
  '55': { iso: 'BR', name: 'Brasil' },
  '501': { iso: 'BZ', name: 'Belice' },
  '509': { iso: 'HT', name: 'Haití' },
  '592': { iso: 'GY', name: 'Guyana' },
  '594': { iso: 'GF', name: 'Guayana Francesa' },
  '597': { iso: 'SR', name: 'Surinam' },
  '590': { iso: 'GP', name: 'Guadalupe' },
  '596': { iso: 'MQ', name: 'Martinica' },
  '297': { iso: 'AW', name: 'Aruba' },
  '599': { iso: 'CW', name: 'Curazao' },
  // Caribe y Pacífico del NANP (+1 + código de área de tres cifras). Cada uno
  // es su país o territorio, NO Estados Unidos: antes todos caían en '1'.
  '1242': { iso: 'BS', name: 'Bahamas' },
  '1246': { iso: 'BB', name: 'Barbados' },
  '1264': { iso: 'AI', name: 'Anguila' },
  '1268': { iso: 'AG', name: 'Antigua y Barbuda' },
  '1284': { iso: 'VG', name: 'Islas Vírgenes Británicas' },
  '1340': { iso: 'VI', name: 'Islas Vírgenes de Estados Unidos' },
  '1345': { iso: 'KY', name: 'Islas Caimán' },
  '1441': { iso: 'BM', name: 'Bermudas' },
  '1473': { iso: 'GD', name: 'Granada' },
  '1649': { iso: 'TC', name: 'Islas Turcas y Caicos' },
  // Jamaica tiene dos códigos: el 876 de siempre y el 658, que se le añadió
  // cuando el 876 se agotó.
  '1658': { iso: 'JM', name: 'Jamaica' },
  '1664': { iso: 'MS', name: 'Montserrat' },
  '1670': { iso: 'MP', name: 'Islas Marianas del Norte' },
  '1671': { iso: 'GU', name: 'Guam' },
  '1684': { iso: 'AS', name: 'Samoa Americana' },
  '1721': { iso: 'SX', name: 'Sint Maarten' },
  '1758': { iso: 'LC', name: 'Santa Lucía' },
  '1767': { iso: 'DM', name: 'Dominica' },
  '1784': { iso: 'VC', name: 'San Vicente y las Granadinas' },
  '1787': { iso: 'PR', name: 'Puerto Rico' },
  '1809': { iso: 'DO', name: 'República Dominicana' },
  '1829': { iso: 'DO', name: 'República Dominicana' },
  '1849': { iso: 'DO', name: 'República Dominicana' },
  '1868': { iso: 'TT', name: 'Trinidad y Tobago' },
  '1869': { iso: 'KN', name: 'San Cristóbal y Nieves' },
  '1876': { iso: 'JM', name: 'Jamaica' },
  '1939': { iso: 'PR', name: 'Puerto Rico' },
  // US / Canadá (NANP genérico; los +1XXX de arriba ganan por longitud). No se
  // pueden separar sin una tabla de códigos de área, por eso el nombre dice
  // los dos.
  '1': { iso: 'US', name: 'Estados Unidos o Canadá' },
  // Oceanía
  '61': { iso: 'AU', name: 'Australia' },
  '64': { iso: 'NZ', name: 'Nueva Zelanda' },
  // Norte de África y África
  '20': { iso: 'EG', name: 'Egipto' },
  '212': { iso: 'MA', name: 'Marruecos' },
  '213': { iso: 'DZ', name: 'Argelia' },
  '216': { iso: 'TN', name: 'Túnez' },
  '234': { iso: 'NG', name: 'Nigeria' },
  '27': { iso: 'ZA', name: 'Sudáfrica' },
  // Oriente Medio y Asia
  '90': { iso: 'TR', name: 'Turquía' },
  '971': { iso: 'AE', name: 'Emiratos Árabes Unidos' },
  '966': { iso: 'SA', name: 'Arabia Saudí' },
  '972': { iso: 'IL', name: 'Israel' },
  '98': { iso: 'IR', name: 'Irán' },
  '91': { iso: 'IN', name: 'India' },
  '92': { iso: 'PK', name: 'Pakistán' },
  '86': { iso: 'CN', name: 'China' },
  '81': { iso: 'JP', name: 'Japón' },
  '82': { iso: 'KR', name: 'Corea del Sur' },
  '63': { iso: 'PH', name: 'Filipinas' },
  '62': { iso: 'ID', name: 'Indonesia' },
  '60': { iso: 'MY', name: 'Malasia' },
  '66': { iso: 'TH', name: 'Tailandia' },
  '84': { iso: 'VN', name: 'Vietnam' },
};

const PREFIX_BY_LENGTH = Object.keys(PREFIX_TO_COUNTRY).sort((a, b) => b.length - a.length);

/**
 * Solo los dígitos del número, sin el "+" ni el "00" internacional. Null si no
 * queda nada. Exportado porque zone-policy.ts necesita la longitud de un número
 * cuyo prefijo no está en el mapa (con lista blanca, lo desconocido no es zona).
 */
export function normalizePhoneDigits(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (trimmed === '') return null;
  // "00" delante es la forma antigua del "+": se quita para que el prefijo case.
  const withoutIdd = trimmed.startsWith('00') ? trimmed.slice(2) : trimmed;
  const digits = withoutIdd.replace(/[^\d]/g, '');
  return digits.length === 0 ? null : digits;
}

/**
 * Devuelve el país inferido del prefijo, o null si no se reconoce o el número
 * no es utilizable (prefijo sin nada detrás).
 *
 *   inferCountryFromPhone('+50258746350') → { iso: 'GT', name: 'Guatemala', prefix: '502' }
 *   inferCountryFromPhone('+34 600 12 34 56') → { iso: 'ES', ... }
 *   inferCountryFromPhone('+18761234567') → { iso: 'JM', name: 'Jamaica', prefix: '1876' }
 *   inferCountryFromPhone(null) → null
 */
export function inferCountryFromPhone(phone: string | null | undefined): PhoneCountry | null {
  const digits = normalizePhoneDigits(phone);
  if (!digits) return null;
  for (const prefix of PREFIX_BY_LENGTH) {
    if (!digits.startsWith(prefix)) continue;
    if (digits.length - prefix.length < 4) continue;
    const entry = PREFIX_TO_COUNTRY[prefix]!;
    return { iso: entry.iso, name: entry.name, prefix };
  }
  return null;
}

/** Solo expuesto para tests. */
export const __TEST_PREFIX_COUNTRY_MAP = PREFIX_TO_COUNTRY;
