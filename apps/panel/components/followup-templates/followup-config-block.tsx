'use client';

import { useState, useTransition } from 'react';
import { Clock, Sparkles, MessageCircle, Plus, Pencil, Trash2, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  updateTenantFollowupConfig,
  type TenantFollowupConfigRow,
} from '@/lib/actions/followup-config';
import { IntervalsTimeline } from './intervals-timeline';

interface Props {
  initial: TenantFollowupConfigRow;
  canEdit: boolean;
}

const MAX_EXAMPLE_CHARS = 500;
const MAX_EXAMPLES = 8;

/**
 * Parse del string serializado de followup_voice_examples → array.
 * Formato: cada ejemplo separado por línea en blanco (\n\n) o salto simple.
 * Filtramos vacíos y trim.
 */
function parseExamples(serialized: string | null): string[] {
  if (!serialized || !serialized.trim()) return [];
  return serialized
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Serializa array → string con \n\n entre ejemplos. */
function serializeExamples(arr: string[]): string | null {
  const cleaned = arr.map((s) => s.trim()).filter((s) => s.length > 0);
  if (cleaned.length === 0) return null;
  return cleaned.join('\n\n');
}

export function FollowupConfigBlock({ initial, canEdit }: Props) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [intervals, setIntervals] = useState<number[]>(
    initial.intervalsHours.filter((h) => h >= 1 && h <= 24),
  );
  const [windowStart, setWindowStart] = useState(initial.windowStartHour);
  const [windowEnd, setWindowEnd] = useState(initial.windowEndHour);
  const [autoPersonalize, setAutoPersonalize] = useState(initial.autoPersonalize);
  const [defaultText, setDefaultText] = useState(initial.defaultFollowupText ?? '');
  const [examples, setExamples] = useState<string[]>(
    parseExamples(initial.followupVoiceExamples),
  );
  const [newExample, setNewExample] = useState('');
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editingText, setEditingText] = useState('');
  const [isPending, startTransition] = useTransition();

  const initialExamplesSerialized = initial.followupVoiceExamples ?? '';
  const currentExamplesSerialized = serializeExamples(examples) ?? '';

  const dirty =
    enabled !== initial.enabled ||
    JSON.stringify(intervals) !== JSON.stringify(initial.intervalsHours) ||
    windowStart !== initial.windowStartHour ||
    windowEnd !== initial.windowEndHour ||
    autoPersonalize !== initial.autoPersonalize ||
    defaultText.trim() !== (initial.defaultFollowupText ?? '').trim() ||
    currentExamplesSerialized !== initialExamplesSerialized;

  function onSave() {
    if (windowStart >= windowEnd) {
      toast.error('La hora inicio del horario activo debe ser menor que la hora fin');
      return;
    }
    if (intervals.length === 0 && enabled) {
      toast.error('Añade al menos un seguimiento o desactiva el sistema');
      return;
    }
    startTransition(async () => {
      const r = await updateTenantFollowupConfig({
        enabled,
        intervalsHours: intervals,
        maxFollowupsPerLead: Math.max(1, intervals.length),
        windowStartHour: windowStart,
        windowEndHour: windowEnd,
        autoPersonalize,
        defaultFollowupText: defaultText.trim() || null,
        followupVoiceExamples: serializeExamples(examples),
      });
      if (!r.ok) toast.error(r.error);
      else toast.success('Configuración guardada');
    });
  }

  function handleAddExample() {
    const trimmed = newExample.trim();
    if (!trimmed) return;
    if (trimmed.length > MAX_EXAMPLE_CHARS) {
      toast.error(`Máximo ${MAX_EXAMPLE_CHARS} caracteres por ejemplo`);
      return;
    }
    if (examples.length >= MAX_EXAMPLES) {
      toast.error(`Máximo ${MAX_EXAMPLES} ejemplos`);
      return;
    }
    setExamples((prev) => [...prev, trimmed]);
    setNewExample('');
  }

  function handleStartEdit(idx: number) {
    setEditingIdx(idx);
    setEditingText(examples[idx] ?? '');
  }

  function handleCancelEdit() {
    setEditingIdx(null);
    setEditingText('');
  }

  function handleSaveEdit() {
    if (editingIdx === null) return;
    const trimmed = editingText.trim();
    if (!trimmed) return;
    if (trimmed.length > MAX_EXAMPLE_CHARS) {
      toast.error(`Máximo ${MAX_EXAMPLE_CHARS} caracteres por ejemplo`);
      return;
    }
    setExamples((prev) => prev.map((e, i) => (i === editingIdx ? trimmed : e)));
    setEditingIdx(null);
    setEditingText('');
  }

  function handleDelete(idx: number) {
    setExamples((prev) => prev.filter((_, i) => i !== idx));
    if (editingIdx === idx) {
      setEditingIdx(null);
      setEditingText('');
    }
  }

  function handleNewKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleAddExample();
    }
  }

  const examplesDisabled = !canEdit || !enabled || !autoPersonalize;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="size-4 text-amber-400" />
          Configuración global de seguimientos
          {enabled ? (
            <Badge
              variant="outline"
              className="text-[10px] font-normal text-emerald-500 border-emerald-500/40"
            >
              activo
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] font-normal">
              desactivado
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Cuando un lead deja de responder, el motor le envía hasta N seguimientos
          dentro de las primeras 24h (límite Meta/GHL). Configura cuándo, cuántos y
          cómo se personalizan.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {/* Toggle global */}
        <div className="flex items-center justify-between rounded-md border border-border/40 bg-muted/20 px-3 py-2.5">
          <Label htmlFor="fl-enabled" className="text-sm cursor-pointer">
            Activar seguimientos automáticos
          </Label>
          <Switch
            id="fl-enabled"
            checked={enabled}
            onCheckedChange={setEnabled}
            disabled={!canEdit}
          />
        </div>

        {/* Timeline visual */}
        <div className="flex flex-col gap-2">
          <Label className="text-xs">Cuándo enviar (horas tras último mensaje del lead)</Label>
          <IntervalsTimeline
            intervals={intervals}
            onChange={setIntervals}
            disabled={!canEdit || !enabled}
            maxFollowups={5}
          />
        </div>

        {/* Horario activo */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="win-start" className="text-xs">
              Horario inicio (no enviar antes)
            </Label>
            <Input
              id="win-start"
              type="number"
              min={0}
              max={23}
              value={windowStart}
              onChange={(e) => setWindowStart(Number(e.target.value))}
              disabled={!canEdit || !enabled}
              className="text-xs"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="win-end" className="text-xs">
              Horario fin (no enviar después)
            </Label>
            <Input
              id="win-end"
              type="number"
              min={0}
              max={23}
              value={windowEnd}
              onChange={(e) => setWindowEnd(Number(e.target.value))}
              disabled={!canEdit || !enabled}
              className="text-xs"
            />
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground -mt-3">
          Timezone {initial.windowTimezone}. Si la hora del seguimiento cae fuera del
          horario, se mueve al próximo slot dentro.
        </p>

        {/* Toggle personalizar IA */}
        <div className="flex items-center justify-between rounded-md border border-border/40 bg-muted/20 px-3 py-2.5">
          <div className="flex flex-col">
            <Label htmlFor="auto-personalize" className="text-sm cursor-pointer flex items-center gap-1.5">
              <Sparkles className="size-3.5 text-amber-500" />
              Personalizar Instagram + Facebook con IA
            </Label>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              ON: el motor genera un mensaje único contextual por cada lead usando los
              últimos mensajes de la conversación. OFF: usa el texto fijo de abajo
              igual para todos.
            </p>
          </div>
          <Switch
            id="auto-personalize"
            checked={autoPersonalize}
            onCheckedChange={setAutoPersonalize}
            disabled={!canEdit || !enabled}
          />
        </div>

        {/* Default text fallback */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="default-text" className="text-xs">
            Mensaje predeterminado IG/FB{' '}
            <span className="text-muted-foreground">
              {autoPersonalize
                ? '(fallback si no hay material para personalizar)'
                : '(se enviará igual a todos los leads)'}
            </span>
          </Label>
          <textarea
            id="default-text"
            value={defaultText}
            onChange={(e) => setDefaultText(e.target.value)}
            maxLength={4000}
            placeholder="ej. Hola, ¿pudiste ver mi mensaje? Me gustaría saber si sigues interesado/a 🙂"
            disabled={!canEdit || !enabled}
            className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-xs resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
          />
          <p className="text-[10px] text-muted-foreground">
            Solo aplica a Instagram y Facebook. WhatsApp siempre usa plantillas YCloud
            aprobadas (Meta bloquea texto libre fuera de la ventana 24h).
          </p>
        </div>

        {/* Sprint Iota.2 — Voice tuning: ejemplos del trainer (lista) */}
        <div className="flex flex-col gap-2 rounded-md border border-border/40 bg-muted/10 px-3 py-2.5">
          <Label className="text-sm flex items-center gap-1.5">
            <MessageCircle className="size-3.5 text-sky-400" />
            Ejemplos de tu voz{' '}
            <span className="text-[10px] text-muted-foreground font-normal">
              (opcional · {examples.length}/{MAX_EXAMPLES})
            </span>
          </Label>
          <p className="text-[10px] text-muted-foreground">
            Añade ejemplos individuales de cómo TÚ escribirías un followup. La IA
            aprenderá tu tono: extensión, ritmo, expresiones, signos. Cada ejemplo
            se guarda por separado y se inyecta como referencia. Si lo dejas vacío,
            la IA usa el estilo de tu coach + ejemplos genéricos.
          </p>

          {/* Input nuevo ejemplo */}
          <div className="flex flex-col gap-1.5 mt-1">
            <textarea
              value={newExample}
              onChange={(e) => setNewExample(e.target.value)}
              onKeyDown={handleNewKeyDown}
              maxLength={MAX_EXAMPLE_CHARS}
              placeholder={
                examples.length === 0
                  ? 'Ej: Hola Marta, te escribo porque me quedé pensando en lo del bloqueo con la dieta. ¿Te late agendar 10 min y le damos forma?'
                  : 'Añade otro ejemplo en tu propio estilo…'
              }
              disabled={examplesDisabled || examples.length >= MAX_EXAMPLES}
              rows={2}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs leading-snug resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-muted-foreground">
                {newExample.length}/{MAX_EXAMPLE_CHARS} chars · <kbd className="px-1 rounded bg-muted text-[9px]">Ctrl+Enter</kbd> para añadir
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleAddExample}
                disabled={examplesDisabled || newExample.trim() === '' || examples.length >= MAX_EXAMPLES}
                className="h-7 text-[11px]"
              >
                <Plus className="size-3 mr-1" />
                Añadir ejemplo
              </Button>
            </div>
          </div>

          {/* Lista de ejemplos */}
          {examples.length > 0 ? (
            <ul className="flex flex-col gap-1.5 mt-1">
              {examples.map((example, idx) => {
                const isEditing = editingIdx === idx;
                return (
                  <li
                    key={idx}
                    className="flex items-start gap-2 rounded-md border border-border/40 bg-background/50 px-2.5 py-2"
                  >
                    <span className="text-[10px] font-mono text-muted-foreground mt-1 shrink-0">
                      {idx + 1}.
                    </span>
                    {isEditing ? (
                      <div className="flex-1 flex flex-col gap-1.5">
                        <textarea
                          value={editingText}
                          onChange={(e) => setEditingText(e.target.value)}
                          maxLength={MAX_EXAMPLE_CHARS}
                          rows={3}
                          autoFocus
                          className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs leading-snug resize-y"
                        />
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] text-muted-foreground">
                            {editingText.length}/{MAX_EXAMPLE_CHARS}
                          </span>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={handleCancelEdit}
                              className="h-6 text-[10px] px-2"
                            >
                              <X className="size-2.5 mr-0.5" />
                              Cancelar
                            </Button>
                            <Button
                              size="sm"
                              onClick={handleSaveEdit}
                              disabled={editingText.trim() === ''}
                              className="h-6 text-[10px] px-2"
                            >
                              <Check className="size-2.5 mr-0.5" />
                              Guardar
                            </Button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="flex-1 text-xs leading-snug whitespace-pre-wrap break-words text-foreground/85">
                          {example}
                        </p>
                        {!examplesDisabled ? (
                          <div className="flex gap-0.5 shrink-0">
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => handleStartEdit(idx)}
                              className="h-6 w-6 p-0"
                              title="Editar"
                            >
                              <Pencil className="size-3" />
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDelete(idx)}
                              className="h-6 w-6 p-0 text-muted-foreground hover:text-rose-500"
                              title="Eliminar"
                            >
                              <Trash2 className="size-3" />
                            </Button>
                          </div>
                        ) : null}
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : null}

          <p className="text-[10px] text-muted-foreground">
            Solo se usa si "Personalizar IG/FB con IA" está activo. Recuerda pulsar
            <strong> Guardar configuración </strong>al final para persistir los cambios.
          </p>
        </div>

        {canEdit ? (
          <div className="flex justify-end pt-2 border-t border-border/40">
            <Button onClick={onSave} disabled={isPending || !dirty} size="sm">
              {isPending ? 'Guardando…' : 'Guardar configuración'}
            </Button>
          </div>
        ) : (
          <p className="text-[10px] text-muted-foreground italic">
            Solo el owner puede modificar esta configuración.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
