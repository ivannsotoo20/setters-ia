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
 * DÓNDE VIVE LA CONFIGURACIÓN
 *   `tenant_configs.lead_qualification` (JSONB), las claves `no_contact_countries`
 *   (ISO-2, p. ej. ["VE","CU","DO","CO","BO","EC","GT","SV","AR"]) y
 *   `country_reject_terms` (ya existía para el formulario). Un tenant sin ninguna
 *   de las dos no tiene política: `loadZonePolicy` devuelve null y el turno sigue
 *   exactamente igual que antes.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { inferCountryFromPhone, type PhoneCountry } from './phone-country.js';
import { findWholeWordTerm, normalizeText } from './text-match.js';

export interface ZonePolicy {
  /** ISO 3166-1 alpha-2 en mayúsculas. */
  noContactCountries: Set<string>;
  /** Términos (país / gentilicio / ciudad) que, escritos por la persona, obligan a confirmar residencia. */
  countryRejectTerms: string[];
}

export type ZoneVerdict =
  /** El prefijo del teléfono es de un país de la lista: no cualifica por residencia. */
  | { kind: 'reject_by_prefix'; country: PhoneCountry }
  /** El prefijo es de un país fuera de la lista: a efectos de zona cualifica. */
  | { kind: 'in_zone_by_prefix'; country: PhoneCountry }
  /** Sin teléfono utilizable, pero la persona ha nombrado un término de la lista en el chat. */
  | { kind: 'mention'; term: string; excerpt: string }
  /** Nada que declarar. */
  | { kind: 'clear' };

const MAX_EXCERPT_CHARS = 90;

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

  if (countries.size === 0 && terms.length === 0) return null;
  return { noContactCountries: countries, countryRejectTerms: terms };
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
}): ZoneVerdict {
  const { phone, leadMessages, policy } = input;
  if (!policy) return { kind: 'clear' };

  const country = inferCountryFromPhone(phone);
  if (country && policy.noContactCountries.size > 0) {
    if (policy.noContactCountries.has(country.iso)) {
      return { kind: 'reject_by_prefix', country };
    }
    return { kind: 'in_zone_by_prefix', country };
  }

  if (policy.countryRejectTerms.length > 0) {
    for (const message of leadMessages) {
      if (typeof message !== 'string' || message.trim() === '') continue;
      const term = findWholeWordTerm(normalizeText(message), policy.countryRejectTerms);
      if (term) {
        return { kind: 'mention', term, excerpt: excerptAround(message) };
      }
    }
  }

  return { kind: 'clear' };
}

function excerptAround(message: string): string {
  const flat = message.replace(/\s+/g, ' ').trim();
  return flat.length > MAX_EXCERPT_CHARS ? `${flat.slice(0, MAX_EXCERPT_CHARS)}…` : flat;
}
