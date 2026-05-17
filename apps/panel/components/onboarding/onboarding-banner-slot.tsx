import { OnboardingBanner } from '@/components/onboarding/onboarding-banner';
import { resolveEffectiveTenantId } from '@/lib/impersonate';
import { getTenantHealth } from '@/lib/tenant-health';

/**
 * Server slot async que resuelve el tenant efectivo y carga `tenantHealth`
 * para decidir si pintar el banner. Va envuelto en `<Suspense>` desde
 * `(app)/layout.tsx` para que estos 2 awaits no bloqueen la primera pintura
 * de sidebar + header + main content.
 *
 * Si el tenant ya completó onboarding o no hay tenant resolvable → render null.
 */
export async function OnboardingBannerSlot({
  profileTenantId,
  isAgencyAdmin,
}: {
  profileTenantId: number | null;
  isAgencyAdmin: boolean;
}) {
  if (profileTenantId == null) return null;

  const { tenantId: effectiveId } = await resolveEffectiveTenantId({
    profileTenantId,
    isAgencyAdmin,
  });
  const health = await getTenantHealth(effectiveId);
  if (!health || health.onboardedAt != null) return null;

  const mode = isAgencyAdmin ? 'admin_impersonating' : 'trainer';
  return (
    <OnboardingBanner mode={mode} coachIsPlaceholder={health.coachV3IsPlaceholder} />
  );
}
