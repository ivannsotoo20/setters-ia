'use client';

import { useState, useTransition } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createKeyword, type KeywordType } from '@/lib/actions/keywords';

const TYPES: { value: KeywordType; label: string; hint: string; placeholder: string }[] = [
  {
    value: 'bienvenida',
    label: 'Cuando escribes tú primero',
    hint: 'Un trozo del saludo que envías al contactar con alguien por primera vez. Al reconocerlo, tu asistente sigue la conversación desde ahí.',
    placeholder: 'gracias por escribir',
  },
  {
    value: 'lm',
    label: 'Cuando entregas un recurso gratuito',
    hint: 'Un trozo del mensaje con el que envías una guía, clase o vídeo. Tu asistente sabrá que esa persona pidió el recurso, no el programa.',
    placeholder: 'aquí tienes la guía',
  },
  {
    value: 'inbound',
    label: 'Cuando te escriben a ti',
    hint: 'Palabras que usa quien te escribe con interés real. Si su primer mensaje contiene alguna, tu asistente entra sin que tengas que hacer nada.',
    placeholder: 'info',
  },
  {
    value: 'wa_open',
    label: 'Solo WhatsApp: filtrar quién entra',
    hint: 'Se usa únicamente si has elegido filtrar los WhatsApp por palabra en Configuración → WhatsApp. Si no, no hace falta.',
    placeholder: 'me interesa',
  },
];

export function AddKeywordDialog() {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<KeywordType>('bienvenida');
  const [pending, startTransition] = useTransition();

  const onSubmit = (formData: FormData) => {
    startTransition(async () => {
      const pattern = String(formData.get('pattern') ?? '').trim();
      if (pattern.length === 0) {
        toast.error('El patrón no puede estar vacío');
        return;
      }
      const result = await createKeyword({ type, pattern });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success('Palabra guardada');
      setOpen(false);
      setType('bienvenida');
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" />
          Añadir palabra
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nueva palabra</DialogTitle>
          <DialogDescription>
            Escribe un trozo característico, no la frase entera. Cuanto más corto y
            distintivo, mejor: así funciona aunque cambies la redacción de un día para
            otro. No hace falta cuidar mayúsculas ni espacios.
          </DialogDescription>
        </DialogHeader>

        <form action={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="type">¿En qué situación?</Label>
            <select
              id="type"
              value={type}
              onChange={(e) => setType(e.target.value as KeywordType)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              {TYPES.find((t) => t.value === type)?.hint}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="pattern">Palabra o trozo de frase</Label>
            <Input
              id="pattern"
              name="pattern"
              placeholder={TYPES.find((t) => t.value === type)?.placeholder}
              required
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Ojo con los acentos: «informacion» y «información» se guardan como palabras
              distintas. Si dudas, usa la raíz sin tilde («informaci»).
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Guardando…
                </>
              ) : (
                'Guardar'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
