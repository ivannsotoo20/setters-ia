/**
 * Cerrojo de la videollamada (2026-10-07, Tania).
 *
 * Tania, tras meses con el mismo fallo: "se siguen proponiendo/agendando llamadas
 * a personas que no cualifican por país o por tiempo de evolución del dolor". El
 * criterio estaba en su bloque de coach y aplicarlo dependía del modelo. Con el
 * cerrojo, el setter declara en la tool, en cada turno, dónde vive la persona y
 * desde cuándo le duele, y el pipeline (V22, packages/agent-pipeline) no deja
 * salir una propuesta ni el enlace si con eso no cualifica o falta un dato.
 *
 * Configuración en `tenant_configs.lead_qualification.call_gate`:
 *   { "require_country": true, "min_pain_months": 3 }
 * - require_country: solo con `zone_allowlist`; los países de la lista (siempre
 *   y con filtro) son los que van a videollamada.
 * - min_pain_months: meses mínimos de dolor, salvo episodio anterior descrito.
 * Sin `call_gate` (o sin nada que exigir) no hay cerrojo y la tool no cambia.
 */

import type { CallGate } from '@fyzon/agent-pipeline';
import { parseZoneAllowlist } from './zone-config.js';
import type { ZoneVerdict } from './zone-policy.js';

export interface CallGateConfig {
  requireCountry: boolean;
  minPainMonths: number | null;
}

export function parseCallGateConfig(leadQualification: unknown): CallGateConfig | null {
  if (!leadQualification || typeof leadQualification !== 'object' || Array.isArray(leadQualification)) {
    return null;
  }
  const raw = (leadQualification as Record<string, unknown>).call_gate;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const cfg = raw as Record<string, unknown>;
  const requireCountry = cfg.require_country === true;
  const months = cfg.min_pain_months;
  const minPainMonths =
    typeof months === 'number' && Number.isFinite(months) && months > 0 && months <= 120 ? months : null;
  if (!requireCountry && minPainMonths == null) return null;
  return { requireCountry, minPainMonths };
}

/**
 * El cerrojo de este turno, o undefined si el tenant no lo tiene. El país solo se
 * exige con lista blanca (es lo que dice qué países van a videollamada), y no
 * hace falta que lo declare el setter si el prefijo ya es de zona.
 */
export function buildCallGate(args: {
  leadQualification: unknown;
  zoneVerdict: ZoneVerdict;
}): CallGate | undefined {
  const cfg = parseCallGateConfig(args.leadQualification);
  if (!cfg) return undefined;
  const allowlist = cfg.requireCountry ? parseZoneAllowlist(args.leadQualification) : null;
  const allowedCountries = allowlist ? [...allowlist.always, ...allowlist.filtered] : null;
  if (!allowedCountries && cfg.minPainMonths == null) return undefined;
  return {
    allowedCountries,
    countryKnownInZone: args.zoneVerdict.kind === 'in_zone_by_prefix',
    minPainMonths: cfg.minPainMonths,
  };
}

/**
 * Lo que el setter tiene que saber del cerrojo, en la directiva runtime: qué
 * declarar en la tool y que sin eso no hay propuesta. El cómo preguntar y el
 * camino de quien no cualifica siguen en el bloque del coach.
 */
export function renderCallGateBlock(gate: CallGate | undefined): string | null {
  if (!gate) return null;
  const needs: string[] = [];
  if (gate.allowedCountries && !gate.countryKnownInZone) {
    needs.push(
      '**dónde vive** (rellena `lead_country_iso` con el código del país en cuanto ella lo diga o ' +
        'esté en su formulario; si no lo sabes, no lo rellenes)',
    );
  }
  if (gate.minPainMonths != null) {
    needs.push(
      `**desde cuándo le duele** (rellena \`pain_duration_months\`; con menos de ${gate.minPainMonths} ` +
        'meses solo va a videollamada si ha descrito un episodio anterior del mismo dolor, y entonces ' +
        'marcas `previous_episode`)',
    );
  }
  if (needs.length === 0) return null;
  return (
    '## Antes de proponer la videollamada (cerrojo del motor)\n\n' +
    `Para proponer la videollamada o mandar el enlace tienes que saber, y declarar en la herramienta ` +
    `en ese mismo turno, ${needs.join(' y ')}. Decláralo en cada turno en que lo sepas. Si falta un ` +
    'dato, lo preguntas antes de proponer, una sola pregunta y dentro de la conversación. Si con lo ' +
    'que sabes no cualifica, sigues lo que tu bloque dice para ese caso. El motor comprueba lo que ' +
    'declaras: una propuesta sin esos datos no sale.'
  );
}
