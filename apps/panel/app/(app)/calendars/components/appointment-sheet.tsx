'use client';

import Link from 'next/link';
import { MessageSquare, Phone, User } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  appointment: AppointmentRow | null;
  onClose: () => void;
}

const MATCH_LABELS: Record<string, string> = {
  fyzon_uuid: 'Match por slug (100% confianza)',
  phone: 'Match por phone (~80% confianza)',
  unmatched: 'Sin lead asociado',
};

export function AppointmentSheet({ appointment, onClose }: Props) {
  return (
    <Sheet open={!!appointment} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        {appointment && (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2 flex-wrap">
                <span>{formatLeadName(appointment)}</span>
                {statusBadge(appointment.appointmentStatus)}
              </SheetTitle>
              <SheetDescription className="text-xs">
                {appointment.title && appointment.title !== formatLeadName(appointment) && (
                  <span className="block text-foreground/80">{appointment.title}</span>
                )}
                <span className="block font-mono text-muted-foreground/70 mt-0.5">
                  {appointment.externalAppointmentId.slice(0, 28)}…
                </span>
              </SheetDescription>
            </SheetHeader>

            <div className="mt-6 flex flex-col gap-4">
              <Row label="Calendar" value={appointment.calendarName} />
              <Row label="Inicio" value={formatTime(appointment.startAt)} />
              <Row label="Fin" value={formatTime(appointment.endAt)} />

              <div className="border-t pt-4 flex flex-col gap-2">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  Lead
                </p>
                {appointment.leadId == null ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span
                      className={`h-2 w-2 rounded-full ${matchColor(appointment.matchMethod)}`}
                    />
                    Booking huérfano — no se pudo asociar a ningún lead del SaaS.
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 text-sm">
                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                      {appointment.leadFirstName ?? '(sin nombre)'}
                    </div>
                    {appointment.leadPhone && (
                      <div className="flex items-center gap-2 text-sm">
                        <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-mono">{appointment.leadPhone}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span
                        className={`h-2 w-2 rounded-full ${matchColor(appointment.matchMethod)}`}
                      />
                      {MATCH_LABELS[appointment.matchMethod ?? 'unmatched']}
                    </div>
                    {appointment.conversationId && (
                      <Link
                        href={`/conversations?conv=${appointment.conversationId}`}
                        className="mt-2"
                      >
                        <Button size="sm" variant="outline" className="w-full">
                          <MessageSquare className="h-3.5 w-3.5 mr-2" />
                          Ver conversación
                        </Button>
                      </Link>
                    )}
                  </>
                )}
              </div>

              <div className="border-t pt-4 flex flex-col gap-2">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">
                  Origen GHL
                </p>
                <Row label="Source" value={appointment.source ?? '—'} />
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Canal</span>
                  {appointment.channelType ? (
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium ${channelBadgeClasses(appointment.channelType)}`}
                      >
                        {channelLabel(appointment.channelType)}
                      </span>
                      {channelHandleForRow(appointment) && (
                        <span className="text-xs font-mono text-muted-foreground">
                          {channelHandleForRow(appointment)}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="font-medium">—</span>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
