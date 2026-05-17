'use client';

import { useState, useTransition, useEffect } from 'react';
import { Plus, Pencil, Sparkles } from 'lucide-react';
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
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  createFollowupTemplate,
  updateFollowupTemplate,
  type ChannelKind,
  type FollowupTemplateRow,
} from '@/lib/actions/followups';

interface CreateProps {
  mode: 'create';
  channelKind: 'instagram_dm' | 'facebook_messenger'; // WA solo via sync YCloud
  trigger?: React.ReactNode;
}

interface EditProps {
  mode: 'edit';
  template: FollowupTemplateRow;
  trigger?: React.ReactNode;
}

type Props = CreateProps | EditProps;

const CHANNEL_LABELS: Record<ChannelKind, string> = {
  whatsapp: 'WhatsApp',
  instagram_dm: 'Instagram',
  facebook_messenger: 'Facebook',
};

export function FollowupTemplateFormDialog(props: Props) {
  const isCreate = props.mode === 'create';
  const channelKind = isCreate ? props.channelKind : props.template.channelKind;
  const initial = isCreate
    ? { name: '', body: '', description: '', aiPersonalize: false, aiGuide: '' }
    : {
        name: props.template.name,
        body: props.template.body ?? '',
        description: props.template.description ?? '',
        aiPersonalize: props.template.aiPersonalize,
        aiGuide: props.template.aiGuide ?? '',
      };

  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initial.name);
  const [body, setBody] = useState(initial.body);
  const [description, setDescription] = useState(initial.description);
  const [aiPersonalize, setAiPersonalize] = useState(initial.aiPersonalize);
  const [aiGuide, setAiGuide] = useState(initial.aiGuide);
  const [isPending, startTransition] = useTransition();

  // Reset si cambian props del template (edit dialog reusable)
  useEffect(() => {
    if (open) return;
    setName(initial.name);
    setBody(initial.body);
    setDescription(initial.description);
    setAiPersonalize(initial.aiPersonalize);
    setAiGuide(initial.aiGuide);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props]);

  const isWA = channelKind === 'whatsapp';
  const isYCloudSynced = !isCreate && props.template.provider !== 'manual';

  const charsLeft = 4000 - body.length;
  const guideLeft = 2000 - aiGuide.length;

  function onSubmit() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error('Nombre obligatorio');
      return;
    }
    if (aiPersonalize && !aiGuide.trim()) {
      toast.error('Guía IA obligatoria si AI-personalize está activado');
      return;
    }
    if (!aiPersonalize && !body.trim()) {
      toast.error('Mensaje obligatorio (o activa AI-personalize)');
      return;
    }

    startTransition(async () => {
      const r = isCreate
        ? await createFollowupTemplate({
            name: trimmedName,
            channelKind: props.channelKind,
            body: aiPersonalize ? null : body.trim(),
            description: description.trim() || null,
            aiPersonalize,
            aiGuide: aiPersonalize ? aiGuide.trim() : null,
          })
        : await updateFollowupTemplate({
            templateId: props.template.id,
            patch: {
              name: trimmedName,
              body: aiPersonalize ? null : body.trim(),
              description: description.trim() || null,
              aiPersonalize,
              aiGuide: aiPersonalize ? aiGuide.trim() : null,
            },
          });
      if (!r.ok) toast.error(r.error);
      else {
        toast.success(isCreate ? 'Plantilla creada' : 'Plantilla actualizada');
        setOpen(false);
      }
    });
  }

  const triggerEl =
    props.trigger ??
    (isCreate ? (
      <Button size="sm">
        <Plus className="size-3.5 mr-1" />
        Nueva plantilla
      </Button>
    ) : (
      <Button variant="ghost" size="sm" className="h-7 px-2">
        <Pencil className="size-3.5" />
      </Button>
    ));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{triggerEl}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isCreate ? 'Nueva plantilla' : 'Editar plantilla'}
            <Badge variant="outline" className="text-[10px] font-normal">
              {CHANNEL_LABELS[channelKind]}
            </Badge>
            {isYCloudSynced ? (
              <Badge variant="outline" className="text-[10px] font-normal text-success border-success/40">
                YCloud
              </Badge>
            ) : null}
          </DialogTitle>
          <DialogDescription>
            {isWA
              ? 'Plantillas WhatsApp se sincronizan desde YCloud (botón "Sincronizar" en la lista). Aquí solo puedes editar el campo descripción.'
              : 'Reutilizable al programar followups en este canal. Activa AI-personalize para que el motor genere mensaje contextual al enviar.'}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name" className="text-xs">
              Nombre <span className="text-muted-foreground">(único por canal, max 80)</span>
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              disabled={isYCloudSynced}
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
              placeholder="Para qué la usas internamente"
              className="text-xs"
            />
          </div>

          {!isWA ? (
            <div className="flex items-center justify-between rounded-md border border-border/40 bg-muted/20 px-2.5 py-2">
              <div className="flex items-center gap-2">
                <Sparkles className="size-3.5 text-warning" />
                <Label htmlFor="ai-personalize" className="text-xs cursor-pointer">
                  Personalizar con IA al enviar
                </Label>
              </div>
              <Switch
                id="ai-personalize"
                checked={aiPersonalize}
                onCheckedChange={setAiPersonalize}
              />
            </div>
          ) : null}

          {aiPersonalize ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="guide" className="text-xs flex items-center gap-1">
                Guía para la IA{' '}
                <span className={guideLeft < 0 ? 'text-destructive' : 'text-muted-foreground'}>
                  ({guideLeft} restantes)
                </span>
              </Label>
              <textarea
                id="guide"
                value={aiGuide}
                onChange={(e) => setAiGuide(e.target.value)}
                maxLength={2000}
                placeholder="ej. 'Recordar al lead la propuesta de llamada que se le hizo. Tono cercano y referirse a algo concreto que dijo en la conversación. Saludar por su nombre.'"
                className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-xs resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <p className="text-[10px] text-muted-foreground">
                El motor leerá los últimos mensajes de la conversación + datos del lead y
                generará un mensaje contextual siguiendo esta guía.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="body" className="text-xs">
                Mensaje{' '}
                <span className={charsLeft < 0 ? 'text-destructive' : 'text-muted-foreground'}>
                  ({charsLeft} restantes)
                </span>
              </Label>
              <textarea
                id="body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={4000}
                disabled={isWA && isYCloudSynced}
                placeholder={
                  isWA ? 'Cuerpo controlado por YCloud — no editable aquí' : 'Texto del mensaje'
                }
                className="w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-xs resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={isPending}>
            Cancelar
          </Button>
          <Button size="sm" onClick={onSubmit} disabled={isPending || !name.trim()}>
            {isPending ? 'Guardando…' : isCreate ? 'Crear' : 'Guardar cambios'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
