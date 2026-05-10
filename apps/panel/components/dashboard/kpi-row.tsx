import { KpiCard } from './kpi-card';
import type { KpiSnapshot } from '@/lib/dashboard-metrics';

interface Props {
  kpis: KpiSnapshot;
}

export function KpiRow({ kpis }: Props) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
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
          label="Agendados"
          tooltip="Convs cuya fase llegó a F6 (link agenda enviado) o F7 (cita agendada). Proxy hasta integración GHL completa."
          value={kpis.scheduled}
        />
        <KpiCard
          variant="volume"
          label="Ganados"
          tooltip="Outcomes 'Comprado' aplicados (manual o vía webhook GHL futuro) en el periodo."
          value={kpis.won}
        />
      </div>
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
