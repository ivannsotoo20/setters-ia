'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, Save, RotateCcw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { saveTrainerPreferences } from '@/lib/actions/prompts';
import {
  type TrainerPreferences,
  DEFAULT_TRAINER_PREFERENCES,
} from '@/lib/trainer-prefs-serializer';

interface Props {
  tenantId: number;
  initial: TrainerPreferences;
}

const EMOJI_DENSITY_LABELS = [
  { value: 0, label: 'Casi sin emojis', desc: 'máximo 1 cada 3-4 mensajes' },
  { value: 1, label: 'Algunos', desc: '1 emoji por mensaje, contextual' },
  { value: 2, label: 'Moderada', desc: 'expresivos pero no saturados (default)' },
  { value: 3, label: 'Abundante', desc: '2-4 por mensaje, muy expresivos' },
];

const QUESTIONS_LABELS = [
  { value: 0, label: '0 preguntas extra', desc: 'flujo estándar del Cerebro' },
  { value: 1, label: '+1 pregunta', desc: 'una pregunta adicional de matiz' },
  { value: 2, label: '+2 preguntas', desc: 'dos preguntas adicionales de matiz' },
];

export function PreferencesForm({ tenantId, initial }: Props) {
  const router = useRouter();
  const [prefs, setPrefs] = useState<TrainerPreferences>(initial);
  const [saving, startSave] = useTransition();

  const isDirty = JSON.stringify(prefs) !== JSON.stringify(initial);
  const isAllDefault = JSON.stringify(prefs) === JSON.stringify(DEFAULT_TRAINER_PREFERENCES);

  function update<K extends keyof TrainerPreferences>(key: K, value: TrainerPreferences[K]) {
    setPrefs((p) => ({ ...p, [key]: value }));
  }

  function handleResetDefaults() {
    setPrefs(DEFAULT_TRAINER_PREFERENCES);
  }

  function handleSave() {
    startSave(async () => {
      const r = await saveTrainerPreferences({ tenantId, preferences: prefs });
      if (r.ok) {
        toast.success('Preferencias guardadas. Aplican desde el siguiente turno del motor.');
        router.refresh();
      } else {
        toast.error(`Error: ${r.error}`);
      }
    });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Estilo */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Estilo</CardTitle>
          <CardDescription>Cómo se ve el mensaje del setter en pantalla.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-0.5">
              <Label htmlFor="doubleQ" className="text-sm">
                Doble interrogación final
              </Label>
              <p className="text-xs text-muted-foreground">
                Cuando una frase termina en pregunta, usar <code className="font-mono">??</code> en
                lugar de <code className="font-mono">?</code> (estilo más expresivo).
              </p>
            </div>
            <Switch
              id="doubleQ"
              checked={prefs.doubleQuestionMark}
              onCheckedChange={(v) => update('doubleQuestionMark', v)}
            />
          </div>

          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-0.5">
              <Label htmlFor="ackVoice" className="text-sm">
                Reconocer audios del lead
              </Label>
              <p className="text-xs text-muted-foreground">
                Cuando el lead envía un audio, mencionarlo explícitamente al inicio de la respuesta
                (&quot;escuché tu audio…&quot;).
              </p>
            </div>
            <Switch
              id="ackVoice"
              checked={prefs.preferVoiceNotesAcknowledgment}
              onCheckedChange={(v) => update('preferVoiceNotesAcknowledgment', v)}
            />
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-sm">Densidad de emojis</Label>
              <Badge variant="outline" className="font-mono text-xs">
                {EMOJI_DENSITY_LABELS[prefs.emojiDensity]!.label}
              </Badge>
            </div>
            <Slider
              value={[prefs.emojiDensity]}
              min={0}
              max={3}
              step={1}
              onValueChange={(v) => {
                const n = v[0];
                if (n != null) {
                  update('emojiDensity', n as 0 | 1 | 2 | 3);
                }
              }}
            />
            <div className="flex items-center justify-between text-[10px] text-muted-foreground tabular-nums">
              <span>Casi sin</span>
              <span>Algunos</span>
              <span>Moderada</span>
              <span>Abundante</span>
            </div>
            <p className="text-xs text-muted-foreground italic">
              {EMOJI_DENSITY_LABELS[prefs.emojiDensity]!.desc}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Cualificación */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cualificación</CardTitle>
          <CardDescription>
            Ajustes finos sobre cómo el setter cualifica antes de proponer la llamada.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <Label className="text-sm">Preguntas extra antes de la cita</Label>
            <p className="text-xs text-muted-foreground">
              Antes de proponer la llamada, pedir al setter que haga preguntas adicionales para
              reforzar el contexto del lead. NO son preguntas obvias ya respondidas — busca matiz
              (&quot;¿desde cuándo te pasa?&quot;, &quot;¿qué has probado antes?&quot;).
            </p>
            <div className="flex items-center gap-2 mt-2">
              {QUESTIONS_LABELS.map((q) => (
                <Button
                  key={q.value}
                  type="button"
                  size="sm"
                  variant={prefs.extraQuestionsBeforeCall === q.value ? 'default' : 'outline'}
                  onClick={() => update('extraQuestionsBeforeCall', q.value as 0 | 1 | 2)}
                  className="flex-1"
                >
                  {q.label}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground italic">
              {QUESTIONS_LABELS[prefs.extraQuestionsBeforeCall]!.desc}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Acciones (full width) */}
      <Card className="lg:col-span-2">
        <CardContent className="p-4 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 text-xs">
            {isAllDefault ? (
              <Badge variant="outline" className="text-muted-foreground">
                Todos los valores en defecto
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="border-emerald-500/40 text-emerald-400 bg-emerald-500/5"
              >
                Personalizado
              </Badge>
            )}
            {isDirty ? (
              <span className="text-amber-400">⚠ Cambios sin guardar</span>
            ) : (
              <span className="text-muted-foreground">Sin cambios pendientes</span>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleResetDefaults}
              disabled={saving || isAllDefault}
            >
              <RotateCcw className="size-3.5" />
              Volver a defectos
            </Button>
            <Button type="button" size="sm" onClick={handleSave} disabled={saving || !isDirty}>
              {saving ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Guardando…
                </>
              ) : (
                <>
                  <Save className="size-3.5" />
                  Guardar preferencias
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
