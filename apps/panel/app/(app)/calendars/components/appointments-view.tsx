'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, List, Filter, RefreshCw } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  backfillAppointments,
  type AppointmentRow,
  type CalendarAccountRow,
} from '@/lib/actions/calendars';
import { AppointmentsList } from './appointments-list';
import { AppointmentsMonth } from './appointments-month';
import { AppointmentSheet } from './appointment-sheet';

/** Auto-refresh: cada cuántos ms se hace pull silencioso desde GHL. */
const AUTO_REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutos

interface Props {
  appointments: AppointmentRow[];
  calendars: CalendarAccountRow[];
}

type StatusFilter = 'all' | AppointmentRow['appointmentStatus'];
type TimeFilter = 'all' | 'future' | 'past';
type CalendarFilter = 'all' | number;

export function AppointmentsView({ appointments, calendars }: Props) {
  const activeCalendars = calendars.filter((c) => c.isActive);
  // Si solo hay un calendar activo, pre-seleccionarlo para que el filtro sea
  // visualmente coherente con lo que el trainer está viendo (sus citas).
  const defaultCalendar: CalendarFilter =
    activeCalendars.length === 1 ? activeCalendars[0]!.id : 'all';

  const router = useRouter();
  const [tab, setTab] = useState<'list' | 'month'>('month');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [time, setTime] = useState<TimeFilter>('future');
  const [calendar, setCalendar] = useState<CalendarFilter>(defaultCalendar);
  const [selected, setSelected] = useState<AppointmentRow | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // null hasta que se monte en el cliente para evitar hydration mismatch (new Date()
  // produce timestamps distintos en server vs client).
  const [lastRefreshAt, setLastRefreshAt] = useState<Date | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (lastRefreshAt === null) setLastRefreshAt(new Date());
  }, [lastRefreshAt]);

  /**
   * Pull silencioso desde GHL (sin toast). Llama backfill y refresca data.
   * Usado por auto-refresh (cada 5min) y botón manual.
   */
  const doRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await backfillAppointments({ daysBack: 30, daysForward: 90 });
      router.refresh();
      setLastRefreshAt(new Date());
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, router]);

  // Auto-refresh cada 5min, solo cuando la pestaña está visible.
  useEffect(() => {
    function tick() {
      if (document.visibilityState === 'visible') {
        void doRefresh();
      }
    }
    refreshTimer.current = setInterval(tick, AUTO_REFRESH_INTERVAL_MS);
    return () => {
      if (refreshTimer.current) clearInterval(refreshTimer.current);
    };
  }, [doRefresh]);

  /**
   * Filtros comunes a las dos vistas: status + calendar.
   * - Si `status='all'` ocultamos por defecto cancelled/noshow/invalid para
   *   evitar ruido visual de citas que ya no están activas.
   * - Filtro `time` solo aplica en la vista LISTA.
   */
  const baseFiltered = useMemo(() => {
    const HIDDEN_BY_DEFAULT = new Set(['cancelled', 'noshow', 'invalid']);
    return appointments.filter((a) => {
      if (status === 'all') {
        if (HIDDEN_BY_DEFAULT.has(a.appointmentStatus)) return false;
      } else if (a.appointmentStatus !== status) {
        return false;
      }
      if (calendar !== 'all' && a.calendarAccountId !== calendar) return false;
      return true;
    });
  }, [appointments, status, calendar]);

  const listFiltered = useMemo(() => {
    const now = Date.now();
    return baseFiltered.filter((a) => {
      const ts = new Date(a.startAt).getTime();
      if (time === 'future' && ts < now) return false;
      if (time === 'past' && ts >= now) return false;
      return true;
    });
  }, [baseFiltered, time]);

  const visibleCount = tab === 'list' ? listFiltered.length : baseFiltered.length;

  return (
    <Tabs
      value={tab}
      onValueChange={(v) => setTab(v as 'list' | 'month')}
      className="flex flex-col gap-4"
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <TabsList>
          <TabsTrigger value="list" className="gap-1.5">
            <List className="h-3.5 w-3.5" /> Lista
          </TabsTrigger>
          <TabsTrigger value="month" className="gap-1.5">
            <Calendar className="h-3.5 w-3.5" /> Calendario
          </TabsTrigger>
        </TabsList>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            variant="ghost"
            onClick={doRefresh}
            disabled={refreshing}
            title={
              lastRefreshAt
                ? `Última sync: ${lastRefreshAt.toLocaleTimeString('es-ES')}. Auto-refresh cada 5 min.`
                : 'Auto-refresh cada 5 min.'
            }
            className="h-8"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          {tab === 'list' && (
            <Select value={time} onValueChange={(v) => setTime(v as TimeFilter)}>
              <SelectTrigger className="h-8 w-[140px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="future">Próximas</SelectItem>
                <SelectItem value="past">Pasadas</SelectItem>
                <SelectItem value="all">Todas</SelectItem>
              </SelectContent>
            </Select>
          )}
          <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Activas (default)</SelectItem>
              <SelectItem value="new">Nueva</SelectItem>
              <SelectItem value="confirmed">Confirmada</SelectItem>
              <SelectItem value="showed">Asistió</SelectItem>
              <SelectItem value="noshow">No-show</SelectItem>
              <SelectItem value="cancelled">Cancelada</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={calendar === 'all' ? 'all' : String(calendar)}
            onValueChange={(v) => setCalendar(v === 'all' ? 'all' : Number(v))}
          >
            <SelectTrigger className="h-8 w-[180px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los calendars</SelectItem>
              {calendars
                .filter((c) => c.isActive)
                .map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between gap-3 px-4 py-2 border-b text-xs text-muted-foreground">
            <span>
              {visibleCount}{' '}
              {visibleCount === 1 ? 'cita' : 'citas'} en vista
            </span>
            <div className="flex items-center gap-2">
              <span>Estado:</span>
              <LegendDot color="bg-success" label="confirmada" />
              <LegendDot color="bg-primary" label="nueva" />
              <LegendDot color="bg-warning" label="no-show" />
              <LegendDot color="bg-destructive" label="cancelada" />
            </div>
          </div>

          <TabsContent value="list" className="m-0">
            <AppointmentsList
              appointments={listFiltered}
              onSelect={setSelected}
            />
          </TabsContent>
          <TabsContent value="month" className="m-0">
            <AppointmentsMonth
              appointments={baseFiltered}
              onSelect={setSelected}
            />
          </TabsContent>
        </CardContent>
      </Card>

      <AppointmentSheet
        appointment={selected}
        onClose={() => setSelected(null)}
      />
    </Tabs>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-block h-2 w-2 rounded-full ${color}`} />
      <span>{label}</span>
    </span>
  );
}

// Helpers exportados para los sub-componentes
export function statusBadge(s: AppointmentRow['appointmentStatus']) {
  const map: Record<
    AppointmentRow['appointmentStatus'],
    { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
  > = {
    new: { label: 'Nueva', variant: 'default' },
    confirmed: { label: 'Confirmada', variant: 'default' },
    showed: { label: 'Asistió', variant: 'secondary' },
    noshow: { label: 'No-show', variant: 'destructive' },
    cancelled: { label: 'Cancelada', variant: 'outline' },
    invalid: { label: 'Inválida', variant: 'outline' },
  };
  const cfg = map[s];
  return (
    <Badge variant={cfg.variant} className="text-[10px]">
      {cfg.label}
    </Badge>
  );
}

/**
 * Prioridad de nombre del contacto en la cita:
 *   1. Nombre del lead matcheado en el SaaS (cuando match_method != unmatched).
 *   2. Title del appointment GHL (es el nombre del contacto reservante).
 *   3. Phone del lead matcheado.
 *   4. Fallback genérico.
 */
export function formatLeadName(a: AppointmentRow): string {
  if (a.leadFirstName && a.leadFirstName.trim()) return a.leadFirstName.trim();
  if (a.title && a.title.trim()) return a.title.trim();
  if (a.leadPhone) return a.leadPhone;
  return 'Sin asociar';
}

export function statusDotColor(s: AppointmentRow['appointmentStatus']): string {
  switch (s) {
    case 'confirmed':
      return 'bg-success';
    case 'new':
      return 'bg-primary';
    case 'showed':
      return 'bg-success';
    case 'noshow':
      return 'bg-warning';
    case 'cancelled':
      return 'bg-destructive';
    default:
      return 'bg-muted-foreground/40';
  }
}

export function matchColor(method: string | null): string {
  if (method === 'fyzon_uuid') return 'bg-success';
  if (method === 'phone') return 'bg-warning';
  return 'bg-muted-foreground/40';
}

export function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('es-ES', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}
