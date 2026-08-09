import { redirect } from 'next/navigation';
import { MessagesSquare } from 'lucide-react';
import { getEffectiveTenant } from '@/lib/effective-tenant';
import { Simulator } from './simulator';

export const dynamic = 'force-dynamic';

export default async function SimuladorPage() {
  const effective = await getEffectiveTenant();
  if (!effective) redirect('/login');

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <MessagesSquare className="size-3.5" />
          Pruebas
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Probar tu asistente</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Habla con tu asistente como si fueras una persona que te acaba de escribir. Nadie
          recibe nada, no se crea ningún contacto y no queda registrado como conversación
          real: es solo para que veas cómo responde antes de dejarlo suelto.
        </p>
      </div>

      {/*
        La honestidad sobre el alcance va en la propia pantalla, no en una nota que
        nadie lee. Si el entrenador da el visto bueno aquí y luego producción se
        comporta distinto, la herramienta pierde toda su razón de ser.
      */}
      <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
        <p className="font-medium">Qué comprueba esto y qué no</p>
        <p className="text-muted-foreground mt-1">
          Aquí ves <strong className="text-foreground">lo que dice</strong>: su forma de
          hablar, qué pregunta, a quién considera buen candidato y cuándo propone la llamada.
          Lo que no se prueba aquí es la entrega real: que el mensaje salga por Instagram o
          WhatsApp, cuánto tarda o cómo se parte en varios mensajes seguidos. Eso solo se
          confirma escribiendo de verdad desde una cuenta de prueba.
        </p>
      </div>

      <Simulator />
    </div>
  );
}
