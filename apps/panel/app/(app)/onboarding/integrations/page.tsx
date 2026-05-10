import Link from 'next/link';
import {
  getOnboardingStatus,
  listWelcomeCandidateTemplates,
} from '@/lib/actions/welcome-template';
import { OnboardingWizard } from '@/components/onboarding/onboarding-wizard';

export const dynamic = 'force-dynamic';

export default async function OnboardingIntegrationsPage() {
  const [status, templates] = await Promise.all([
    getOnboardingStatus(),
    listWelcomeCandidateTemplates(),
  ]);

  if (!status.ok) {
    return (
      <div className="max-w-3xl mx-auto py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Onboarding</h1>
        <p className="text-sm text-destructive mt-3">Error: {status.error}</p>
        <p className="text-sm text-muted-foreground mt-2">
          Si acabas de instalar el SaaS,{' '}
          <Link href="/login" className="underline">
            inicia sesión
          </Link>{' '}
          primero.
        </p>
      </div>
    );
  }

  const candidateTemplates = templates.ok ? templates.data : [];
  const panelOrigin = process.env.NEXT_PUBLIC_PANEL_ORIGIN ?? '';
  const motorOrigin =
    process.env.NEXT_PUBLIC_MOTOR_ORIGIN ?? process.env.MOTOR_INTERNAL_URL ?? '';

  return (
    <div className="max-w-3xl mx-auto py-8 flex flex-col gap-6">
      <div>
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          Configuración inicial
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Onboarding de integraciones
        </h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
          Conecta tus canales de captación (GHL para Instagram/Facebook, YCloud
          para WhatsApp) y configura las palabras clave que activan la IA. Una
          vez completado, tus formularios externos enviarán bienvenidas
          automáticas y el setter podrá conversar con cada lead.
        </p>
      </div>

      <OnboardingWizard
        status={status.data}
        candidateTemplates={candidateTemplates}
        panelOrigin={panelOrigin}
        motorOrigin={motorOrigin}
      />
    </div>
  );
}
