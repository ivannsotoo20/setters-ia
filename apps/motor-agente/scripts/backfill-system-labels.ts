/**
 * Sprint Eta.6 — Backfill one-shot.
 *
 * Recorre TODAS las conversaciones de la BD y aplica las system labels
 * apropiadas según el estado actual:
 *   - is_handoff_to_human=true → Hot Lead.
 *   - phase_number=6           → Completado.
 *   - ghl_opportunity_status='won' → Comprado.
 *   - Resto (no handoff, no F6, no won) → Activo.
 *
 * Idempotente (applyLabelMotor usa UPSERT con check previo). Se puede correr
 * varias veces sin efectos secundarios.
 *
 * Uso:
 *   pnpm --filter @fyzon/motor-agente exec tsx scripts/backfill-system-labels.ts
 *
 * Output: resumen por tenant + conversaciones procesadas + labels aplicadas.
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { applyLabelMotor } from '../src/services/labels/index.js';

interface BackfillSummary {
  tenant_id: number;
  total_conversations: number;
  hot_lead: number;
  completado: number;
  comprado: number;
  activo: number;
  errors: string[];
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error('Missing SUPABASE env vars');
    process.exit(1);
  }
  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log('[backfill] cargando system labels por tenant...');
  const { data: systemLabels, error: lblErr } = await supabase
    .from('tenant_labels')
    .select('id, tenant_id, name')
    .eq('is_system', true);
  if (lblErr || !systemLabels) {
    console.error('Error loading system labels:', lblErr?.message);
    process.exit(1);
  }

  const labelMap = new Map<string, number>(); // key = `${tenant_id}:${name}`
  for (const l of systemLabels) {
    labelMap.set(`${l.tenant_id}:${l.name}`, Number(l.id));
  }

  console.log('[backfill] cargando conversations...');
  const { data: convs, error: convErr } = await supabase
    .from('conversations')
    .select(
      'id, tenant_id, phase_number, state, is_qualified, is_handoff_to_human, ghl_opportunity_status',
    )
    .order('id', { ascending: true });
  if (convErr || !convs) {
    console.error('Error loading conversations:', convErr?.message);
    process.exit(1);
  }
  console.log(`[backfill] ${convs.length} conversations a procesar`);

  const summaries = new Map<number, BackfillSummary>();
  const getSummary = (tenantId: number) => {
    let s = summaries.get(tenantId);
    if (!s) {
      s = {
        tenant_id: tenantId,
        total_conversations: 0,
        hot_lead: 0,
        completado: 0,
        comprado: 0,
        activo: 0,
        errors: [],
      };
      summaries.set(tenantId, s);
    }
    return s;
  };

  for (const conv of convs) {
    const tenantId = Number(conv.tenant_id);
    const conversationId = Number(conv.id);
    const summary = getSummary(tenantId);
    summary.total_conversations++;

    const labelsToApply: Array<'Hot Lead' | 'Completado' | 'Comprado' | 'Activo'> = [];
    if (conv.is_handoff_to_human === true) labelsToApply.push('Hot Lead');
    if (Number(conv.phase_number) === 6) labelsToApply.push('Completado');
    if (
      typeof conv.ghl_opportunity_status === 'string' &&
      conv.ghl_opportunity_status === 'won'
    ) {
      labelsToApply.push('Comprado');
    }
    // Si no hay ninguna label específica, aplicamos Activo como default.
    if (labelsToApply.length === 0) labelsToApply.push('Activo');

    for (const name of labelsToApply) {
      const labelId = labelMap.get(`${tenantId}:${name}`);
      if (!labelId) {
        summary.errors.push(`tenant ${tenantId} sin system label "${name}"`);
        continue;
      }
      try {
        const res = await applyLabelMotor({
          supabase,
          tenantId,
          conversationId,
          labelId,
          via: 'system_hook',
        });
        if (res.applied) {
          if (name === 'Hot Lead') summary.hot_lead++;
          else if (name === 'Completado') summary.completado++;
          else if (name === 'Comprado') summary.comprado++;
          else summary.activo++;
        }
      } catch (err) {
        summary.errors.push(
          `conv ${conversationId} label ${name}: ${(err as Error).message}`,
        );
      }
    }
  }

  console.log('\n[backfill] Summary por tenant:');
  for (const s of summaries.values()) {
    console.log(
      `  tenant=${s.tenant_id}: ${s.total_conversations} convs · Hot=${s.hot_lead} Done=${s.completado} Bought=${s.comprado} Activo=${s.activo} · errors=${s.errors.length}`,
    );
    if (s.errors.length > 0 && s.errors.length <= 5) {
      for (const e of s.errors) console.log(`    err: ${e}`);
    } else if (s.errors.length > 5) {
      console.log(`    (primeros 5 errores)`);
      for (const e of s.errors.slice(0, 5)) console.log(`    err: ${e}`);
    }
  }
  console.log('\n[backfill] done');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
