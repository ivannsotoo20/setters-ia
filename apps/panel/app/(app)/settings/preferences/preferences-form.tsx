'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, Save, RotateCcw, Mail, Phone, User, MessageSquare, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { saveTrainerPreferences } from '@/lib/actions/prompts';
import {
  type TrainerPreferences,
  DEFAULT_TRAINER_PREFERENCES,
  isValidEmail,
  normalizePhoneE164,
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

const MAX_INSTRUCTIONS = 4000;
const WARN_INSTRUCTIONS = 3500;

const CUSTOM_INSTRUCTIONS_PLACEHOLDER = `Ejemplos de buenas instrucciones (escribe en lenguaje natural):

• "Si pregunta por la dirección de la academia, di que está en Calle Mayor 42, Madrid."

• "Cuando hablen del libro de marketing digital, menciona que tengo 30% descuento esta semana."

• "Usa siempre tono formal con leads del nicho corporativo."

• "Menciona el caso de éxito de Juan cuando pregunten por resultados (perdió 12kg en 3 meses)."

Estas instrucciones se aplican EN ADICIÓN al Cerebro y al Coach, sin contradecirlos.`;

export function PreferencesForm({ tenantId, initial }: Props) {
  const router = useRouter();
  const [prefs, setPrefs] = useState<TrainerPreferences>(initial);
  const [emailRaw, setEmailRaw] = useState(initial.trainerEmail ?? '');
  const [phoneRaw, setPhoneRaw] = useState(initial.trainerPhone ?? '');
  const [nameRaw, setNameRaw] = useState(initial.trainerName ?? '');
  const [instructionsRaw, setInstructionsRaw] = useState(initial.customInstructions ?? '');
  const [saving, startSave] = useTransition();

  // Validaciones cliente
  const emailValid = emailRaw === '' || isValidEmail(emailRaw);
  const phoneNormalized = normalizePhoneE164(phoneRaw);
  const phoneValid = phoneRaw === '' || phoneNormalized !== null;
  const instructionsLength = instructionsRaw.length;
  const instructionsTooLong = instructionsLength > MAX_INSTRUCTIONS;

  // Building del objeto final desde inputs
  const finalPrefs: TrainerPreferences = {
    ...prefs,
    trainerEmail: emailRaw === '' ? null : (emailValid ? emailRaw.trim().toLowerCase() : prefs.trainerEmail),
    trainerPhone: phoneRaw === '' ? null : phoneNormalized,
    trainerName: nameRaw.trim() === '' ? null : nameRaw.trim(),
    customInstructions: instructionsRaw.trim() === '' ? null : instructionsRaw,
  };

  const isDirty = JSON.stringify(finalPrefs) !== JSON.stringify(initial);
  const isAllDefault = JSON.stringify(finalPrefs) === JSON.stringify(DEFAULT_TRAINER_PREFERENCES);
  const canSave =
    isDirty && !instructionsTooLong && (emailRaw === '' || emailValid) && (phoneRaw === '' || phoneValid);

  function update<K extends keyof TrainerPreferences>(key: K, value: TrainerPreferences[K]) {
    setPrefs((p) => ({ ...p, [key]: value }));
  }

  function handleResetDefaults() {
    setPrefs(DEFAULT_TRAINER_PREFERENCES);
    setEmailRaw('');
    setPhoneRaw('');
    setNameRaw('');
    setInstructionsRaw('');
  }

  function handleSave() {
    startSave(async () => {
      const r = await saveTrainerPreferences({ tenantId, preferences: finalPrefs });
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
      {/* CARD 1 — Estilo */}
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
                lugar de <code className="font-mono">?</code>.
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
                Cuando el lead envía un audio, mencionarlo explícitamente al inicio de la respuesta.
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
                if (n != null) update('emojiDensity', n as 0 | 1 | 2 | 3);
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

      {/* CARD 2 — Datos de contacto (Sprint Gamma 2.1) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Datos de contacto</CardTitle>
          <CardDescription>
            Información tuya que el setter puede usar en handoff y para alertarte por email.
            Todos los campos son opcionales.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="trainerName" className="text-xs flex items-center gap-1.5">
              <User className="size-3" />
              Tu nombre (cómo te referencia el setter)
            </Label>
            <Input
              id="trainerName"
              value={nameRaw}
              onChange={(e) => setNameRaw(e.target.value)}
              placeholder="ej: Iván Soto"
              maxLength={100}
            />
            <p className="text-xs text-muted-foreground">
              Usado en mensajes de handoff: &quot;te paso con <strong>{nameRaw || '[tu nombre]'}</strong>&quot;.
              Si vacío, dirá &quot;te paso con el equipo&quot;.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="trainerEmail" className="text-xs flex items-center gap-1.5">
              <Mail className="size-3" />
              Tu email (para alertas)
            </Label>
            <Input
              id="trainerEmail"
              type="email"
              value={emailRaw}
              onChange={(e) => setEmailRaw(e.target.value)}
              placeholder="ej: ivan@fyzon.es"
              className={!emailValid && emailRaw !== '' ? 'border-destructive' : ''}
            />
            {!emailValid && emailRaw !== '' ? (
              <p className="text-xs text-destructive">Email inválido. Formato: usuario@dominio.com</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Sin email NO recibirás alertas (configurables abajo cuando esté disponible).
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="trainerPhone" className="text-xs flex items-center gap-1.5">
              <Phone className="size-3" />
              Tu teléfono (para handoff)
            </Label>
            <Input
              id="trainerPhone"
              type="tel"
              value={phoneRaw}
              onChange={(e) => setPhoneRaw(e.target.value)}
              placeholder="ej: +34 600 123 456"
              className={!phoneValid && phoneRaw !== '' ? 'border-destructive' : ''}
            />
            {phoneRaw !== '' && phoneValid && phoneNormalized ? (
              <p className="text-xs text-emerald-400">
                Normalizado: <code className="font-mono">{phoneNormalized}</code>
              </p>
            ) : !phoneValid && phoneRaw !== '' ? (
              <p className="text-xs text-destructive">
                Formato inválido. Debe empezar por <code>+</code> y código de país. Ej:{' '}
                <code>+34600123456</code>
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                El setter lo entregará al lead solo en handoff a humano. NO se usa para mensajes
                salientes automáticos.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* CARD 3 — Instrucciones libres (Sprint Gamma 2.2) */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="size-4" />
            Instrucciones libres para el setter
          </CardTitle>
          <CardDescription>
            Escribe en lenguaje natural lo que quieres que el setter haga o sepa de tu negocio. El
            setter respeta estas instrucciones siempre que no contradigan al Cerebro o al Coach
            (gestionados por la agencia).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <textarea
            value={instructionsRaw}
            onChange={(e) => setInstructionsRaw(e.target.value)}
            placeholder={CUSTOM_INSTRUCTIONS_PLACEHOLDER}
            spellCheck
            className={`min-h-[280px] font-sans text-sm leading-relaxed bg-muted/40 border rounded-md p-3 resize-y focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              instructionsTooLong ? 'border-destructive' : ''
            }`}
          />
          <div className="flex items-center justify-between text-xs">
            <p className="text-muted-foreground italic">
              Estas instrucciones se inyectan al final del prompt y aplican desde el siguiente
              turno del motor.
            </p>
            <span
              className={`font-mono tabular-nums ${
                instructionsTooLong
                  ? 'text-destructive'
                  : instructionsLength > WARN_INSTRUCTIONS
                    ? 'text-amber-400'
                    : 'text-muted-foreground'
              }`}
            >
              {instructionsLength.toLocaleString()} / {MAX_INSTRUCTIONS.toLocaleString()}
            </span>
          </div>
          {instructionsTooLong ? (
            <div className="flex items-center gap-2 text-xs text-destructive">
              <AlertTriangle className="size-3.5" />
              Excedes el máximo permitido. Recorta antes de guardar.
            </div>
          ) : instructionsLength > WARN_INSTRUCTIONS ? (
            <div className="flex items-center gap-2 text-xs text-amber-400">
              <AlertTriangle className="size-3.5" />
              Cerca del límite. Considera simplificar para no inflar el prompt en cada turno.
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* CARD 4 — Cualificación */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cualificación</CardTitle>
          <CardDescription>Ajustes finos sobre cómo el setter cualifica antes de proponer la llamada.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <Label className="text-sm">Preguntas extra antes de la cita</Label>
            <p className="text-xs text-muted-foreground">
              Antes de proponer la llamada, pedir al setter que haga preguntas adicionales para
              reforzar contexto del lead.
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
            <Button type="button" size="sm" onClick={handleSave} disabled={saving || !canSave}>
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
