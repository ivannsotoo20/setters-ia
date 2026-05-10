'use client';

import { useState, useTransition } from 'react';
import { Plus, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  createFollowupTemplate,
  updateFollowupTemplate,
  type FollowupTemplateRow,
} from '@/lib/actions/followups';

interface Props {
  mode: 'create' | 'edit';
  template?: FollowupTemplateRow;
  trigger?: React.ReactNode;
}

export function FollowupTemplateFormDialog({ mode, template, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(template?.name ?? '');
  const [body, setBody] = useState(template?.body ?? '');
  const [description, setDescription] = useState(template?.description ?? '');
  const [isPending, startTransition] = useTransition();

  function reset() {
    if (mode === 'create') {
      setName('');
      setBody('');
      setDescription('');
    } else if (template) {
      setName(template.name);
      setBody(template.body);
      setDescription(template.description ?? '');
    }
  }

  function onSubmit() {
    const trimmedName = name.trim();
    const trimmedBody = body.trim();
    if (!trimmedName || !trimmedBody) {
      toast.error('Nombre y cuerpo del mensaje son obligatorios');
      return;
    }

    startTransition(async () => {
      const r =
        mode === 'create'
          ? await createFollowupTemplate({
              name: trimmedName,
              body: trimmedBody,
              description: description.trim() || null,
            })
          : await updateFollowupTemplate({
              templateId: template!.id,
              patch: {
                name: trimmedName,
                body: trimmedBody,
                description: description.trim() || null,
              },
            });
      if (!r.ok) {
        toast.error(r.error);
      } else {
        toast.success(mode === 'create' ? 'Plantilla creada' : 'Plantilla actualizada');
        setOpen(false);
      }
    });
  }

  const charsLeft = 4000 - body.length;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        {trigger ??
          (mode === 'create' ? (
            <Button size="sm">
              <Plus className="size-3.5 mr-1" />
              Nueva plantilla
            </Button>
          ) : (
            <Button variant="ghost" size="sm" className="h-7 px-2">
              <Pencil className="size-3.5" />
            </Button>
          ))}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? 'Nueva plantilla' : 'Editar plantilla'}
          </DialogTitle>
          <DialogDescription>
            Reutilizable al programar followups desde cualquier conversación.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name" className="text-xs">
              Nombre <span className="text-muted-foreground">(único, max 80)</span>
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              placeholder="ej. Reminder cita 24h"
              className="text-xs"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description" className="text-xs">
              Descripción <span className="text-muted-foreground">(opcional)</span>
            </Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={200}
              placeholder="ej. Reminder amistoso 24h antes de la llamada"
              className="text-xs"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="body" className="text-xs">
              Mensaje{' '}
              <span className={charsLeft < 0 ? 'text-rose-500' : 'text-muted-foreground'}>
                ({charsLeft} restantes)
              </span>
            </Label>
            <textarea
              id="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={4000}
              placeholder="Texto del mensaje. Usa lenguaje natural, evita variables {{}}."
              className="w-full min-h-[140px] rounded-md border border-input bg-background px-3 py-2 text-xs resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={isPending}>
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={onSubmit}
            disabled={isPending || !name.trim() || !body.trim() || charsLeft < 0}
          >
            {isPending ? 'Guardando…' : mode === 'create' ? 'Crear' : 'Guardar cambios'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
