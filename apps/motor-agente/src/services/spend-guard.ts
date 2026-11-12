/**
 * Frenos de gasto (2026-11-12).
 *
 * Por qué existen: entre el 10 y el 12-nov la conversación 15128 de Tania
 * (tenant 7) repitió la misma llamada al modelo unas 5.200 veces, y el 28-oct la
 * 14378 otras 1.095. Ese fallo concreto ya está arreglado y los reintentos tienen
 * tope (`debounce-failure.ts`). Pero un bucle en el que cada llamada SALE BIEN no
 * lo para ningún tope de reintentos: un lead con un contestador automático
 * (bot contra bot), una automatización externa que manda el mismo lead cientos
 * de veces, o un fallo que todavía no conocemos. Estos dos frenos ponen techo al
 * gasto pase lo que pase:
 *
 *   1. Por conversación (`enforceConversationTurnCap`): pasado un número de
 *      turnos del setter en 24 h, se pausa la IA en esa conversación y se avisa.
 *      Se comprueba al principio de cada turno, en `processDebounced`.
 *
 *   2. Por cliente (`checkTenantSpend`): cada 5 min se suma el gasto de la última
 *      hora de cada tenant (`llm_calls`, sin simulaciones). Por encima de un
 *      umbral se avisa; por encima de otro se apaga su IA
 *      (`tenant_configs.ai_enabled=false`, el mismo interruptor del panel).
 *
 * Los avisos son `notification_events` con event_type `error_motor`, que
 * `notify-trainer` manda a los agency admins (Iván), igual que la alerta de IA
 * muda.
 *
 * Umbrales medidos sobre 30 días de Tania sin los dos bucles: la conversación
 * real más larga tuvo 26 turnos en 24 h (p99 22) y su hora más cara costó 1,41 $
 * (p99 0,93 $). Valores por defecto en `config/env.ts`.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@fyzon/db';

type SupabaseTyped = SupabaseClient<Database>;

interface Log {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
}

const consoleLog: Log = {
  info: (obj, msg) => console.log(msg ?? '', obj),
  warn: (obj, msg) => console.warn(msg ?? '', obj),
  error: (obj, msg) => console.error(msg ?? '', obj),
};

export const TURN_CAP_EVENT_KIND = 'conversation_turn_cap';
export const SPEND_SPIKE_EVENT_KIND = 'spend_spike';

const DAY_MS = 24 * 60 * 60 * 1_000;
const HOUR_MS = 60 * 60 * 1_000;

async function insertAdminAlert(
  supabase: SupabaseTyped,
  tenantId: number,
  payload: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.from('notification_events').insert({
    tenant_id: tenantId,
    event_type: 'error_motor',
    status: 'pending',
    payload: payload as Database['public']['Tables']['notification_events']['Insert']['payload'],
  });
  if (error) throw new Error(`notification_events insert: ${error.message}`);
}

// -----------------------------------------------------------------------------
// 1. Freno por conversación
// -----------------------------------------------------------------------------

export interface TurnCapArgs {
  supabase: SupabaseTyped;
  tenantId: number;
  conversationId: number;
  maxTurns: number;
  now?: Date;
  log?: Log;
}

export interface TurnCapResult {
  /** true: no se ejecuta el turno (la conversación queda pausada). */
  capped: boolean;
  /** Turnos (`pipeline_runs`) de esta conversación en las últimas 24 h; null si no se pudo contar. */
  turns: number | null;
}

/**
 * Cuenta los turnos del setter en esta conversación en las últimas 24 h (cada
 * `processDebounced` que llega al pipeline deja una fila en `pipeline_runs`, haya
 * salido bien o mal). Si llega al tope, pausa la IA en la conversación y avisa.
 *
 * Si no se puede contar, deja pasar el turno (fail-open): un fallo de lectura no
 * puede apagar al setter. Si se pudo contar y está por encima, el turno NO se
 * ejecuta aunque falle la pausa o el aviso.
 */
export async function enforceConversationTurnCap(args: TurnCapArgs): Promise<TurnCapResult> {
  const { supabase, tenantId, conversationId, maxTurns } = args;
  const now = args.now ?? new Date();
  const log = args.log ?? consoleLog;

  let turns: number;
  try {
    // tenant_id + started_at van por el índice idx_pipeline_runs_tenant_started.
    const { count, error } = await supabase
      .from('pipeline_runs')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('conversation_id', conversationId)
      .gte('started_at', new Date(now.getTime() - DAY_MS).toISOString());
    if (error) throw new Error(error.message);
    turns = count ?? 0;
  } catch (err) {
    log.warn(
      { conversationId, err: (err as Error).message },
      'spend-guard: no se pudo contar los turnos de la conversación; se sigue sin freno',
    );
    return { capped: false, turns: null };
  }

  if (turns < maxTurns) return { capped: false, turns };

  try {
    const { error } = await supabase
      .from('conversations')
      .update({ ai_paused_until: 'infinity', updated_at: now.toISOString() })
      .eq('id', conversationId)
      .eq('tenant_id', tenantId);
    if (error) throw new Error(error.message);
    await insertAdminAlert(supabase, tenantId, {
      kind: TURN_CAP_EVENT_KIND,
      conversation_id: conversationId,
      turns_24h: turns,
      max_turns_24h: maxTurns,
      what_happened:
        `El setter llevaba ${turns} turnos en 24 h en esta conversación (tope ${maxTurns}). ` +
        'Se ha pausado la IA solo en esta conversación. Mira si es un contestador automático, ' +
        'un bucle o una conversación real muy larga; para reanudarla, quita la pausa desde el panel.',
    });
  } catch (err) {
    log.error(
      { conversationId, turns, err: (err as Error).message },
      'spend-guard: tope de turnos alcanzado pero no se pudo pausar o avisar; el turno no se ejecuta',
    );
  }
  log.warn({ conversationId, tenantId, turns, maxTurns }, 'spend-guard: tope de turnos por conversación');
  return { capped: true, turns };
}

// -----------------------------------------------------------------------------
// 2. Freno por cliente
// -----------------------------------------------------------------------------

export interface TenantSpendCheckDeps {
  supabase: SupabaseTyped;
  alertUsdPerHour: number;
  pauseUsdPerHour: number;
  now?: () => Date;
  log?: Log;
}

export interface TenantSpend {
  tenantId: number;
  spendUsd: number;
}

export interface TenantSpendCheckResult {
  tenantsOverAlert: number;
  alerted: number;
  paused: number;
  skipped: number;
  errors: number;
}

/**
 * Gasto de la última hora por tenant, sin las llamadas sin conversación (el
 * simulador del panel y las baterías: pruebas hechas a propósito).
 */
export async function loadTenantSpendLastHour(
  supabase: SupabaseTyped,
  now: Date,
): Promise<TenantSpend[]> {
  const { data, error } = await supabase
    .from('llm_calls')
    .select('tenant_id, cost')
    .gte('created_at', new Date(now.getTime() - HOUR_MS).toISOString())
    .not('conversation_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(10_000);
  if (error) throw new Error(`llm_calls: ${error.message}`);
  const byTenant = new Map<number, number>();
  for (const row of data ?? []) {
    const tenantId = Number(row.tenant_id);
    const cost = Number(row.cost ?? 0);
    if (!Number.isFinite(cost)) continue;
    byTenant.set(tenantId, (byTenant.get(tenantId) ?? 0) + cost);
  }
  return [...byTenant].map(([tenantId, spendUsd]) => ({ tenantId, spendUsd }));
}

export async function checkTenantSpend(deps: TenantSpendCheckDeps): Promise<TenantSpendCheckResult> {
  const { supabase, alertUsdPerHour, pauseUsdPerHour } = deps;
  const now = (deps.now ?? (() => new Date()))();
  const log = deps.log ?? consoleLog;
  const result: TenantSpendCheckResult = {
    tenantsOverAlert: 0,
    alerted: 0,
    paused: 0,
    skipped: 0,
    errors: 0,
  };

  const spends = (await loadTenantSpendLastHour(supabase, now)).filter(
    (s) => s.spendUsd >= alertUsdPerHour,
  );
  result.tenantsOverAlert = spends.length;

  for (const { tenantId, spendUsd } of spends) {
    try {
      let action: 'alert' | 'paused' = 'alert';
      if (spendUsd >= pauseUsdPerHour) {
        const { data: cfg } = await supabase
          .from('tenant_configs')
          .select('ai_enabled')
          .eq('tenant_id', tenantId)
          .maybeSingle();
        if ((cfg as { ai_enabled?: boolean } | null)?.ai_enabled !== false) {
          const { error } = await supabase
            .from('tenant_configs')
            .update({ ai_enabled: false, updated_at: now.toISOString() })
            .eq('tenant_id', tenantId);
          if (error) throw new Error(`tenant_configs update: ${error.message}`);
          action = 'paused';
          result.paused++;
        }
      }

      // Anti-ruido: un aviso por tenant y hora, salvo que ahora se haya apagado
      // la IA (eso se avisa siempre).
      if (action === 'alert') {
        const { data: recent, error: recentErr } = await supabase
          .from('notification_events')
          .select('created_at, payload')
          .eq('tenant_id', tenantId)
          .eq('event_type', 'error_motor')
          .gte('created_at', new Date(now.getTime() - HOUR_MS).toISOString())
          .order('created_at', { ascending: false })
          .limit(50);
        if (recentErr) throw new Error(recentErr.message);
        const alreadyAlerted = (recent ?? []).some(
          (e) => (e.payload as { kind?: unknown } | null)?.kind === SPEND_SPIKE_EVENT_KIND,
        );
        if (alreadyAlerted) {
          result.skipped++;
          continue;
        }
      }

      await insertAdminAlert(supabase, tenantId, {
        kind: SPEND_SPIKE_EVENT_KIND,
        action,
        spend_last_hour_usd: Math.round(spendUsd * 100) / 100,
        alert_usd_per_hour: alertUsdPerHour,
        pause_usd_per_hour: pauseUsdPerHour,
        what_happened:
          action === 'paused'
            ? `El setter ha gastado ${spendUsd.toFixed(2)} $ en la última hora (tope ${pauseUsdPerHour} $). ` +
              'Se ha APAGADO la IA de este cliente (interruptor global del panel). ' +
              'Mira qué conversaciones han disparado el gasto antes de volver a encenderla.'
            : `El setter ha gastado ${spendUsd.toFixed(2)} $ en la última hora (aviso a partir de ${alertUsdPerHour} $; ` +
              `se apaga a partir de ${pauseUsdPerHour} $). Revisa si hay una conversación en bucle.`,
      });
      result.alerted++;
      log.warn(
        { tenantId, spendUsd, action, alertUsdPerHour, pauseUsdPerHour },
        'spend-guard: gasto por hora por encima del umbral',
      );
    } catch (err) {
      result.errors++;
      log.error({ tenantId, err: (err as Error).message }, 'spend-guard: fallo al revisar el gasto del tenant');
    }
  }

  return result;
}
