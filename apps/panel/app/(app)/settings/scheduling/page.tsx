import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { loadSchedulingConfig } from '@/lib/actions/scheduling';
import { SchedulingModeCard } from './_components/scheduling-mode-card';
import { TrainerTimezoneCard } from './_components/trainer-timezone-card';

export const dynamic = 'force-dynamic';

/**
 * Hito 11 — /settings/scheduling
 *
 * 3 cards:
 *  1. Modo de agendado (toggle direct/link + aviso de riesgo si link).
 *  2. Zona horaria del entrenador (Select IANA).
 *  3. Zona horaria del lead (info, no editable — la IA infiere por prefijo phone).
 */
export default async function SchedulingSettingsPage() {
  const result = await loadSchedulingConfig();
  const config = result.ok && result.data ? result.data : { schedulingMode: null, trainerTimezone: null };

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div>
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          Configuración
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Modo de agendado</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Decide cómo agenda la IA con tus leads y configura la zona horaria que
          GHL usa para tu disponibilidad.
        </p>
      </div>

      {!result.ok ? (
        <Card className="border-destructive/40">
          <CardContent className="text-sm text-destructive p-4">
            Error cargando configuración: {result.error}
          </CardContent>
        </Card>
      ) : null}

      <SchedulingModeCard initialMode={config.schedulingMode} />
      <TrainerTimezoneCard initialTimezone={config.trainerTimezone} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Zona horaria del lead</CardTitle>
          <CardDescription>
            La IA detecta automáticamente la zona del lead — tú no tienes que
            configurar nada.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            La IA infiere la zona horaria del lead a partir de su{' '}
            <strong className="text-foreground">prefijo telefónico</strong>{' '}
            (+34 → España, +54 → Argentina, +52 → México, +57 → Colombia, +51 →
            Perú, +56 → Chile, etc.) y siempre menciona la zona al proponer
            horas.
          </p>
          <p>
            Ejemplo: si un argentino te contacta y eliges &quot;la IA agenda
            directamente&quot;, el setter dirá{' '}
            <em>&quot;el martes 19 a las 13h hora Argentina&quot;</em> en lugar
            de <em>&quot;a las 13h&quot;</em> a secas.
          </p>
          <p>
            Si el prefijo no es reconocible (números cortos, prefijos exóticos),
            la IA usa tu propia zona horaria como fallback.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
