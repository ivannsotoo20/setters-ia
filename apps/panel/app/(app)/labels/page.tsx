import { listLabels } from '@/lib/actions/labels';
import { listMembers } from '@/lib/actions/members';
import { getEffectiveTenant } from '@/lib/effective-tenant';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { LabelsList } from './labels-list';
import { AddLabelDialog } from './add-label-dialog';

export const dynamic = 'force-dynamic';

export default async function LabelsPage() {
  const effective = await getEffectiveTenant();
  if (!effective) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sin tenant asignado</CardTitle>
          <CardDescription>
            Tu cuenta no tiene un tenant asociado. Contacta con un admin.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const [labelsRes, membersRes] = await Promise.all([
    listLabels(),
    listMembers({ tenantId: effective.tenantId }),
  ]);

  const labels = labelsRes.ok ? labelsRes.data ?? [] : [];
  const members = membersRes.ok
    ? (membersRes.data ?? [])
        .filter((m) => m.isActive)
        .map((m) => ({ userId: m.userId, email: m.email, fullName: m.fullName }))
    : [];

  const systemCount = labels.filter((l) => l.isSystem).length;
  const customCount = labels.length - systemCount;
  const totalConversations = labels.reduce((acc, l) => acc + l.conversationCount, 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Configuración
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Etiquetas</h1>
        </div>
        <AddLabelDialog members={members} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Etiquetas system</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{systemCount}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            Hot Lead / Completado / Comprado / Activo. Aplicadas automáticamente por el motor.
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Etiquetas custom</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{customCount}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            Las que tú creas para clasificar leads (ej. &quot;Objeción precio&quot;, &quot;VIP&quot;).
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Aplicaciones totales</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{totalConversations}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            Suma de conversaciones etiquetadas (cada etiqueta cuenta independiente).
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Etiquetas configuradas ({labels.length})</CardTitle>
          <CardDescription>
            Las etiquetas system ya están preconfiguradas (no se pueden borrar). Crea las
            tuyas para automatizar la clasificación con reglas de texto, inactividad, etc.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!labelsRes.ok ? (
            <p className="text-sm text-destructive">Error: {labelsRes.error}</p>
          ) : labels.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sin etiquetas todavía. Click en &quot;Nueva etiqueta&quot;.
            </p>
          ) : (
            <LabelsList labels={labels} members={members} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
