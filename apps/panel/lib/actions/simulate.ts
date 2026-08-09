'use server';

/**
 * Simulador de conversación: el panel delega en el motor.
 *
 * El pipeline vive en el motor y ahí se queda. Duplicarlo aquí sería tener dos
 * setters que se van separando con el tiempo, y entonces el simulador dejaría de
 * decir la verdad, que es su único trabajo.
 */

import { getEffectiveTenant } from '@/lib/effective-tenant';

export interface SimulateTurnInput {
  origin: 'bienvenida' | 'lm' | 'inbound' | null;
  channel: 'instagram_dm' | 'whatsapp';
  phase: number;
  message: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  formAnswers?: Record<string, string> | null;
}

/** Estado del enlace de agenda que se le dio al setter en el turno. */
export interface SimulateCalendar {
  url: string | null;
  reason: 'ok' | 'no_calendar' | 'calendar_sin_widget_url' | 'widget_url_invalida';
  name: string | null;
}

export interface SimulateOk {
  ok: true;
  parts: string[];
  decision: { phase: number; status: string; handoff_cause: string | null };
  reasoning: Record<string, string | null>;
  injectedDirective: string | null;
  calendar: SimulateCalendar | null;
  costUsd: number | null;
  latencyMs: number;
}

export type SimulateResult =
  | SimulateOk
  | { ok: false; error: string; rejected?: boolean };

export async function simulateTurn(input: SimulateTurnInput): Promise<SimulateResult> {
  const effective = await getEffectiveTenant();
  if (!effective) return { ok: false, error: 'unauthenticated' };

  const motorUrl = process.env.MOTOR_INTERNAL_URL || process.env.NEXT_PUBLIC_MOTOR_URL;
  const token = process.env.INTERNAL_STATS_TOKEN;
  if (!motorUrl) {
    return { ok: false, error: 'Falta configurar MOTOR_INTERNAL_URL en el panel.' };
  }
  if (!token) {
    return { ok: false, error: 'Falta configurar INTERNAL_STATS_TOKEN en el panel.' };
  }

  let response: Response;
  try {
    response = await fetch(`${motorUrl.replace(/\/$/, '')}/internal/simulate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        tenant_id: effective.tenantId,
        origin: input.origin,
        channel: input.channel,
        phase: input.phase,
        message: input.message,
        history: input.history,
        form_answers: input.formAnswers ?? null,
      }),
      // Tres llamadas al modelo encadenadas: puede tardar.
      signal: AbortSignal.timeout(90_000),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `No se ha podido contactar con el motor: ${msg}` };
  }

  const json = (await response.json().catch(() => null)) as Record<string, unknown> | null;

  if (!response.ok) {
    return {
      ok: false,
      error:
        typeof json?.message === 'string'
          ? json.message
          : `El motor respondió ${response.status}`,
    };
  }

  // El pipeline puede rechazar un turno (el Judge lo tumba dos veces, o el
  // validador ve algo crítico). Para el entrenador eso NO es un error del
  // simulador: es información sobre su propio bloque.
  if (json?.ok === false) {
    return {
      ok: false,
      rejected: true,
      error:
        typeof json.reason === 'string'
          ? json.reason
          : 'El sistema no ha dejado salir esa respuesta.',
    };
  }

  return {
    ok: true,
    parts: Array.isArray(json?.parts) ? (json.parts as string[]) : [],
    decision: (json?.decision ?? {
      phase: input.phase,
      status: 'active',
      handoff_cause: null,
    }) as SimulateOk['decision'],
    reasoning: (json?.reasoning ?? {}) as Record<string, string | null>,
    injectedDirective:
      typeof json?.injected_directive === 'string' ? json.injected_directive : null,
    calendar: (json?.calendar as SimulateCalendar | undefined) ?? null,
    costUsd: typeof json?.cost_usd === 'number' ? json.cost_usd : null,
    latencyMs: typeof json?.latency_ms === 'number' ? json.latency_ms : 0,
  };
}
