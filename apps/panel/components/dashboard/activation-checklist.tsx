import Link from 'next/link';
import { CheckCircle2, Circle, Rocket } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { TenantHealth } from '@/lib/tenant-health';
import { cn } from '@/lib/utils';

/**
 * Tarjeta mostrada en /dashboard cuando `tenants.onboarded_at IS NULL`.
 * Lista los 4 pasos del wizard (GHL / keywords / YCloud / welcome+token) con
 * progreso visual + CTA al wizard. Sustituye los KPI widgets (en cero) durante
 * el onboarding híbrido.
 */
export function ActivationChecklist({ health }: { health: TenantHealth }) {
  const steps = [
    {
      label: 'Conectar GoHighLevel',
      done: health.ghlConnected,
      hint: 'OAuth Marketplace — captación IG / FB.',
    },
    {
      label: 'Configurar palabras clave',
      done: health.hasKeywordsBienvenida && health.hasKeywordsLeadmagnet,
      hint: 'Bienvenida + lead magnet (mínimo).',
    },
    {
      label: 'Conectar YCloud + plantillas',
      done: health.ycloudConnected && health.approvedWaTemplates > 0,
      hint: 'API key + sincronizar plantillas WhatsApp aprobadas.',
    },
    {
      label: 'Designar plantilla bienvenida',
      done: health.welcomeTemplateId != null && health.tokenLeadForm != null,
      hint: 'Elige cuál se envía a leads nuevos + URL del webhook.',
    },
  ];
  const completedCount = steps.filter((s) => s.done).length;
  const allDone = completedCount === steps.length;

  return (
    <Card className="border-success/30 bg-success/5">
      <CardContent className="p-5 flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <Rocket className="size-6 text-success shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-lg font-semibold tracking-tight">
              Tu setter IA está listo, falta encender los canales
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              Completa estos pasos para empezar a recibir leads. El primero te
              llevará al asistente guiado del onboarding.
            </p>
          </div>
          <div className="text-right shrink-0 hidden sm:block">
            <p className="text-3xl font-semibold tabular-nums text-success">
              {completedCount}<span className="text-muted-foreground text-base">/4</span>
            </p>
            <p className="text-xs text-muted-foreground">pasos completados</p>
          </div>
        </div>

        <ol className="flex flex-col gap-2">
          {steps.map((step, idx) => (
            <li
              key={step.label}
              className={cn(
                'flex items-start gap-3 p-2.5 rounded-md border',
                step.done
                  ? 'border-success/20 bg-success/5'
                  : 'border-border bg-card',
              )}
            >
              {step.done ? (
                <CheckCircle2 className="size-4 text-success shrink-0 mt-0.5" />
              ) : (
                <Circle className="size-4 text-muted-foreground shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">
                  <span className="text-muted-foreground tabular-nums mr-1.5">
                    {idx + 1}.
                  </span>
                  {step.label}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{step.hint}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <p className="text-xs text-muted-foreground">
            {allDone
              ? 'Listo. Pulsa &quot;Marcar setup completo&quot; dentro del asistente para activar tu panel.'
              : 'No vas a recibir leads hasta completar los 4 pasos. Tarda 10-15 min si tienes las credenciales a mano.'}
          </p>
          <Button asChild className="gap-1.5">
            <Link href="/onboarding/integrations">
              {allDone ? 'Marcar setup completo' : 'Continuar configuración'}
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
