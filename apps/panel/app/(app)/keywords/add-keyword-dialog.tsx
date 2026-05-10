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

const TYPES: { value: KeywordType; label: string; hint: string }[] = [
  {
    value: 'bienvenida',
    label: 'Bienvenida (IG/FB)',
    hint: 'Saludo manual al primer contacto en chat IG/FB. Ej: "Hola! Gracias por escribir, soy Iván".',
  },
  {
    value: 'lm',
    label: 'Lead Magnet (IG/FB)',
    hint: 'Recurso enviado automáticamente vía GHL Workflow. Ej: "Aquí tienes la guía gratis".',
  },
  {
    value: 'inbound',
    label: 'Inbound auto (IG/FB)',
    hint: 'Auto-respuesta del trainer al primer DM. Ej: "Gracias por escribir, en breve te contestamos".',
  },
  {
    value: 'wa_open',
    label: 'WhatsApp open (gate inbound)',
    hint: 'Gate de WhatsApp inbound cuando /settings/whatsapp está en modo "keyword". Ej: "hola", "INFO", "me interesa".',
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
      toast.success(`Keyword #${result.data?.id} creada`);
      setOpen(false);
      setType('bienvenida');
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" />
          Añadir keyword
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuevo patrón</DialogTitle>
          <DialogDescription>
            Cuando llegue un mensaje OUTBOUND desde tu chat, el motor lo
            normaliza (lowercase + sin espacios) y comprueba si este patrón
            aparece como substring. Pon un trozo característico (no toda la
            frase) para que matche aunque el texto exacto varíe.
          </DialogDescription>
        </DialogHeader>

        <form action={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="type">Tipo</Label>
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
            <Label htmlFor="pattern">Patrón (substring)</Label>
            <Input
              id="pattern"
              name="pattern"
              placeholder="Hola! Gracias por escribir"
              required
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              No tiene que ser exacto. Match case-insensitive, ignora espacios.
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
