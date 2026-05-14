import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { listCalendarAccounts } from '@/lib/actions/calendars';
import { BackfillButton } from './components/backfill-button';
import { CalendarsTable } from './components/calendars-table';
import { SyncCalendarsButton } from './components/sync-calendars-button';

export const dynamic = 'force-dynamic';

export default async function SettingsCalendarsPage() {
  const result = await listCalendarAccounts();
  const calendars = result.ok ? result.data ?? [] : [];
  const defaultCount = calendars.filter((c) => c.isDefault && c.isActive).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Configuración
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Calendarios</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Vincula tus calendarios de Go High Level al SaaS para que el setter
            mande la URL trackable y las reservas aparezcan en el dashboard.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {calendars.some((c) => c.isActive) && <BackfillButton />}
          <SyncCalendarsButton />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Tus calendarios ({calendars.length})
          </CardTitle>
          <CardDescription>
            {defaultCount === 0
              ? 'Designa uno como default — es el que recibirá el lead en F6.'
              : 'El calendario default se usa en F6 cuando el setter manda el enlace.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!result.ok ? (
            <p className="text-sm text-destructive">Error: {result.error}</p>
          ) : calendars.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sin calendarios vinculados todavía. Pulsa &quot;Sincronizar desde
              GHL&quot; arriba para empezar.
            </p>
          ) : (
            <CalendarsTable calendars={calendars} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cómo funciona el tracking</CardTitle>
          <CardDescription>
            Mecanismo híbrido para identificar al lead que agenda
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            <strong className="text-foreground">1.</strong> Cuando el setter
            llega a F6, manda al lead el enlace del calendario default con dos
            parámetros: <code>fyzon_lead_uuid</code> (slug único del lead) y{' '}
            <code>phone</code> pre-rellenado.
          </p>
          <p>
            <strong className="text-foreground">2.</strong> El lead abre el
            enlace y reserva. GHL guarda el slug en un custom field del contacto
            llamado &quot;fyzon_lead_uuid&quot; (creado automáticamente al
            sincronizar).
          </p>
          <p>
            <strong className="text-foreground">3.</strong> GHL dispara el
            webhook <code>AppointmentCreate</code> al motor. El SaaS matchea por
            slug (precisión 100%). Si por alguna razón se pierde el slug,
            fallback a match por phone (precisión ~80%).
          </p>
          <p>
            <strong className="text-foreground">4.</strong> La conversación
            pasa a <strong>F7 · Cita agendada</strong> en el kanban, la IA se
            pausa y el trainer recibe la notificación.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
