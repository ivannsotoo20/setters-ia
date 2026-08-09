import { redirect } from 'next/navigation';
import { Sliders } from 'lucide-react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getEffectiveTenant } from '@/lib/effective-tenant';
import { loadTrainerPreferences } from '@/lib/actions/prompts';
import { listCustomInstructions } from '@/lib/actions/custom-instructions';
import { DEFAULT_TRAINER_PREFERENCES } from '@/lib/trainer-prefs-serializer';
import { PreferencesForm } from './preferences-form';
import { CustomInstructionsList } from './custom-instructions-list';
import { AiSwitchCard } from './ai-switch-card';
import { getAiEnabled } from '@/lib/actions/ai-switch';

export const dynamic = 'force-dynamic';

export default async function PreferencesPage() {
  // Auth: cualquier usuario logueado con tenant. NO requiere agency admin
  // (las prefs son del trainer; admin las ve via /admin/tenants/[id]).
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const effective = await getEffectiveTenant();
  if (!effective) redirect('/dashboard');

  const [prefsResult, instructionsResult, aiEnabled] = await Promise.all([
    loadTrainerPreferences({ tenantId: effective.tenantId }),
    listCustomInstructions({ tenantId: effective.tenantId }),
    getAiEnabled(),
  ]);

  const initial = prefsResult.ok ? prefsResult.preferences : DEFAULT_TRAINER_PREFERENCES;
  const instructions = instructionsResult.ok ? instructionsResult.instructions : [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Sliders className="size-3.5" />
          Configuración · ajustes finos del setter
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Preferencias</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Ajustes ligeros de estilo del setter para tu sub-cuenta. NO cambian la lógica del agente
          (eso lo gestiona la agencia desde el Cerebro y el Coach), pero sí ajustan la superficie:
          puntuación, densidad de emojis, número de preguntas previas a la cita, instrucciones
          libres. Aplican inmediatamente al siguiente turno del motor.
        </p>
      </div>

      <AiSwitchCard initialEnabled={aiEnabled} />

      <PreferencesForm tenantId={effective.tenantId} initial={initial} />

      <CustomInstructionsList tenantId={effective.tenantId} initial={instructions} />
    </div>
  );
}
