/**
 * País del lead a partir del prefijo internacional de su teléfono (E.164).
 *
 * Nació el 2026-09-12 por Tania: el setter seguía llevando a videollamada a
 * personas de Guatemala o El Salvador cuando el número (+502, +503) ya lo decía
 * desde el primer mensaje. La regla de zona vivía solo en el bloque del coach,
 * como criterio "reactivo" que dependía de que la persona nombrara su país. Con
 * el prefijo delante, esperar a que lo diga es regalar turnos y llamadas.
 *
 * Complementa a `phone-to-timezone.ts` (mismo mapa de prefijos, otra salida):
 * aquella responde "qué hora es allí", esta responde "qué país es". Se mantienen
 * separadas porque un país puede tener varios husos y un huso varios países.
 *
 * Match por longitud descendente (3 antes que 2 antes que 1) para que +598
 * (Uruguay) no caiga en +5 y +1809 (R. Dominicana) no caiga en +1 (US/CA).
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
  // España y vecinos
  '34': { iso: 'ES', name: 'España' },
  '351': { iso: 'PT', name: 'Portugal' },
  '33': { iso: 'FR', name: 'Francia' },
  '39': { iso: 'IT', name: 'Italia' },
  '49': { iso: 'DE', name: 'Alemania' },
  '44': { iso: 'GB', name: 'Reino Unido' },
  '353': { iso: 'IE', name: 'Irlanda' },
  '31': { iso: 'NL', name: 'Países Bajos' },
  '32': { iso: 'BE', name: 'Bélgica' },
  '41': { iso: 'CH', name: 'Suiza' },
  '43': { iso: 'AT', name: 'Austria' },
  '376': { iso: 'AD', name: 'Andorra' },
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
  '1809': { iso: 'DO', name: 'República Dominicana' },
  '1829': { iso: 'DO', name: 'República Dominicana' },
  '1849': { iso: 'DO', name: 'República Dominicana' },
  '1787': { iso: 'PR', name: 'Puerto Rico' },
  '1939': { iso: 'PR', name: 'Puerto Rico' },
  // Brasil
  '55': { iso: 'BR', name: 'Brasil' },
  // US / Canadá (NANP genérico; los +1XXX del Caribe van arriba y ganan por longitud)
  '1': { iso: 'US', name: 'Estados Unidos o Canadá' },
  // Oceanía
  '61': { iso: 'AU', name: 'Australia' },
  '64': { iso: 'NZ', name: 'Nueva Zelanda' },
};

const PREFIX_BY_LENGTH = Object.keys(PREFIX_TO_COUNTRY).sort((a, b) => b.length - a.length);

function normalizePhoneDigits(raw: string | null | undefined): string | null {
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
