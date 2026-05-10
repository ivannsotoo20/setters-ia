'use client';

import { useState, useTransition } from 'react';
import { Plus } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { WIDGET_CATALOG } from '@/lib/widget-catalog';
import { createWidget } from '@/lib/actions/dashboard-widgets';
import type { ChannelKey } from '@/lib/dashboard-query';

const CHANNELS: Array<{ key: ChannelKey | 'all'; label: string }> = [
  { key: 'all', label: 'Todos los canales' },
  { key: 'wa', label: 'WhatsApp' },
  { key: 'fb', label: 'Facebook' },
  { key: 'ig-in', label: 'Instagram inbound' },
  { key: 'ig-out', label: 'Instagram outbound' },
];

export function AddWidgetDialog() {
  const [open, setOpen] = useState(false);
  const [metricKey, setMetricKey] = useState<string>('');
  const [channel, setChannel] = useState<ChannelKey | 'all'>('all');
  const [isPending, startTransition] = useTransition();

  function reset() {
    setMetricKey('');
    setChannel('all');
  }

  function onSubmit() {
    if (!metricKey) {
      toast.error('Selecciona una métrica');
      return;
    }
    startTransition(async () => {
      const r = await createWidget({
        metricKey,
        filter: channel === 'all' ? {} : { channel },
      });
      if (!r.ok) {
        toast.error(r.error);
      } else {
        toast.success('Widget añadido');
        reset();
        setOpen(false);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 text-xs">
          <Plus className="size-3.5 mr-1" />
          Añadir widget
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Añadir widget al dashboard</DialogTitle>
          <DialogDescription>
            Elige una métrica del catálogo y opcionalmente filtra por canal.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="metric" className="text-xs">
              Métrica
            </Label>
            <Select value={metricKey} onValueChange={setMetricKey}>
              <SelectTrigger id="metric" className="text-xs">
                <SelectValue placeholder="Selecciona una métrica" />
              </SelectTrigger>
              <SelectContent>
                {WIDGET_CATALOG.map((m) => (
                  <SelectItem key={m.key} value={m.key} className="text-xs">
                    <div className="flex flex-col items-start">
                      <span className="font-medium">{m.label}</span>
                      <span className="text-[10px] text-muted-foreground">{m.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="channel" className="text-xs">
              Canal
            </Label>
            <Select value={channel} onValueChange={(v) => setChannel(v as ChannelKey | 'all')}>
              <SelectTrigger id="channel" className="text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CHANNELS.map((c) => (
                  <SelectItem key={c.key} value={c.key} className="text-xs">
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={isPending}>
            Cancelar
          </Button>
          <Button size="sm" onClick={onSubmit} disabled={isPending || !metricKey}>
            {isPending ? 'Añadiendo…' : 'Añadir'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
