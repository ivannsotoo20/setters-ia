import Link from 'next/link';
import { Rocket, ArrowLeft } from 'lucide-react';
import {
  getOnboardingStatus,
  listWelcomeCandidateTemplates,
} from '@/lib/actions/welcome-template';
import { OnboardingWizard } from '@/components/onboarding/onboarding-wizard';
import { Badge } from '@/components/ui/badge';

export const dynamic = 'force-dynamic';

/**
 * Setup del trainer — sección dentro de Configuración (sidebar). Muestra el
 * checklist + botones individuales por cada paso (GHL OAuth / Keywords /
 * YCloud+plantillas / Welcome template + token webhook).
 *
 * Reemplaza al banner sticky del shell (antes en `OnboardingBanner`) y al
 * checklist obligatorio del dashboard (antes en `ActivationChecklist`). El
 * dashboard vuelve a mostrar widgets normales aunque el setup esté pendiente.
 *
 * Primera visita: `dashboard/page.tsx` lleva al trainer aquí con `?firstvisit=1`
 * solo la primera vez (via localStorage). Después solo se llega por sidebar.
 */
interface PageProps {
  searchParams: Promise<{ firstvisit?: string }>;
}

export default async function SettingsSetupPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const isFirstVisit = sp.firstvisit === '1';

  const [status, templates] = await Promise.all([
    getOnboardingStatus(),
    listWelcomeCandidateTemplates(),
  ]);

  if (!status.ok) {
    return (
      <div className="max-w-3xl mx-auto flex flex-col gap-4">
        <div>
          <Link
            href="/dashboard"
            className="text-sm text-muted-foreground inline-flex items-center gap-1 hover:underline w-fit"
          >
            <ArrowLeft className="size-3.5" />
            Volver al dashboard
          </Link>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Setup</h1>
        <p className="text-sm text-destructive">Error: {status.error}</p>
      </div>
    );
  }

  const candidateTemplates = templates.ok ? templates.data : [];
  const panelOrigin = process.env.NEXT_PUBLIC_PANEL_ORIGIN ?? '';
  const motorOrigin =
    process.env.NEXT_PUBLIC_MOTOR_ORIGIN ?? process.env.MOTOR_INTERNAL_URL ?? '';

  // Calcular pasos completados/pendientes para mostrar progreso en el header.
  const data = status.data;
  const stepsDone = [
    data.ghl.connected,
    data.keywords.hasBienvenida && data.keywords.hasLeadMagnet,
    data.ycloud.connected && data.ycloud.templatesApproved > 0,
    data.welcome.welcomeTemplateId != null && data.welcome.leadFormToken != null,
  ];
  const doneCount = stepsDone.filter(Boolean).length;
  const pending = 4 - doneCount;
  const allDone = pending === 0;

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-6">
      <div>
        <p className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Rocket className="size-3.5" />
          Configuración · Setup inicial
        </p>
        <div className="flex items-end justify-between gap-4 flex-wrap mt-1">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Setup de tu setter IA
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Conecta los canales de captación y configura las palabras clave.
              Cada paso te llevará a la sección correspondiente del panel.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {allDone ? (
              <Badge variant="outline" className="border-success/40 text-success bg-success/5">
                ✓ Setup completo
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="border-orange-500/40 text-orange-600 dark:text-orange-400 bg-orange-500/5"
              >
                {pending} pendiente{pending === 1 ? '' : 's'} · {doneCount}/4
              </Badge>
            )}
          </div>
        </div>
      </div>

      {isFirstVisit ? (
        <div className="rounded-md border border-primary/30 bg-primary/5 p-4 text-sm">
          <p className="font-medium text-foreground">¡Bienvenido a Fyzon Setters!</p>
          <p className="text-muted-foreground mt-1">
            Completa estos 4 pasos para empezar a recibir leads automáticamente.
            Suele llevar 10-15 minutos si tienes las credenciales a mano. Puedes
            volver aquí en cualquier momento desde{' '}
            <strong className="text-foreground">Configuración → Setup</strong> en el sidebar.
          </p>
        </div>
      ) : null}

      <OnboardingWizard
        status={data}
        candidateTemplates={candidateTemplates}
        panelOrigin={panelOrigin}
        motorOrigin={motorOrigin}
      />
    </div>
  );
}
