'use client';

import { useState, useTransition } from 'react';
import { Loader2, RotateCcw, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  simulateTurn,
  type SimulateCalendar,
  type SimulateTurnInput,
} from '@/lib/actions/simulate';

type Origin = 'bienvenida' | 'lm' | 'inbound';
type Channel = 'instagram_dm' | 'whatsapp';
type Turn = { role: 'user' | 'assistant'; content: string };

const ORIGENES: { value: Origin; label: string; help: string }[] = [
  {
    value: 'inbound',
    label: 'Te escribe alguien',
    help: 'Llega por iniciativa propia. El asistente no sabe de dónde viene y tiene que averiguarlo.',
  },
  {
    value: 'bienvenida',
    label: 'Escribes tú primero',
    help: 'Le abriste tú la conversación. El asistente sabe que el primer mensaje fue nuestro.',
  },
  {
    value: 'lm',
    label: 'Pidió un recurso gratis',
    help: 'Vino a por una guía o una clase. El asistente no lo trata como interés en el programa.',
  },
];

const CANALES: { value: Channel; label: string }[] = [
  { value: 'instagram_dm', label: 'Instagram' },
  { value: 'whatsapp', label: 'WhatsApp' },
];

export function Simulator() {
  const [origin, setOrigin] = useState<Origin>('inbound');
  const [channel, setChannel] = useState<Channel>('instagram_dm');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [phase, setPhase] = useState(1);
  const [draft, setDraft] = useState('');
  const [lastMeta, setLastMeta] = useState<{
    status: string;
    handoff: string | null;
    costUsd: number | null;
    latencyMs: number;
    directive: string | null;
    calendar: SimulateCalendar | null;
  } | null>(null);
  const [pending, startTransition] = useTransition();

  const reset = () => {
    setTurns([]);
    setPhase(1);
    setDraft('');
    setLastMeta(null);
  };

  const send = () => {
    const message = draft.trim();
    if (!message) return;

    const history = [...turns];
    setTurns([...history, { role: 'user', content: message }]);
    setDraft('');

    startTransition(async () => {
      const input: SimulateTurnInput = { origin, channel, phase, message, history };
      const result = await simulateTurn(input);

      if (!result.ok) {
        // Un rechazo del sistema no es un fallo de la herramienta: es información.
        if (result.rejected) {
          toast.warning('El sistema no ha dejado salir esa respuesta', {
            description: result.error,
          });
        } else {
          toast.error(result.error);
        }
        return;
      }

      setTurns((prev) => [
        ...prev,
        ...result.parts.map((content) => ({ role: 'assistant' as const, content })),
      ]);
      setPhase(result.decision.phase || phase);
      setLastMeta({
        status: result.decision.status,
        handoff: result.decision.handoff_cause,
        costUsd: result.costUsd,
        latencyMs: result.latencyMs,
        directive: result.injectedDirective,
        calendar: result.calendar,
      });
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">La situación que quieres probar</CardTitle>
          <CardDescription>
            Cambiar esto cambia cómo abre la conversación. Empieza de cero al cambiarlo.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>¿Cómo llegó esta persona?</Label>
            <div className="flex flex-wrap gap-2">
              {ORIGENES.map((o) => (
                <Button
                  key={o.value}
                  type="button"
                  size="sm"
                  variant={origin === o.value ? 'default' : 'outline'}
                  onClick={() => {
                    setOrigin(o.value);
                    reset();
                  }}
                  disabled={pending}
                >
                  {o.label}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {ORIGENES.find((o) => o.value === origin)?.help}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label>¿Por dónde?</Label>
            <div className="flex gap-2">
              {CANALES.map((c) => (
                <Button
                  key={c.value}
                  type="button"
                  size="sm"
                  variant={channel === c.value ? 'default' : 'outline'}
                  onClick={() => {
                    setChannel(c.value);
                    reset();
                  }}
                  disabled={pending}
                >
                  {c.label}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3 flex-row items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base">La conversación</CardTitle>
            <CardDescription>
              Escribe como si fueras la persona que te contacta.
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={reset} disabled={pending || !turns.length}>
            <RotateCcw className="size-3.5" />
            Empezar de cero
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 min-h-40">
            {turns.length === 0 ? (
              <p className="text-sm text-muted-foreground italic py-8 text-center">
                Escribe abajo el primer mensaje para empezar.
              </p>
            ) : (
              turns.map((t, i) => (
                <div
                  key={i}
                  className={
                    t.role === 'user'
                      ? 'self-end max-w-[80%] rounded-2xl rounded-br-sm bg-primary/10 px-3 py-2 text-sm'
                      : 'self-start max-w-[80%] rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-sm'
                  }
                >
                  {t.content}
                </div>
              ))
            )}
            {pending ? (
              <div className="self-start flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" />
                escribiendo…
              </div>
            ) : null}
          </div>

          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Hola, llevo años con dolor lumbar…"
              disabled={pending}
            />
            <Button type="submit" disabled={pending || !draft.trim()}>
              <Send className="size-3.5" />
              Enviar
            </Button>
          </form>
        </CardContent>
      </Card>

      {lastMeta ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Qué ha hecho por dentro</CardTitle>
            <CardDescription>
              Lo que no podías ver antes: en qué punto cree que está y por qué.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-muted-foreground">
              <span>
                Punto de la conversación:{' '}
                <strong className="text-foreground tabular-nums">{phase} de 7</strong>
              </span>
              <span>
                Estado: <strong className="text-foreground">{lastMeta.status}</strong>
              </span>
              {lastMeta.handoff ? (
                <span>
                  Te lo pasa a ti: <strong className="text-foreground">{lastMeta.handoff}</strong>
                </span>
              ) : null}
              <span className="tabular-nums">{(lastMeta.latencyMs / 1000).toFixed(1)}s</span>
              {lastMeta.costUsd != null ? (
                <span className="tabular-nums">${lastMeta.costUsd.toFixed(4)}</span>
              ) : null}
            </div>

            {/*
              El enlace de agenda es la causa de fallo más habitual y la más
              confusa: sin calendario vinculado el asistente deriva en vez de
              enviar nada, y sin esta nota el entrenador cree que se ha roto.
            */}
            {lastMeta.calendar ? (
              lastMeta.calendar.reason === 'ok' ? (
                <div className="rounded-md border border-border p-3 text-xs">
                  <p className="font-medium">
                    Enlace de agenda
                    {lastMeta.calendar.name ? ` · ${lastMeta.calendar.name}` : null}
                  </p>
                  <p className="text-muted-foreground mt-1">
                    Es tu enlace real, el mismo que recibiría la persona. Si lo abres y
                    reservas, la cita se crea de verdad en tu calendario y aparecerá sin
                    asociar a nadie, porque aquí no hay una persona detrás.
                  </p>
                  <p className="mt-2 break-all font-mono text-[11px] text-muted-foreground">
                    {lastMeta.calendar.url}
                  </p>
                </div>
              ) : (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
                  <p className="font-medium">Todavía no puede enviar tu agenda</p>
                  <p className="text-muted-foreground mt-1">
                    {lastMeta.calendar.reason === 'no_calendar'
                      ? 'No tienes ningún calendario vinculado, así que cuando alguien quiera reservar el asistente te lo pasará a ti en vez de enviar un enlace.'
                      : 'Tu calendario está vinculado pero le falta la dirección del widget, así que el asistente no puede enviar el enlace.'}{' '}
                    Se arregla en{' '}
                    <a className="underline" href="/settings/calendars">
                      Configuración › Calendarios
                    </a>
                    .
                  </p>
                </div>
              )
            ) : null}

            {lastMeta.directive ? (
              <details className="rounded-md border border-border p-3">
                <summary className="cursor-pointer text-xs font-medium">
                  Qué se le dijo por venir de donde viene
                </summary>
                <pre className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">
                  {lastMeta.directive}
                </pre>
              </details>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
