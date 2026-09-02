import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Cualificación de leads de formulario ANTES de enviar la bienvenida (2026-08-25).
 *
 * Puerto fiel del workflow n8n "Formulario Tally" de Tania, que se apaga con la
 * migración. La secuencia que replica, en el mismo orden y con los mismos cortes:
 *
 *   1. REGLA DURA — dolor reciente: si alguna respuesta es literalmente uno de
 *      los valores de rechazo ("Menos de 3 meses") → rechazado sin gastar IA.
 *   2. REGLA DURA — país garantizado: si el país declarado es de zona Tier A
 *      (Europa/EEE/UK + USA/Canadá/Australia/Nueva Zelanda) → aprobado sin IA.
 *      OJO: esto es deliberadamente MÁS permisivo que el evaluador IA — en el
 *      n8n original un lead europeo se aprobaba siempre, sin filtro económico.
 *      Se conserva igual para no cambiar el negocio al cambiar la herramienta.
 *   2b. REGLA DURA — país de no contacto (2026-09-02): si el país declarado
 *      casa con `config.country_reject_terms` → rechazado sin IA. Tania: "los
 *      países que menciono se rechazan sin importar que pasen el filtro
 *      económico". Va DESPUÉS del Tier A: quien escribe "vivo en Madrid, soy
 *      colombiana" reside en España y cualifica. La lista vive en la config
 *      del tenant; el evaluador IA sigue detrás para las ciudades que no
 *      están en ella.
 *   3. TODO LO DEMÁS → evaluador IA con los criterios del entrenador
 *      (config.ai_criteria): inferencia de país con prefijo telefónico y
 *      ciudades trampa, gate de cronicidad, filtro de ocupación/capacidad.
 *
 * Fallo del evaluador (red, clave, formato): FAIL-OPEN — se aprueba con aviso.
 * El n8n original moría en silencio y el lead se perdía sin bienvenida ni
 * registro; perder un lead bueno cuesta más que mandarle la plantilla a uno
 * dudoso, y el incidente queda en el log para revisarlo.
 *
 * La llamada IA se registra en `llm_calls` con role='qualifier' — va contra la
 * clave Anthropic del tenant y su coste tiene que ser visible.
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
  /** System prompt del evaluador IA. Sin él, el paso 3 aprueba con aviso. */
  ai_criteria?: string;
}

export interface QualifyInput {
  supabase: SupabaseClient;
  anthropic: Anthropic;
  tenantId: number;
  /** Respuestas del formulario aplanadas: label → valor. */
  answers: Record<string, unknown>;
  /** Teléfono E.164 — el evaluador usa el prefijo para desambiguar país. */
  phone: string;
}

export interface QualifyResult {
  decision: 'aprobado' | 'rechazado' | 'sin_filtro';
  motivo: string | null;
  /** Quién decidió: reglas deterministas, el evaluador IA, o nadie. */
  evaluadoPor: 'reglas' | 'ia' | 'ninguno';
}

/** Países de contacto garantizado (normalizados: lowercase, sin acentos). */
const TIER_A = new Set([
  'espana', 'francia', 'italia', 'alemania', 'portugal', 'reino unido', 'uk',
  'united kingdom', 'irlanda', 'paises bajos', 'holanda', 'belgica', 'suiza',
  'austria', 'suecia', 'noruega', 'dinamarca', 'finlandia', 'polonia', 'grecia',
  'hungria', 'republica checa', 'rumania', 'bulgaria', 'croacia', 'eslovenia',
  'eslovaquia', 'estonia', 'letonia', 'lituania', 'luxemburgo', 'malta', 'chipre',
  'islandia',
  'estados unidos', 'usa', 'united states', 'ee.uu', 'ee uu',
  'canada', 'australia', 'nueva zelanda', 'new zealand',
]);

const norm = (s: unknown): string =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();

const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Primer término (normalizado) que aparece como PALABRA COMPLETA en el texto
 * normalizado, o null. Palabra completa para que "Mosquito Bay" no sea Quito
 * ni "California" sea Cali.
 */
function matchesTerm(textNorm: string, terms: string[]): string | null {
  for (const raw of terms) {
    const t = norm(raw);
    if (!t) continue;
    const re = new RegExp(`(^|[^a-z0-9])${escapeRegex(t)}(?![a-z0-9])`);
    if (re.test(textNorm)) return t;
  }
  return null;
}

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
  const config = await loadQualificationConfig(input.supabase, input.tenantId);
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

  // 2. País Tier A declarado → aprobado determinista.
  const labelRegex = safeRegex(config.country_label_regex ?? 'vives|pais');
  const countryEntry = Object.entries(input.answers).find(([label]) => labelRegex.test(label));
  if (countryEntry) {
    const paisNorm = norm(countryEntry[1]);
    if (paisNorm && [...TIER_A].some((p) => paisNorm.includes(p))) {
      return {
        decision: 'aprobado',
        motivo: 'País en zona de contacto garantizado (Europa / USA / Canadá / AU / NZ).',
        evaluadoPor: 'reglas',
      };
    }
    // 2b. País de no contacto declarado → rechazado determinista.
    const hitCountry = paisNorm ? matchesTerm(paisNorm, config.country_reject_terms ?? []) : null;
    if (hitCountry) {
      return {
        decision: 'rechazado',
        motivo: `País de residencia en la lista de no contacto de la entrenadora ("${String(countryEntry[1]).slice(0, 60)}").`,
        evaluadoPor: 'reglas',
      };
    }
  }

  // 3. Evaluador IA.
  if (!config.ai_criteria || config.ai_criteria.trim().length === 0) {
    return {
      decision: 'aprobado',
      motivo: 'Sin criterios IA configurados — se aprueba con aviso.',
      evaluadoPor: 'ninguno',
    };
  }
  return runAiEvaluator(input, config.ai_criteria);
}

function safeRegex(pattern: string): RegExp {
  try {
    return new RegExp(pattern, 'i');
  } catch {
    return /vives|pais/i;
  }
}

const QUALIFIER_MODEL = 'claude-sonnet-5';

const QUALIFIER_TOOL = {
  name: 'qualify_lead',
  description:
    'Devuelve la decisión de cualificación del lead según los criterios del sistema.',
  input_schema: {
    type: 'object' as const,
    required: ['decision', 'razonamiento'],
    properties: {
      decision: { type: 'string', enum: ['aprobado', 'rechazado'] },
      razonamiento: {
        type: 'string',
        description:
          '1-3 frases en español. Si rechaza, el eje decisivo; si aprueba, los tres ejes confirmados.',
        maxLength: 600,
      },
      pais_detectado: { type: 'string', maxLength: 60 },
      categoria_ocupacion: {
        type: 'string',
        enum: ['cualificada', 'basica', 'sin_trabajo', 'ambigua'],
      },
    },
  },
};

async function runAiEvaluator(
  input: QualifyInput,
  criteria: string,
): Promise<QualifyResult> {
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
    const decision = toolUse?.input?.decision;
    const razonamiento =
      typeof toolUse?.input?.razonamiento === 'string' ? toolUse.input.razonamiento : null;

    await logQualifierCall(input, {
      status: 'success',
      latencyMs: Date.now() - startedAt,
      usage: response.usage,
      decision: typeof decision === 'string' ? decision : 'invalid',
    });

    if (decision === 'aprobado' || decision === 'rechazado') {
      return { decision, motivo: razonamiento, evaluadoPor: 'ia' };
    }
    // Tool devuelta sin decisión válida — mismo trato que un error: fail-open.
    return {
      decision: 'aprobado',
      motivo: 'Evaluador IA devolvió una decisión no reconocida — se aprueba con aviso.',
      evaluadoPor: 'ninguno',
    };
  } catch (err) {
    await logQualifierCall(input, {
      status: 'error',
      latencyMs: Date.now() - startedAt,
      errorMessage: err instanceof Error ? err.message : String(err),
    }).catch(() => undefined);
    return {
      decision: 'aprobado',
      motivo: `Evaluador IA no disponible (${err instanceof Error ? err.message.slice(0, 80) : 'error'}) — se aprueba con aviso.`,
      evaluadoPor: 'ninguno',
    };
  }
}

interface LogParams {
  status: 'success' | 'error';
  latencyMs: number;
  usage?: { input_tokens?: number; output_tokens?: number };
  decision?: string;
  errorMessage?: string;
}

/**
 * Registro best-effort en llm_calls (role='qualifier'). El coste exacto lo
 * calcula el panel a partir de tokens; aquí basta con dejarlos anotados —
 * esta llamada no usa caché, así que input/output tokens lo cuentan todo.
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
      response_payload: p.decision ? { decision: p.decision } : null,
    });
  } catch {
    // El log nunca tumba la cualificación.
  }
}
