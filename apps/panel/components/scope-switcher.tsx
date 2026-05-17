'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Eye, ShieldCheck, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { startImpersonating, stopImpersonating } from '@/lib/actions/admin';
import { toast } from 'sonner';

interface Props {
  isAgencyAdmin: boolean;
  /** Tenant impersonado actualmente (cookie). null si no impersona. */
  impersonatingTenantId: number | null;
  impersonatingTenantName?: string | null;
}

function extractTenantIdFromUrl(pathname: string): number | null {
  const m = /^\/admin\/tenants\/(\d+)(\/|$)/.exec(pathname);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Scope switcher tipo GHL. Visible solo cuando el caller es agency admin Y:
 *   - Está en `/admin/tenants/[id]/...` (vista admin del tenant).
 *   - O está en cualquier ruta trainer mientras impersonea (cookie set).
 *
 * Permite saltar entre "Vista admin del tenant" (rutas /admin/tenants/[id]) y
 * "Vista cliente" (cookie impersonate + rutas /dashboard, /conversations, ...).
 */
export function ScopeSwitcher({
  isAgencyAdmin,
  impersonatingTenantId,
  impersonatingTenantName,
}: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (!isAgencyAdmin) return null;

  const tenantIdInUrl = extractTenantIdFromUrl(pathname);

  // Sólo dos contextos donde mostrar el switcher:
  // (a) URL `/admin/tenants/[id]/...` → ofrecer "Vista cliente"
  // (b) Cualquier ruta trainer + impersonate cookie set → ofrecer "Vista admin"
  const isInTenantAdminUrl = tenantIdInUrl !== null;
  const isInClientViewWhileImpersonating =
    impersonatingTenantId !== null && !pathname.startsWith('/admin/');

  if (!isInTenantAdminUrl && !isInClientViewWhileImpersonating) return null;

  const tenantId = tenantIdInUrl ?? impersonatingTenantId!;
  const tenantName = impersonatingTenantName ?? `Tenant #${tenantId}`;

  // Navega entre subdomains (admin.fyzon.es ↔ panel.fyzon.es) sin doble hop
  // del middleware cross-domain. En localhost dev usa router.push relativo.
  const isProdSubdomain = () =>
    typeof window !== 'undefined' &&
    (window.location.hostname === 'admin.fyzon.es' ||
      window.location.hostname === 'panel.fyzon.es');

  const goCrossDomain = (toHost: 'admin' | 'panel', path: string) => {
    if (isProdSubdomain()) {
      const target = toHost === 'admin' ? 'https://admin.fyzon.es' : 'https://panel.fyzon.es';
      window.location.href = `${target}${path}`;
    } else {
      router.push(path);
      router.refresh();
    }
  };

  const onEnterClientView = () => {
    startTransition(async () => {
      const result = await startImpersonating(tenantId);
      if (result.ok) {
        goCrossDomain('panel', '/dashboard');
      } else {
        toast.error(result.error);
      }
    });
  };

  const onBackToAdminView = () => {
    startTransition(async () => {
      await stopImpersonating();
      // Volver al resumen general de agencia (no a la página del tenant impersonado).
      goCrossDomain('admin', '/admin/dashboard');
    });
  };

  return (
    <div className="flex items-center gap-2">
      <Badge
        variant="outline"
        className="border-success/40 text-success bg-success/5"
      >
        <ShieldCheck className="size-3 mr-1" />
        {tenantName}
      </Badge>

      {isInTenantAdminUrl ? (
        <Button
          size="sm"
          variant="outline"
          onClick={onEnterClientView}
          disabled={pending}
          className="h-8"
        >
          {pending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Eye className="size-3.5" />
          )}
          Vista cliente
        </Button>
      ) : null}

      {isInClientViewWhileImpersonating ? (
        <Button
          size="sm"
          variant="outline"
          onClick={onBackToAdminView}
          disabled={pending}
          className="h-8"
        >
          {pending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <ShieldCheck className="size-3.5" />
          )}
          Vista admin
        </Button>
      ) : null}
    </div>
  );
}
