'use server';

import { getEffectiveTenant } from '@/lib/effective-tenant';
import { getServiceRoleClient } from '@/lib/supabase/service-role';
import {
  LEAD_FORM_DECISIONS,
  maskPhone,
  type LeadFormDecision,
  type LeadFormEvaluator,
} from '@/lib/lead-form-submissions-query';

/**
 * Lectura de `lead_form_submissions` (migración 077, 2026-09-03) para la
 * página /leads/formularios: qué formularios de Tally (o GHL Workflow) han
 * llegado al endpoint lead-form y qué decidió el filtro de cualificación con
 * cada uno. La tabla la escribe SOLO el motor; aquí solo se lee.
 *
 * Read-only — sin mutaciones, sin revalidatePath. Filtra SIEMPRE por el
 * tenant efectivo (impersonate incluido): el service_role bypassa RLS.
 */

export interface LeadFormSubmissionRow {
  id: number;
  receivedAt: string;
  firstName: string | null;
  /** Solo los 3 últimos dígitos. El teléfono completo no sale de la BD hacia la UI. */
  phoneMasked: string | null;
  /** Respuestas del formulario aplanadas label → valor. */
  answers: Record<string, unknown>;
  decision: LeadFormDecision;
  motivo: string | null;
  evaluadoPor: LeadFormEvaluator;
  leadId: number | null;
  conversationId: number | null;
  welcomeSent: boolean;
  error: string | null;
}

export type LeadFormSubmissionsResult =
  | {
      ok: true;
      data: LeadFormSubmissionRow[];
      /** Totales por decisión del tenant (no solo de la página): para las chips del filtro. */
      counts: Record<LeadFormDecision, number>;
    }
  | { ok: false; error: string };

const DEFAULT_LIMIT = 200;

export async function listLeadFormSubmissions(opts?: {
  decision?: LeadFormDecision | null;
  limit?: number;
}): Promise<LeadFormSubmissionsResult> {
  const eff = await getEffectiveTenant();
  if (!eff) return { ok: false, error: 'unauthenticated' };

  const limit = Math.min(Math.max(opts?.limit ?? DEFAULT_LIMIT, 1), 500);
  const decision = opts?.decision ?? null;

  // TODO regenerar tipos tras aplicar la migración 077 (packages/db/src/types.generated.ts).
  // `getServiceRoleClient()` devuelve un SupabaseClient sin generic `Database`,
  // así que `.from('lead_form_submissions')` compila sin cast.
  const supabase = getServiceRoleClient();

  let listQuery = supabase
    .from('lead_form_submissions')
    .select(
      'id, received_at, phone, first_name, answers, decision, motivo, evaluado_por, lead_id, conversation_id, welcome_sent, error',
    )
    .eq('tenant_id', eff.tenantId)
    .order('received_at', { ascending: false })
    .limit(limit);
  if (decision) listQuery = listQuery.eq('decision', decision);

  const countQueries = LEAD_FORM_DECISIONS.map((d) =>
    supabase
      .from('lead_form_submissions')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', eff.tenantId)
      .eq('decision', d),
  );

  const [listRes, ...countRes] = await Promise.all([listQuery, ...countQueries]);

  if (listRes.error) return { ok: false, error: listRes.error.message };
  for (const c of countRes) {
    if (c.error) return { ok: false, error: c.error.message };
  }

  const counts = { aprobado: 0, rechazado: 0, sin_filtro: 0 } as Record<LeadFormDecision, number>;
  LEAD_FORM_DECISIONS.forEach((d, i) => {
    counts[d] = countRes[i]?.count ?? 0;
  });

  const rows: LeadFormSubmissionRow[] = (listRes.data ?? []).map((r) => ({
    id: Number(r.id),
    receivedAt: String(r.received_at),
    firstName: (r.first_name as string | null) ?? null,
    phoneMasked: maskPhone(r.phone as string | null),
    answers:
      r.answers && typeof r.answers === 'object' && !Array.isArray(r.answers)
        ? (r.answers as Record<string, unknown>)
        : {},
    decision: r.decision as LeadFormDecision,
    motivo: (r.motivo as string | null) ?? null,
    evaluadoPor: r.evaluado_por as LeadFormEvaluator,
    leadId: r.lead_id != null ? Number(r.lead_id) : null,
    conversationId: r.conversation_id != null ? Number(r.conversation_id) : null,
    welcomeSent: r.welcome_sent === true,
    error: (r.error as string | null) ?? null,
  }));

  return { ok: true, data: rows, counts };
}
