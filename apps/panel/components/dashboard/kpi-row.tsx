import { KpiCard } from './kpi-card';
import type { KpiSnapshot } from '@/lib/dashboard-metrics';

interface Props {
  kpis: KpiSnapshot;
  /**
   * Citas vivas del calendario reservadas en el periodo sin conversación
   * asociada. No entran en "Citas agendadas" (la tarjeta lista conversaciones);
   * se avisa debajo para que el número no parezca menor que el calendario.
   */
  unmatchedAppointments?: number;
}

/**
 * 2026-09-12 — "Agendados" se parte en dos tarjetas (Tania: "las llamadas
 * agendadas siguen siendo los enlaces enviados, no realmente las llamadas
 * agendadas"): "Enlaces enviados" es el proxy F6/F7 de siempre, y "Citas
 * agendadas" son reservas reales del calendario vinculado.
 */
export function KpiRow({ kpis, unmatchedAppointments = 0 }: Props) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
        <KpiCard
          variant="volume"
          label="Leads totales"
          tooltip="Conversaciones nuevas creadas en el periodo seleccionado."
          value={kpis.leads}
        />
        <KpiCard
          variant="volume"
          label="Conversaciones activas"
          tooltip="Convs con state=active y mensaje reciente dentro del periodo."
          value={kpis.active}
        />
        <KpiCard
          variant="volume"
          label="Cualificados"
          tooltip="Convs que el motor llevó a F5 (propuesta de llamada) en el periodo."
          value={kpis.qualified}
        />
        <KpiCard
          variant="volume"
          label="Enlaces enviados"
          tooltip="Convs cuya fase llegó a F6 (enlace de agenda enviado) o F7 en el periodo. Enviar el enlace no es reservar."
          value={kpis.linkSent}
        />
        <KpiCard
          variant="volume"
          label="Citas agendadas"
          tooltip="Reservas reales en tu calendario vinculado (GHL) hechas en el periodo, contadas por conversación. Excluye canceladas. Sin calendario vinculado, siempre 0."
          value={kpis.scheduled}
        />
        <KpiCard
          variant="volume"
          label="Ganados"
          tooltip="Outcomes 'Comprado' aplicados (manual o vía webhook GHL futuro) en el periodo."
          value={kpis.won}
        />
      </div>
      {unmatchedAppointments > 0 ? (
        <p className="text-xs text-muted-foreground">
          Además hay {unmatchedAppointments}{' '}
          {unmatchedAppointments === 1 ? 'cita reservada' : 'citas reservadas'} en el calendario en
          este periodo sin conversación asociada (reservas directas o personas que no pasaron por el
          setter). No entran en “Citas agendadas”.
        </p>
      ) : null}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
        <KpiCard
          variant="rate"
          label="Show% (asistencia)"
          tooltip="De las citas agendadas (won + lost + cancelled + no_show), qué % se presentó (won + lost). Mide la eficacia del recordatorio."
          value={kpis.showRate}
        />
        <KpiCard
          variant="rate"
          label="Close% (cierre)"
          tooltip="De los que se presentaron (won + lost), qué % cerró compra (won). Mide la eficacia del cierre comercial."
          value={kpis.closeRate}
        />
      </div>
    </div>
  );
}
