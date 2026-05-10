'use server';

import { revalidatePath } from 'next/cache';
import { getEffectiveTenant } from '@/lib/effective-tenant';
import { getServiceRoleClient } from '@/lib/supabase/service-role';

/**
 * Hito 9 sub-fase 4 — Server action para enviar plantilla bienvenida WA
 * desde la ficha de contacto del panel.
 *
 * Flujo:
 *   1. Auth via getEffectiveTenant + verifica que el lead pertenece al tenant.
 *   2. POST al motor /internal/welcome con bearer INTERNAL_STATS_TOKEN.
 *   3. Devuelve resultado tipado para que la UI haga toast + router.refresh.
 *
 * NOTA: el panel NO duplica la lógica de YCloud — delega al motor que ya tiene
 * service_role + decode credentials + sendWelcomeTemplate. Esto evita reescribir
 * el envío en TypeScript del lado panel.
 */

export type WelcomeActionResult =
  | { ok: true; providerMessageId: string; conversationId: number }
  | { ok: false; error: string; code?: string };

export async function sendWelcomeFromPanel(
  leadId: number,
): Promise<WelcomeActionResult> {
  if (!Number.isFinite(leadId) || leadId <= 0) {
    return { ok: false, error: 'invalid leadId' };
  }

  const effective = await getEffectiveTenant();
  if (!effective) return { ok: false, error: 'unauthenticated' };

  const supabase = getServiceRoleClient();
  const { data: lead } = await supabase
    .from('leads')
    .select('id, tenant_id')
    .eq('id', leadId)
    .maybeSingle();
  if (!lead) return { ok: false, error: 'lead no encontrado' };
  const leadTenantId = Number(lead.tenant_id);
  if (leadTenantId !== effective.tenantId && !effective.isAgencyAdmin) {
    return { ok: false, error: 'forbidden — wrong tenant' };
  }
  if (effective.role === 'viewer' && !effective.isAgencyAdmin) {
    return { ok: false, error: 'forbidden — viewer no puede enviar bienvenidas' };
  }

  const motorUrl = process.env.MOTOR_INTERNAL_URL ?? 'http://localhost:3001';
  const token = process.env.INTERNAL_STATS_TOKEN;
  if (!token) {
    return {
      ok: false,
      error:
        'INTERNAL_STATS_TOKEN no configurado en el panel. Pídelo al admin Fyzon y añádelo al .env.local del panel.',
    };
  }

  let response: Response;
  try {
    response = await fetch(`${motorUrl.replace(/\/$/, '')}/internal/welcome`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tenant_id: leadTenantId, lead_id: leadId }),
    });
  } catch (err) {
    return {
      ok: false,
      error: `Motor no responde (${motorUrl}): ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    const obj = (parsed ?? {}) as { error?: string; message?: string };
    return {
      ok: false,
      error: obj.message ?? obj.error ?? `motor devolvió HTTP ${response.status}`,
      code: obj.error,
    };
  }

  const obj = (parsed ?? {}) as {
    provider_message_id?: string;
    conversation_id?: number;
  };

  // Refresh caché del panel para que la UI vea el nuevo mensaje en la conversación.
  revalidatePath('/contacts');
  revalidatePath(`/contacts/${leadId}`);
  revalidatePath('/conversations');

  return {
    ok: true,
    providerMessageId: obj.provider_message_id ?? 'unknown',
    conversationId: obj.conversation_id ?? 0,
  };
}
