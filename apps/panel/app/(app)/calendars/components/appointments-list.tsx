'use client';

import { ChevronRight } from 'lucide-react';
import type { AppointmentRow } from '@/lib/actions/calendars';
import {
  channelBadgeClasses,
  channelHandleForRow,
  channelLabel,
  formatLeadName,
  formatTime,
  matchColor,
  statusBadge,
} from './appointments-view';

interface Props {
  appointments: AppointmentRow[];
  onSelect: (a: AppointmentRow) => void;
}

const MATCH_LABELS: Record<string, string> = {
  fyzon_uuid: 'UUID',
  phone: 'phone',
  unmatched: 'sin asociar',
};

export function AppointmentsList({ appointments, onSelect }: Props) {
  if (appointments.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-12">
        Sin citas en este filtro.
      </p>
    );
  }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-xs uppercase tracking-wider text-muted-foreground/70">
          <th className="text-left font-medium px-4 py-3">Lead</th>
          <th className="text-left font-medium px-4 py-3">Calendario</th>
          <th className="text-left font-medium px-4 py-3">Inicio</th>
          <th className="text-left font-medium px-4 py-3">Estado</th>
          <th className="text-left font-medium px-4 py-3">Canal</th>
          <th className="text-left font-medium px-4 py-3">Origen</th>
          <th className="w-10" />
        </tr>
      </thead>
      <tbody>
        {appointments.map((a) => (
          <tr
            key={a.id}
            className="border-b last:border-0 hover:bg-muted/30 cursor-pointer transition-colors"
            onClick={() => onSelect(a)}
          >
            <td className="px-4 py-3">
              <div className="font-medium text-foreground">{formatLeadName(a)}</div>
              {a.leadPhone && a.leadFirstName && (
                <div className="text-xs text-muted-foreground font-mono mt-0.5">
                  {a.leadPhone}
                </div>
              )}
            </td>
            <td className="px-4 py-3 text-muted-foreground">{a.calendarName}</td>
            <td className="px-4 py-3 font-mono text-xs tabular-nums">{formatTime(a.startAt)}</td>
            <td className="px-4 py-3">{statusBadge(a.appointmentStatus)}</td>
            <td className="px-4 py-3">
              {a.channelType ? (
                <div className="flex flex-col gap-0.5">
                  <span
                    className={`inline-flex w-fit items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium ${channelBadgeClasses(a.channelType)}`}
                  >
                    {channelLabel(a.channelType)}
                  </span>
                  {channelHandleForRow(a) && (
                    <span className="text-[11px] text-muted-foreground font-mono truncate max-w-[160px]">
                      {channelHandleForRow(a)}
                    </span>
                  )}
                </div>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </td>
            <td className="px-4 py-3">
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className={`h-2 w-2 rounded-full ${matchColor(a.matchMethod)}`} />
                {MATCH_LABELS[a.matchMethod ?? 'unmatched']}
              </span>
            </td>
            <td className="px-4 py-3 text-muted-foreground/60">
              <ChevronRight className="h-4 w-4" />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
