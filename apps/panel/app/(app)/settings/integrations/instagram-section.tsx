import Link from 'next/link';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { getGhlInboundMode } from '@/lib/actions/ghl-inbound-mode';
import { getEffectiveTenant } from '@/lib/effective-tenant';
import { getServiceRoleClient } from '@/lib/supabase/service-role';
import { GhlModeForm } from './ghl-mode-form';

/**
 * Sección "Instagram y Facebook" dentro de `/settings/integrations`.
 *
 * Existe porque `ghl_inbound_mode` decide a quién contesta el asistente en el
 * canal donde el entrenador recibe mensajes de gente real todos los días — y
 * hasta ahora solo se podía cambiar por SQL. Las server actions llevaban desde
 * mayo escritas y sin una sola pantalla que las usara.
 *
 * Se coloca junto a la de WhatsApp a propósito: las dos responden la misma
 * pregunta ("¿a quién contesta mi asistente?") y separarlas obligaba a
 * aprenderse dos sitios distintos.
 */
export async function InstagramSection() {
  const effective = await getEffectiveTenant();
  if (!effective) {
    return <p className="text-sm text-destructive">No autenticado.</p>;
  }

  const modeResult = await getGhlInboundMode();

  // Las palabras que de verdad abren la puerta en este canal son las de tipo
  // 'inbound'; las de 'bienvenida' y 'lm' clasifican mensajes que salen del
  // propio entrenador o de sus campañas, no de quien le escribe.
  const supabase = getServiceRoleClient();
  const { count } = await supabase
    .from('automation_keywords')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', effective.tenantId)
    .eq('type', 'inbound')
    .eq('is_active', true);
  const inboundKeywordCount = count ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">A quién contesta en Instagram</CardTitle>
        <CardDescription>
          Decide qué mensajes directos de Instagram y Facebook activan a tu asistente.
          Las palabras concretas las eliges en{' '}
          <Link href="/keywords" className="underline">
            Palabras clave
          </Link>
          .{' '}
          <span className="text-muted-foreground/70">
            Tu WhatsApp se configura aparte, en la pestaña de al lado.
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!modeResult.ok ? (
          <p className="text-sm text-destructive">Error: {modeResult.error}</p>
        ) : (
          <GhlModeForm
            currentMode={modeResult.data!.mode}
            inboundKeywordCount={inboundKeywordCount}
          />
        )}
      </CardContent>
    </Card>
  );
}
