import { redirect } from 'next/navigation';
import { NextResponse } from 'next/server';

/**
 * Redirect server-side al endpoint /integrations/oauth/install del motor.
 *
 * El wizard onboarding y el botón "Conectar/Reconectar GHL" del panel
 * apuntan a esta ruta porque desde el cliente NO podemos componer la URL del
 * motor de forma fiable (NEXT_PUBLIC_MOTOR_ORIGIN puede no estar configurado).
 * Esta ruta resuelve la URL desde process.env del servidor y hace 302.
 *
 * Variables consultadas (en orden):
 *   1. NEXT_PUBLIC_MOTOR_ORIGIN  (URL pública del motor para producción)
 *   2. MOTOR_INTERNAL_URL        (server-to-server, default http://localhost:3001)
 *
 * Si ninguna está configurada → 503 con mensaje claro al admin Fyzon.
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
  const target = `${motorOrigin.replace(/\/$/, '')}/integrations/oauth/install`;
  redirect(target);
}
