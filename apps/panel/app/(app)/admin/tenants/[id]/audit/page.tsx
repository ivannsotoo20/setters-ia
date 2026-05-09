import { ClipboardList } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

export default function TenantAuditPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <ClipboardList className="size-3.5" />
          Auditoría
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Registro de actividad</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Historial de acciones administrativas sobre esta sub-cuenta (invitaciones,
          cambios de rol, resets de contraseña, integraciones, prompts).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Próximamente</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          La tabla `tenant_audit_log` ya está acumulando eventos en BD. La UI viewer
          se construirá en un sprint posterior cuando haya volumen suficiente para
          justificar filtros + paginación.
        </CardContent>
      </Card>
    </div>
  );
}
