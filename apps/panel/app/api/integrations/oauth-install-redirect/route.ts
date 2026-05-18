import { redirect } from 'next/navigation';
import { NextResponse } from 'next/server';
import { getEffectiveTenant } from '@/lib/effective-tenant';
import { getServiceRoleClient } from '@/lib/supabase/service-role';

/**
 * Redirect server-side al endpoint /integrations/oauth/install del motor.
 *
 * El motor requiere `?tenant_token=<X>` (un tenant_tokens row con
 * purpose='ghl_webhook' del tenant actual). Si no existe lo creamos sobre la
 * marcha — el token sirve tanto para el flow OAuth como para recibir webhooks
 * GHL después de la instalación.
 *
 * Variables consultadas (en orden para el origen del motor):
 *   1. NEXT_PUBLIC_MOTOR_ORIGIN  (URL pública del motor para producción)
 *   2. MOTOR_INTERNAL_URL        (server-to-server, default http://localhost:3001)
 *
 * Si ninguna está configurada → 503 con mensaje claro al admin Fyzon.
 *
 * Errores devueltos en JSON (no redirect) para que el wizard pueda mostrarlos:
 *   - 401 unauthenticated: sin sesión.
 *   - 403 forbidden: role=viewer.
 *   - 500 token_failed: error generando/leyendo tenant_tokens.
 *   - 503 motor_origin_not_configured: env var ausente en panel.
 */
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const motorOrigin =
    process.env.NEXT_PUBLIC_MOTOR_ORIGIN ?? process.env.MOTOR_INTERNAL_URL ?? '';
  if (!motorOrigin) {
    return NextResponse.json(
      {
        error: 'motor_origin_not_configured',
        message:
          'Configura NEXT_PUBLIC_MOTOR_ORIGIN o MOTOR_INTERNAL_URL en .env.local del panel.',
      },
      { status: 503 },
    );
  }

  const effective = await getEffectiveTenant();
  if (!effective) {
    return NextResponse.json(
      { error: 'unauthenticated', message: 'Inicia sesión antes de instalar GHL.' },
      { status: 401 },
    );
  }
  if (effective.role === 'viewer' && !effective.isAgencyAdmin) {
    return NextResponse.json(
      {
        error: 'forbidden',
        message: 'Solo el owner / admin del tenant puede instalar integraciones.',
      },
      { status: 403 },
    );
  }

  const supabase = getServiceRoleClient();

  // Buscar tenant_token activo con purpose='ghl_webhook' del tenant efectivo.
  // El motor lo resuelve via `resolveTenantByToken(token, 'ghl_webhook')` para
  // identificar al tenant antes de iniciar el OAuth chooselocation.
  const { data: existing } = await supabase
    .from('tenant_tokens')
    .select('token')
    .eq('tenant_id', effective.tenantId)
    .eq('purpose', 'ghl_webhook')
    .eq('is_active', true)
    .is('revoked_at', null)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();

  let tenantToken: string | null =
    existing?.token != null ? String(existing.token) : null;

  if (!tenantToken) {
    // Crear nuevo. token se autogenera por default (gen_random_bytes 24 hex).
    const { data: inserted, error } = await supabase
      .from('tenant_tokens')
      .insert({
        tenant_id: effective.tenantId,
        purpose: 'ghl_webhook',
        is_active: true,
      })
      .select('token')
      .single();
    if (error || !inserted) {
      return NextResponse.json(
        {
          error: 'token_failed',
          message:
            error?.message ??
            'No se pudo crear el tenant_token para iniciar la instalación.',
        },
        { status: 500 },
      );
    }
    tenantToken = String(inserted.token);
  }

  const base = motorOrigin.replace(/\/$/, '');
  const target = `${base}/integrations/oauth/install?tenant_token=${encodeURIComponent(
    tenantToken,
  )}`;
  redirect(target);
}
