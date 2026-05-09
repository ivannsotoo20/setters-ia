import { Receipt } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

export default function TenantBillingPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Receipt className="size-3.5" />
          Facturación
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Plan + costes</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Plan contratado, ciclo de facturación, consumo de mensajes y coste por
          modelo. Visible solo para agency admin.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Próximamente</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          La integración de billing (Stripe + reporting de uso) se incorporará cuando
          haya ≥3 sub-cuentas de pago activas.
        </CardContent>
      </Card>
    </div>
  );
}
