'use client';

import { useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import type {
  TriggerType,
  TriggerWho,
  RuleRow,
} from '@/lib/actions/label-rules';

interface Props {
  initial?: Partial<RuleRow>;
  pending: boolean;
  onSubmit: (input: {
    triggerType: TriggerType;
    triggerWho: TriggerWho;
    triggerValue: Record<string, unknown>;
    isActive: boolean;
  }) => void;
  onCancel: () => void;
}

const STUB_TYPES: ReadonlySet<TriggerType> = new Set([
  'attachment',
  'product',
  'comment_keyword',
]);

/**
 * Form para crear o editar una regla (discriminated por trigger_type).
 * - text_contains / text_exact: input texto.
 * - inactivity_hours: number (1-8760).
 * - attachment: stub (UI presente, motor ignora hasta sprint posterior).
 * - product / comment_keyword: stubs igual.
 */
export function RuleBuilder({ initial, pending, onSubmit, onCancel }: Props) {
  const [triggerType, setTriggerType] = useState<TriggerType>(
    initial?.triggerType ?? 'text_contains',
  );
  const [triggerWho, setTriggerWho] = useState<TriggerWho>(
    initial?.triggerWho ?? 'lead',
  );
  const [textValue, setTextValue] = useState<string>(
    typeof initial?.triggerValue?.text === 'string' ? initial.triggerValue.text : '',
  );
  const [hoursValue, setHoursValue] = useState<number>(
    typeof initial?.triggerValue?.hours === 'number' ? initial.triggerValue.hours : 24,
  );
  const [isActive, setIsActive] = useState<boolean>(
    initial?.isActive !== false,
  );

  const isStub = STUB_TYPES.has(triggerType);
  const canSubmit =
    !pending &&
    !isStub &&
    ((triggerType === 'text_contains' || triggerType === 'text_exact'
      ? textValue.trim().length > 0
      : true) &&
      (triggerType === 'inactivity_hours'
        ? hoursValue >= 1 && hoursValue <= 8760
        : true));

  const handleSubmit = () => {
    if (!canSubmit) return;
    let triggerValue: Record<string, unknown> = {};
    if (triggerType === 'text_contains' || triggerType === 'text_exact') {
      triggerValue = { text: textValue.trim() };
    } else if (triggerType === 'inactivity_hours') {
      triggerValue = { hours: Math.floor(hoursValue) };
    }
    onSubmit({ triggerType, triggerWho, triggerValue, isActive });
  };

  return (
    <div className="flex flex-col gap-3 border border-border rounded-md p-3 bg-muted/20">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="rule-type" className="text-xs">Tipo de trigger</Label>
          <Select
            value={triggerType}
            onValueChange={(v) => setTriggerType(v as TriggerType)}
          >
            <SelectTrigger id="rule-type" className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="text_contains">Texto contiene</SelectItem>
              <SelectItem value="text_exact">Texto exacto</SelectItem>
              <SelectItem value="inactivity_hours">Inactividad (horas)</SelectItem>
              <SelectItem value="attachment" disabled>
                Adjunto (próximamente)
              </SelectItem>
              <SelectItem value="product" disabled>
                Producto (próximamente)
              </SelectItem>
              <SelectItem value="comment_keyword" disabled>
                Comentario (próximamente)
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="rule-who" className="text-xs">Aplicar cuando habla</Label>
          <Select
            value={triggerWho}
            onValueChange={(v) => setTriggerWho(v as TriggerWho)}
            disabled={triggerType === 'inactivity_hours'}
          >
            <SelectTrigger id="rule-who" className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="lead">Solo el lead</SelectItem>
              <SelectItem value="trainer">Solo el trainer</SelectItem>
              <SelectItem value="any">Cualquiera</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {(triggerType === 'text_contains' || triggerType === 'text_exact') && (
        <div className="flex flex-col gap-1">
          <Label htmlFor="rule-text" className="text-xs">
            {triggerType === 'text_contains' ? 'Texto a buscar (substring)' : 'Texto exacto'}
          </Label>
          <Input
            id="rule-text"
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            placeholder={
              triggerType === 'text_contains'
                ? 'Ej: precio, caro, coste'
                : 'Ej: stop'
            }
            maxLength={200}
            className="h-8 text-sm"
          />
          <p className="text-[10px] text-muted-foreground">
            {triggerType === 'text_contains'
              ? 'Match si el mensaje contiene esta palabra (lowercase, sin espacios extra).'
              : 'Match si el mensaje es exactamente este texto.'}
          </p>
        </div>
      )}

      {triggerType === 'inactivity_hours' && (
        <div className="flex flex-col gap-1">
          <Label htmlFor="rule-hours" className="text-xs">Horas sin respuesta</Label>
          <Input
            id="rule-hours"
            type="number"
            min={1}
            max={8760}
            value={hoursValue}
            onChange={(e) => setHoursValue(Number(e.target.value))}
            className="h-8 text-sm w-24"
          />
          <p className="text-[10px] text-muted-foreground">
            La regla se evalúa cada 1h. Si la conversación lleva &gt;= {hoursValue}h
            sin último mensaje, aplica la etiqueta. Rango: 1-8760 (1 año).
          </p>
        </div>
      )}

      {isStub && (
        <p className="text-[11px] text-amber-400 italic">
          Este tipo de trigger está disponible en el formulario pero el motor aún no lo
          ejecuta (próximo sprint). La regla se guarda inactiva.
        </p>
      )}

      <div className="flex items-center justify-between gap-2 pt-1 border-t border-border">
        <div className="flex items-center gap-2">
          <Switch id="rule-active" checked={isActive} onCheckedChange={setIsActive} />
          <Label htmlFor="rule-active" className="text-xs cursor-pointer">
            Regla activa
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {pending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Save className="size-3.5" />
            )}
            {initial?.id ? 'Guardar' : 'Crear regla'}
          </Button>
        </div>
      </div>
    </div>
  );
}
