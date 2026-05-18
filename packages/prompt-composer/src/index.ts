import type { SupabaseClient } from '@supabase/supabase-js';
import { buildComposedPrompt } from './builder.js';
import type { ComposeOptions, ComposedPrompt, PromptBlockRow, TrainerContext } from './types.js';

export type {
  ComposeOptions,
  ComposedBlock,
  ComposedPrompt,
  PromptBlockRow,
  SystemContentBlock,
  TrainerContext,
  HandoffContext,
} from './types.js';
export { buildComposedPrompt } from './builder.js';
export { interpolateTrainerPlaceholders, renderHandoffDirective } from './interpolate.js';

/**
 * Carga los bloques relevantes desde `prompt_blocks` y compone el system prompt.
 *
 * Query: UN solo SELECT que trae:
 *   - Todos los bloques compartidos (tenant_id IS NULL) activos version=1.
 *   - Todos los bloques del tenant solicitado activos version=1.
 *
 * El `buildComposedPrompt` filtra y ordena los que realmente se incluyen
 * segun `ComposeOptions`.
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

  // Sprint Gamma 2.6 + 2.6b — Si el caller no pasó trainerContext explícito, lo cargamos
  // de trainer_preferences para interpolar `{{trainer_phone|fallback}}` y
  // `{{handoff_directive}}` en handoff_v4. Best-effort: si la query falla o no hay
  // row, ctx queda vacío y los placeholders caen al fallback legacy.
  let trainerContext = options.trainerContext;
  if (trainerContext === undefined) {
    const { data: prefsRow } = await supabase
      .from('trainer_preferences')
      .select('preferences')
      .eq('tenant_id', options.tenantId)
      .maybeSingle();
    const prefs = (prefsRow?.preferences ?? {}) as Record<string, unknown>;
    const phoneRaw = typeof prefs.trainerPhone === 'string' ? prefs.trainerPhone.trim() : '';
    const phone = phoneRaw === '' ? null : phoneRaw;

    // Sprint 2.6b — extraer config handoff (4 fields)
    const handoffEnabled = prefs.handoffPersonalizationEnabled === true;
    const handoffMode = (typeof prefs.handoffMode === 'string' &&
      ['share_phone', 'silent', 'custom_message'].includes(prefs.handoffMode))
      ? (prefs.handoffMode as 'share_phone' | 'silent' | 'custom_message')
      : 'share_phone';
    const handoffTemplate = (typeof prefs.handoffCustomTemplate === 'string' &&
      ['warm', 'professional', 'free'].includes(prefs.handoffCustomTemplate))
      ? (prefs.handoffCustomTemplate as 'warm' | 'professional' | 'free')
      : 'warm';
    const handoffCustomMessage = typeof prefs.handoffCustomMessage === 'string'
      ? prefs.handoffCustomMessage
      : null;

    // Hito 10 — Fallback al closingResourceUrl legacy del trainer_preferences si
    // el caller no pasó un trackedCalendarUrl construido con calendar_accounts.
    // Cuando el caller (motor pipeline) sí lo pasa explícitamente (con lead context),
    // éste prevalece via el spread `{ ...options, trainerContext }` final.
    const legacyCalendarUrl = typeof prefs.closingResourceUrl === 'string'
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
  // Composer NO formatea: recibe el bloque markdown ya renderizado por el caller
  // (renderSlotsBlock en apps/motor-agente/src/services/load-available-slots.ts).
  if (options.availableSlots !== undefined && options.availableSlots !== null && options.availableSlots.length > 0) {
    const block = options.availableSlots
      .map((s) => `- ${s.humanLabel}  (${s.iso})`)
      .join('\n');
    trainerContext = {
      ...trainerContext,
      availableSlotsBlock: block,
    };
  }

  // Hito 10.6.1 — Fecha actual: el composer renderiza la etiqueta humana es-ES
  // a partir del ISO YYYY-MM-DD. Sin esto, el LLM no sabe la fecha real y dice
  // "mañana" cuando los slots son de dentro de varios días.
  if (options.currentDateIso) {
    trainerContext = {
      ...trainerContext,
      currentDateLabel: renderCurrentDateLabel(options.currentDateIso),
    };
  }

  // Hito 10.6.1 — Estado de contacto del lead (nombre + email). El LLM ve si
  // tiene los datos o si debe pedirlos antes de proponer slots.
  if (options.leadContact) {
    trainerContext = {
      ...trainerContext,
      leadContactStatusBlock: renderLeadContactBlock(options.leadContact),
    };
  }

  // Hito 11 — Etiquetas humanas de timezone (lead + trainer). El setter las
  // inyecta en fase_6_v4 para mencionar siempre la zona al proponer horas
  // cuando lead y trainer estén en husos distintos.
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

  return buildComposedPrompt(rows, { ...options, trainerContext });
}

function renderCurrentDateLabel(iso: string): string {
  try {
    // ISO YYYY-MM-DD se interpreta como UTC midnight; usamos timezone Europe/Madrid
    // para evitar off-by-one en zonas con DST.
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
  const nameLine = contact.firstName && contact.firstName.trim()
    ? `- Nombre: **${contact.firstName.trim()}** ✓ (ya en BD, NO lo pidas otra vez)`
    : `- Nombre: **FALTA** — pídeselo al lead ANTES de proponer cita`;
  const emailLine = contact.email && contact.email.trim()
    ? `- Email: **${contact.email.trim()}** ✓ (ya en BD, NO lo pidas otra vez)`
    : `- Email: **FALTA** — pídeselo al lead ANTES de proponer cita`;
  return `${nameLine}\n${emailLine}`;
}
