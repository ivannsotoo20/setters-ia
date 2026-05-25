import type { SupabaseClient } from '@supabase/supabase-js';
import { buildComposedPrompt } from './builder.js';
import {
  buildGenderVerificationDirective,
  buildLeadAddressingDirective,
  type GenderVerificationStyle,
  type TargetClientGender,
  type UseLeadNameMode,
} from './interpolate.js';
import type {
  ComposeOptions,
  ComposedPrompt,
  LeadInferenceContext,
  PromptBlockRow,
} from './types.js';

export type {
  ComposeOptions,
  ComposedBlock,
  ComposedPrompt,
  PromptBlockRow,
  SystemContentBlock,
  TrainerContext,
  HandoffContext,
  LeadInferenceContext,
} from './types.js';
export { buildComposedPrompt } from './builder.js';
export {
  interpolateTrainerPlaceholders,
  interpolatePhasePriorities,
  renderHandoffDirective,
  buildLeadAddressingDirective,
  buildGenderVerificationDirective,
} from './interpolate.js';
export type {
  UseLeadNameMode,
  TargetClientGender,
  GenderVerificationStyle,
} from './interpolate.js';

/**
 * Carga los bloques relevantes desde `prompt_blocks` y compone el system prompt.
 *
 * Query: UN solo SELECT que trae:
 *   - Todos los bloques compartidos (tenant_id IS NULL) activos version=1.
 *   - Todos los bloques del tenant solicitado activos version=1.
 *
 * El `buildComposedPrompt` filtra y ordena los que realmente se incluyen
 * según `ComposeOptions` (Cerebro v5: core_v5_base + coach_v5 + admin_overrides_v1?
 * + output_contract_v5 + trainer_prefs_v1?).
 */
export async function composePrompt(
  supabase: SupabaseClient,
  options: ComposeOptions,
): Promise<ComposedPrompt> {
  const { data, error } = await supabase
    .from('prompt_blocks')
    .select('block_key, content, sort_order, tenant_id')
    .eq('is_active', true)
    .eq('version', 1)
    .or(`tenant_id.is.null,tenant_id.eq.${options.tenantId}`);

  if (error) {
    throw new Error(`composePrompt: supabase query failed: ${error.message}`);
  }
  if (!data || data.length === 0) {
    throw new Error(
      `composePrompt: no prompt_blocks found for tenant=${options.tenantId} (ni compartidos)`,
    );
  }

  const rows: PromptBlockRow[] = data.map((r) => ({
    block_key: String(r.block_key),
    content: String(r.content),
    sort_order: Number(r.sort_order),
    tenant_id: r.tenant_id === null ? null : Number(r.tenant_id),
  }));

  // Construir/aumentar TrainerContext a partir de trainer_preferences + options explícitas.
  // Si el caller no pasó trainerContext, lo cargamos de BD. Si lo pasó, respetamos sus valores
  // y enriquecemos los campos derivados de `options` (Hito 10+, currentPhaseFocus).
  let trainerContext = options.trainerContext;
  // Cache de la fila trainer_preferences para reusar entre el branch del
  // trainerContext auto-carga y el bloque Hito 12.2 directivas.
  let cachedPrefs: Record<string, unknown> | null = null;
  async function loadPrefs(): Promise<Record<string, unknown>> {
    if (cachedPrefs !== null) return cachedPrefs;
    const { data: prefsRow } = await supabase
      .from('trainer_preferences')
      .select('preferences')
      .eq('tenant_id', options.tenantId)
      .maybeSingle();
    cachedPrefs = (prefsRow?.preferences ?? {}) as Record<string, unknown>;
    return cachedPrefs;
  }
  if (trainerContext === undefined) {
    const prefs = await loadPrefs();
    const phoneRaw = typeof prefs.trainerPhone === 'string' ? prefs.trainerPhone.trim() : '';
    const phone = phoneRaw === '' ? null : phoneRaw;

    // Sprint 2.6b — extraer config handoff (4 fields)
    const handoffEnabled = prefs.handoffPersonalizationEnabled === true;
    const handoffMode =
      typeof prefs.handoffMode === 'string' &&
      ['share_phone', 'silent', 'custom_message'].includes(prefs.handoffMode)
        ? (prefs.handoffMode as 'share_phone' | 'silent' | 'custom_message')
        : 'share_phone';
    const handoffTemplate =
      typeof prefs.handoffCustomTemplate === 'string' &&
      ['warm', 'professional', 'free'].includes(prefs.handoffCustomTemplate)
        ? (prefs.handoffCustomTemplate as 'warm' | 'professional' | 'free')
        : 'warm';
    const handoffCustomMessage =
      typeof prefs.handoffCustomMessage === 'string' ? prefs.handoffCustomMessage : null;

    // Hito 10 — Fallback al closingResourceUrl legacy del trainer_preferences si
    // el caller no pasó un trackedCalendarUrl explícito construido con calendar_accounts.
    const legacyCalendarUrl =
      typeof prefs.closingResourceUrl === 'string'
        ? prefs.closingResourceUrl.trim() || null
        : null;

    trainerContext = {
      phone,
      handoff: {
        enabled: handoffEnabled,
        mode: handoffMode,
        template: handoffTemplate,
        customMessage: handoffCustomMessage,
      },
      trackedCalendarUrl: legacyCalendarUrl,
    };
  }

  // Cerebro v5 — currentPhaseFocus se inyecta desde el motor por turno (no se auto-carga).
  if (options.currentPhaseFocus !== undefined) {
    trainerContext = {
      ...trainerContext,
      currentPhaseFocus: options.currentPhaseFocus,
    };
  }

  // Hito 10 — Si el caller pasa explícitamente trackedCalendarUrl en options,
  // gana sobre el legacy auto-carga. Esto permite que el motor (pipeline) construya
  // el URL con tracking del lead actual (calendar_accounts default + tracking_uuid)
  // y se lo pase aquí. Si pasa null explícito → fuerza fallback al legacy del trainer_prefs.
  if (options.trackedCalendarUrl !== undefined) {
    trainerContext = {
      ...trainerContext,
      trackedCalendarUrl: options.trackedCalendarUrl ?? trainerContext.trackedCalendarUrl,
    };
  }

  // Hito 10.6 — Inyectar bloque de slots disponibles (si tenant usa API booking).
  if (
    options.availableSlots !== undefined &&
    options.availableSlots !== null &&
    options.availableSlots.length > 0
  ) {
    const block = options.availableSlots
      .map((s) => `- ${s.humanLabel}  (${s.iso})`)
      .join('\n');
    trainerContext = {
      ...trainerContext,
      availableSlotsBlock: block,
    };
  }

  // Hito 10.6.1 — Fecha actual humana es-ES.
  if (options.currentDateIso) {
    trainerContext = {
      ...trainerContext,
      currentDateLabel: renderCurrentDateLabel(options.currentDateIso),
    };
  }

  // Hito 10.6.1 — Estado de contacto del lead (nombre + email).
  if (options.leadContact) {
    trainerContext = {
      ...trainerContext,
      leadContactStatusBlock: renderLeadContactBlock(options.leadContact),
    };
  }

  // Hito 11 — Etiquetas humanas de timezone (lead + trainer).
  if (options.leadTimezoneLabel !== undefined) {
    trainerContext = {
      ...trainerContext,
      leadTimezoneLabel: options.leadTimezoneLabel,
    };
  }
  if (options.trainerTimezoneLabel !== undefined) {
    trainerContext = {
      ...trainerContext,
      trainerTimezoneLabel: options.trainerTimezoneLabel,
    };
  }

  // Hito 12.2 — Directiva nombre del lead + directiva verificación género.
  // Carga lazy lead inference si no se pasó explícito y hay leadId. Lee prefs
  // del trainer (4 keys nuevas) para decidir qué inyectar.
  let leadInference: LeadInferenceContext | null = options.leadInference ?? null;
  if (leadInference === null && typeof options.leadId === 'number' && Number.isFinite(options.leadId)) {
    try {
      const { data: leadRow } = await supabase
        .from('leads')
        .select('parsed_name, parsed_name_status, detected_gender')
        .eq('id', options.leadId)
        .maybeSingle();
      if (leadRow) {
        const r = leadRow as Record<string, unknown>;
        leadInference = {
          parsedName: typeof r.parsed_name === 'string' ? r.parsed_name : null,
          parsedNameStatus: validateNameStatus(r.parsed_name_status),
          detectedGender: validateDetectedGender(r.detected_gender),
        };
      }
    } catch {
      // Silencioso — Fase B no rompe el flujo si la query falla.
      leadInference = null;
    }
  }

  // Resolver preferencias del trainer (las 4 keys Hito 12.2 + read si aún no se cargó).
  const prefsForHito122 = await loadPrefs();
  const useLeadNameMode = parseUseLeadNameMode(prefsForHito122.useLeadNameMode);
  const leadNameMaxMentions = parseLeadNameMaxMentions(prefsForHito122.leadNameMaxMentions);
  const targetClientGender = parseTargetClientGender(prefsForHito122.targetClientGender);
  const genderVerificationStyle = parseGenderVerificationStyle(
    prefsForHito122.genderVerificationStyle,
  );

  const leadDirective = buildLeadAddressingDirective({
    mode: useLeadNameMode,
    maxMentions: leadNameMaxMentions,
    leadInference,
  });
  if (leadDirective !== null) {
    trainerContext = {
      ...trainerContext,
      leadAddressingDirective: leadDirective,
    };
  }

  const genderDirective = buildGenderVerificationDirective({
    targetClientGender,
    verificationStyle: genderVerificationStyle,
    leadInference,
  });

  // Si hay directiva de género, anexarla al extraSystemSuffix (OUT of cache).
  // Si el caller ya pasó un extraSystemSuffix, concatenamos con doble salto.
  let extraSystemSuffix = options.extraSystemSuffix ?? null;
  if (genderDirective !== null) {
    extraSystemSuffix = extraSystemSuffix
      ? `${extraSystemSuffix.trim()}\n\n${genderDirective}`
      : genderDirective;
  }

  return buildComposedPrompt(rows, {
    ...options,
    trainerContext,
    extraSystemSuffix,
  });
}

function validateNameStatus(v: unknown): 'usable' | 'not_usable' | 'unknown' | null {
  if (v === 'usable' || v === 'not_usable' || v === 'unknown') return v;
  return null;
}

function validateDetectedGender(
  v: unknown,
): 'male' | 'female' | 'ambiguous' | 'unknown' | null {
  if (v === 'male' || v === 'female' || v === 'ambiguous' || v === 'unknown') return v;
  return null;
}

function parseUseLeadNameMode(v: unknown): UseLeadNameMode {
  if (v === 'auto' || v === 'always' || v === 'never') return v;
  return 'auto';
}

function parseLeadNameMaxMentions(v: unknown): number {
  if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 5) return v;
  return 2;
}

function parseTargetClientGender(v: unknown): TargetClientGender {
  if (v === 'mixed' || v === 'male' || v === 'female') return v;
  return 'mixed';
}

function parseGenderVerificationStyle(v: unknown): GenderVerificationStyle {
  if (v === 'soft' || v === 'direct') return v;
  return 'soft';
}

function renderCurrentDateLabel(iso: string): string {
  try {
    const d = new Date(`${iso}T12:00:00`);
    if (Number.isNaN(d.getTime())) return iso;
    return new Intl.DateTimeFormat('es-ES', {
      timeZone: 'Europe/Madrid',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(d);
  } catch {
    return iso;
  }
}

function renderLeadContactBlock(contact: { firstName: string | null; email: string | null }): string {
  const nameLine =
    contact.firstName && contact.firstName.trim()
      ? `- Nombre: **${contact.firstName.trim()}** ✓ (ya en BD, NO lo pidas otra vez)`
      : `- Nombre: **FALTA** — pídeselo al lead ANTES de proponer cita`;
  const emailLine =
    contact.email && contact.email.trim()
      ? `- Email: **${contact.email.trim()}** ✓ (ya en BD, NO lo pidas otra vez)`
      : `- Email: **FALTA** — pídeselo al lead ANTES de proponer cita`;
  return `${nameLine}\n${emailLine}`;
}
