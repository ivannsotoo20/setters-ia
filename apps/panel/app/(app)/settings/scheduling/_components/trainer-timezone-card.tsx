'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { setTrainerTimezone } from '@/lib/actions/scheduling';
import { TRAINER_TIMEZONE_OPTIONS } from '@/lib/trainer-prefs-serializer';

const DEFAULT_TZ = 'Europe/Madrid';

interface Props {
  initialTimezone: string | null;
}

export function TrainerTimezoneCard({ initialTimezone }: Props) {
  const router = useRouter();
  const effective = initialTimezone ?? DEFAULT_TZ;
  const [timezone, setTimezone] = useState<string>(effective);
  const [pending, startTransition] = useTransition();

  async function handleChange(next: string) {
    if (next === timezone) return;
    const prev = timezone;
    setTimezone(next);
    const r = await setTrainerTimezone(next);
    if (!r.ok) {
      setTimezone(prev);
      toast.error(`No se pudo guardar la zona horaria: ${r.error}`);
      return;
    }
    toast.success('Zona horaria actualizada');
    startTransition(() => router.refresh());
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Tu zona horaria</CardTitle>
        <CardDescription>
          {initialTimezone == null
            ? 'Sin configurar — la IA usará Europe/Madrid por defecto.'
            : 'Esta zona se pasa a GHL para calcular tu disponibilidad.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 max-w-md">
          <Select value={timezone} onValueChange={handleChange} disabled={pending}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Selecciona tu zona horaria" />
            </SelectTrigger>
            <SelectContent>
              {TRAINER_TIMEZONE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {pending ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
        </div>
        <p className="text-xs text-muted-foreground leading-snug max-w-prose">
          <strong className="text-foreground">Importante:</strong> esta es{' '}
          <em>tu</em> zona. El setter siempre propone horas al lead{' '}
          <strong>en la zona del lead</strong>, no en la tuya. Cuando el lead y
          tú estéis en husos distintos, el setter mencionará explícitamente la
          zona del lead (ej. <em>&quot;el martes 19 a las 13h hora
          Argentina&quot;</em>).
        </p>
      </CardContent>
    </Card>
  );
}
