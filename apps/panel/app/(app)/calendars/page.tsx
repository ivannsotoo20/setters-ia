import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import Link from 'next/link';
import { Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { listAppointments, listCalendarAccounts } from '@/lib/actions/calendars';
import { BackfillButton } from '../settings/calendars/components/backfill-button';
import { AppointmentsView } from './components/appointments-view';

export const dynamic = 'force-dynamic';

export default async function CalendarsPage() {
  // Ventana inicial: -180 días → +180 días (cubre histórico amplio + futuro).
  const now = new Date();
  const rangeStart = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString();
  const rangeEnd = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000).toISOString();

  const [calAccountsResult, apptsResult] = await Promise.all([
    listCalendarAccounts(),
    listAppointments({ rangeStart, rangeEnd }),
  ]);

  const calendars = calAccountsResult.ok ? calAccountsResult.data ?? [] : [];
  const appointments = apptsResult.ok ? apptsResult.data ?? [] : [];

  const hasError = !calAccountsResult.ok || !apptsResult.ok;
  const errorMessage = !calAccountsResult.ok
    ? calAccountsResult.error
    : !apptsResult.ok
      ? apptsResult.error
      : null;

  const hasCalendars = calendars.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Operativa
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Calendarios</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Vista de citas agendadas en GHL. Las citas matcheadas a un lead del
            SaaS llevan la conversación a F7 automáticamente.
          </p>
        </div>
        {hasCalendars && (
          <div className="flex items-center gap-2 flex-wrap">
            <BackfillButton />
            <Link href="/settings/calendars">
              <Button variant="ghost" size="sm">
                <Settings className="h-4 w-4 mr-2" /> Configurar
              </Button>
            </Link>
          </div>
        )}
      </div>

      {hasError && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-destructive">Error: {errorMessage}</p>
          </CardContent>
        </Card>
      )}

      {!hasError && !hasCalendars && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sin calendarios vinculados</CardTitle>
            <CardDescription>
              Para empezar a ver citas, vincula al menos un calendario desde{' '}
              <a
                href="/settings/calendars"
                className="underline underline-offset-4 hover:text-foreground"
              >
                Configuración → Calendarios
              </a>
              .
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {!hasError && hasCalendars && (
        <AppointmentsView appointments={appointments} calendars={calendars} />
      )}
    </div>
  );
}
