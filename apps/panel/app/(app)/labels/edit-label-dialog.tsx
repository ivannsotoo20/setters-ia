'use client';

import { useState, useTransition } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ColorPicker } from '@/components/labels/color-picker';
import { SystemBadge } from '@/components/labels/system-badge';
import { updateLabel, type DestinationBucket, type LabelRow } from '@/lib/actions/labels';

interface MemberOption {
  userId: string;
  email: string;
  fullName: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label: LabelRow;
  members: MemberOption[];
}

const NO_BUCKET_VALUE = '__none__';
const NO_ASSIGNEE_VALUE = '__none__';

export function EditLabelDialog({ open, onOpenChange, label, members }: Props) {
  const [name, setName] = useState(label.name);
  const [color, setColor] = useState(label.color);
  const [description, setDescription] = useState(label.description ?? '');
  const [destinationBucket, setDestinationBucket] = useState<DestinationBucket | null>(
    label.destinationBucket,
  );
  const [pauseAi, setPauseAi] = useState(label.pauseAiOnApply);
  const [resumeAi, setResumeAi] = useState(label.resumeAiOnApply);
  const [autoAssignTo, setAutoAssignTo] = useState<string | null>(label.autoAssignTo);
  const [pending, startTransition] = useTransition();

  const onSubmit = () => {
    startTransition(async () => {
      const patch: Parameters<typeof updateLabel>[0]['patch'] = {
        color,
        description: description.trim() || null,
        pauseAiOnApply: pauseAi,
        resumeAiOnApply: resumeAi,
        autoAssignTo,
      };
      // Solo permitir cambiar nombre + bucket si NO es system label.
      if (!label.isSystem) {
        if (name.trim() !== label.name) patch.name = name.trim();
        if (destinationBucket !== label.destinationBucket) {
          patch.destinationBucket = destinationBucket;
        }
      }
      const res = await updateLabel({ labelId: label.id, patch });
      if (!res.ok) {
        toast.error(`Error: ${res.error}`);
      } else {
        toast.success('Etiqueta actualizada');
        onOpenChange(false);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Editar etiqueta {label.isSystem ? <SystemBadge /> : null}
          </DialogTitle>
          <DialogDescription>
            {label.isSystem
              ? 'El nombre y el bucket están bloqueados (etiqueta del sistema). Color, descripción y acciones sí son editables.'
              : 'Modifica nombre, color, bucket de destino y acciones automáticas.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-label-name">Nombre</Label>
            <Input
              id="edit-label-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              disabled={label.isSystem}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Color</Label>
            <ColorPicker value={color} onChange={setColor} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-label-desc">Descripción</Label>
            <Input
              id="edit-label-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={200}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-label-bucket">Mover a bucket</Label>
            <Select
              value={destinationBucket ?? NO_BUCKET_VALUE}
              onValueChange={(v) =>
                setDestinationBucket(v === NO_BUCKET_VALUE ? null : (v as DestinationBucket))
              }
              disabled={label.isSystem}
            >
              <SelectTrigger id="edit-label-bucket">
                <SelectValue placeholder="Sin bucket" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_BUCKET_VALUE}>Sin bucket (solo visual)</SelectItem>
                <SelectItem value="chats">Chats (activos)</SelectItem>
                <SelectItem value="hot">Hot Leads</SelectItem>
                <SelectItem value="done">Completados</SelectItem>
                <SelectItem value="bought">Comprados</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2 border-t pt-3">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Acciones automáticas</p>
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="edit-label-pause" className="text-sm font-normal cursor-pointer flex-1">
                Pausar IA al aplicar
              </Label>
              <Switch id="edit-label-pause" checked={pauseAi} onCheckedChange={setPauseAi} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="edit-label-resume" className="text-sm font-normal cursor-pointer flex-1">
                Reactivar IA al aplicar
              </Label>
              <Switch id="edit-label-resume" checked={resumeAi} onCheckedChange={setResumeAi} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-label-assign">Auto-asignar a</Label>
            <Select
              value={autoAssignTo ?? NO_ASSIGNEE_VALUE}
              onValueChange={(v) =>
                setAutoAssignTo(v === NO_ASSIGNEE_VALUE ? null : v)
              }
            >
              <SelectTrigger id="edit-label-assign">
                <SelectValue placeholder="Sin auto-asignación" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_ASSIGNEE_VALUE}>Sin auto-asignación</SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.userId} value={m.userId}>
                    {m.fullName ?? m.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button type="button" onClick={onSubmit} disabled={pending}>
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
