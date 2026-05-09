'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, Save, RotateCcw, Mail, Phone, User, Bell, CalendarClock, Link as LinkIcon } from 'lucide-react';
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
  type NotificationEventType,
  type CallProposalMode,
  NOTIFICATION_EVENT_TYPES,
  NOTIFICATION_EVENT_LABELS,
  CALL_PROPOSAL_MODES,
  CALL_PROPOSAL_MODE_LABELS,
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
  {
    value: 0,
    label: 'Sin preguntas extra',
    desc:
      'El setter sigue el flujo estándar del Cerebro y propone la llamada en cuanto el lead encaja con tu criterio. Más rápido — menos fricción para el lead.',
  },
  {
    value: 1,
    label: 'Una pregunta de matiz',
    desc:
      'Antes de proponer la llamada, el setter hace 1 pregunta adicional para entender mejor el contexto (ej: "¿desde cuándo te pasa?", "¿qué has probado antes?"). Más información para ti — algo más de fricción.',
  },
  {
    value: 2,
    label: 'Dos preguntas de matiz',
    desc:
      'Antes de proponer la llamada, el setter hace 2 preguntas adicionales para profundizar (ej: contexto + intento previo). Llegas a la llamada con más información preparada — útil en nichos consultivos.',
  },
];

const MESSAGE_LENGTH_LABELS = [
  { value: 0, label: 'Cortos', desc: '1 frase por turno, máximo 2. Ágil, sin párrafos.' },
  { value: 1, label: 'Equilibrado', desc: '1-2 frases por mensaje. Si hace falta más, parte en 2 mensajes (default).' },
  { value: 2, label: 'Amplios', desc: '2-3 frases en un mismo mensaje cuando hace falta contexto. Útil consultivo.' },
];

const TONE_LABELS = [
  { value: 0, label: 'Cercano', desc: 'Coloquial como un amigo del sector. Tutea, expresiones cotidianas.' },
  { value: 1, label: 'Equilibrado', desc: 'Profesional pero cercano. Tutea por defecto, sin jerga (default).' },
  { value: 2, label: 'Profesional', desc: 'Elegante, evita coloquialismos. Considera el usted si el lead lo usa primero.' },
];

export function PreferencesForm({ tenantId, initial }: Props) {
  const router = useRouter();
  const [prefs, setPrefs] = useState<TrainerPreferences>(initial);
  const [emailRaw, setEmailRaw] = useState(initial.trainerEmail ?? '');
  const [phoneRaw, setPhoneRaw] = useState(initial.trainerPhone ?? '');
  const [nameRaw, setNameRaw] = useState(initial.trainerName ?? '');
  const [calendarUrlRaw, setCalendarUrlRaw] = useState(initial.closingResourceUrl ?? '');
  const [calendarClosingRaw, setCalendarClosingRaw] = useState(initial.calendarClosingMessage ?? '');
  const [saving, startSave] = useTransition();

  // Re-sync state cuando el server component pasa nueva `initial` tras router.refresh()
  // (p.ej. después de guardar). Sin esto, el form queda con el snapshot viejo de
  // useState y los gates (como Card 5 disabled) usan datos obsoletos.
  useEffect(() => {
    setPrefs(initial);
    setEmailRaw(initial.trainerEmail ?? '');
    setPhoneRaw(initial.trainerPhone ?? '');
    setNameRaw(initial.trainerName ?? '');
    setCalendarUrlRaw(initial.closingResourceUrl ?? '');
    setCalendarClosingRaw(initial.calendarClosingMessage ?? '');
  }, [initial]);

  // Validaciones cliente
  const emailValid = emailRaw === '' || isValidEmail(emailRaw);
  const phoneNormalized = normalizePhoneE164(phoneRaw);
  const phoneValid = phoneRaw === '' || phoneNormalized !== null;
  // Sprint 2.5b/B — validación URL calendario en cliente (espejo del sanitizeCalendarUrl backend)
  const calendarUrlValid =
    calendarUrlRaw === '' ||
    (() => {
      try {
        const u = new URL(calendarUrlRaw.trim());
        return u.protocol === 'https:' && calendarUrlRaw.length <= 200;
      } catch {
        return false;
      }
    })();

  // Building del objeto final desde inputs
  const finalPrefs: TrainerPreferences = {
    ...prefs,
    trainerEmail: emailRaw === '' ? null : (emailValid ? emailRaw.trim().toLowerCase() : prefs.trainerEmail),
    trainerPhone: phoneRaw === '' ? null : phoneNormalized,
    trainerName: nameRaw.trim() === '' ? null : nameRaw.trim(),
    closingResourceUrl: calendarUrlRaw === '' ? null : (calendarUrlValid ? calendarUrlRaw.trim() : prefs.closingResourceUrl),
    calendarClosingMessage: calendarClosingRaw.trim() === '' ? null : calendarClosingRaw.trim().slice(0, 200),
  };

  const isDirty = JSON.stringify(finalPrefs) !== JSON.stringify(initial);
  const isAllDefault = JSON.stringify(finalPrefs) === JSON.stringify(DEFAULT_TRAINER_PREFERENCES);
  const canSave =
    isDirty &&
    (emailRaw === '' || emailValid) &&
    (phoneRaw === '' || phoneValid) &&
    (calendarUrlRaw === '' || calendarUrlValid);

  function update<K extends keyof TrainerPreferences>(key: K, value: TrainerPreferences[K]) {
    setPrefs((p) => ({ ...p, [key]: value }));
  }

  function handleResetDefaults() {
    setPrefs(DEFAULT_TRAINER_PREFERENCES);
    setEmailRaw('');
    setPhoneRaw('');
    setNameRaw('');
    setCalendarUrlRaw('');
    setCalendarClosingRaw('');
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

          {/* Sprint 2.5b/B — Slider longitud de mensajes */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-sm">Longitud de mensajes</Label>
              <Badge variant="outline" className="font-mono text-xs">
                {MESSAGE_LENGTH_LABELS[prefs.messageLengthDensity]!.label}
              </Badge>
            </div>
            <Slider
              value={[prefs.messageLengthDensity]}
              min={0}
              max={2}
              step={1}
              onValueChange={(v) => {
                const n = v[0];
                if (n != null) update('messageLengthDensity', n as 0 | 1 | 2);
              }}
            />
            <div className="flex items-center justify-between text-[10px] text-muted-foreground tabular-nums">
              <span>Cortos</span>
              <span>Equilibrado</span>
              <span>Amplios</span>
            </div>
            <p className="text-xs text-muted-foreground italic">
              {MESSAGE_LENGTH_LABELS[prefs.messageLengthDensity]!.desc}
            </p>
          </div>

          {/* Sprint 2.5b/B — Slider tono */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-sm">Tono</Label>
              <Badge variant="outline" className="font-mono text-xs">
                {TONE_LABELS[prefs.toneRegister]!.label}
              </Badge>
            </div>
            <Slider
              value={[prefs.toneRegister]}
              min={0}
              max={2}
              step={1}
              onValueChange={(v) => {
                const n = v[0];
                if (n != null) update('toneRegister', n as 0 | 1 | 2);
              }}
            />
            <div className="flex items-center justify-between text-[10px] text-muted-foreground tabular-nums">
              <span>Cercano</span>
              <span>Equilibrado</span>
              <span>Profesional</span>
            </div>
            <p className="text-xs text-muted-foreground italic">
              {TONE_LABELS[prefs.toneRegister]!.desc}
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
              Para personalizar los emails que recibes (saludo &quot;Hola {nameRaw || '[tu nombre]'},&quot;).
              El setter NO usa este nombre con el lead.
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

      {/* CARD 3 — Instrucciones libres movido a componente separado (custom-instructions-list.tsx) */}

      {/* CARD 4 — Cualificación + propuesta de llamada (Sprint 2.5b/B + 2.5b/C) */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarClock className="size-4" />
            Cualificación + propuesta de llamada
          </CardTitle>
          <CardDescription>
            Cómo cualifica el setter y cómo cierra la conversación (calendario, formulario o
            derivación humana).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-8">
          {/* Bloque 1 — Preguntas extra (toggle ON/OFF + botones si ON) */}
          <div className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <Label htmlFor="qToggle" className="text-sm">
                  ¿Quieres que el setter pregunte más al lead antes de proponer la llamada?
                </Label>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Por defecto el setter sigue tu Coach: cualifica con las preguntas que tu agente ya
                  tiene definidas y propone llamada en cuanto el lead encaja. Esto funciona bien para
                  la mayoría de negocios.
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed mt-1">
                  Activa esta opción <strong className="text-foreground/80">solo si quieres llegar a la
                  llamada con más contexto del lead</strong> (útil en nichos consultivos: salud,
                  coaching, formación premium). El setter añadirá 1-2 preguntas de matiz justo antes
                  de cerrar — el lead invierte 30s más, tú llegas más preparado.
                </p>
              </div>
              <Switch
                id="qToggle"
                checked={prefs.qualificationQuestionsEnabled}
                onCheckedChange={(v) => update('qualificationQuestionsEnabled', v)}
              />
            </div>
            {prefs.qualificationQuestionsEnabled && (
              <div className="flex flex-col gap-3 mt-2 p-3 rounded-md border border-border/40 bg-muted/20">
                <p className="text-xs text-muted-foreground">
                  <strong className="text-foreground/80">¿Cuántas preguntas extra?</strong> El setter
                  las hará justo antes de proponer la llamada, NUNCA al inicio (eso interrumpiría el
                  flujo natural). Cada extra añade ~1 turno a la conversación.
                </p>
                <div className="flex items-center gap-2">
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
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {QUESTIONS_LABELS[prefs.extraQuestionsBeforeCall]!.desc}
                </p>
              </div>
            )}
          </div>

          <div className="border-t border-border/40" />

          {/* Bloque 2 — Modo de cierre (selector de 3) */}
          <div className="flex flex-col gap-3">
            <Label className="text-sm">¿Cómo cierra el setter cuando el lead está cualificado?</Label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {CALL_PROPOSAL_MODES.map((mode) => {
                const meta = CALL_PROPOSAL_MODE_LABELS[mode];
                const active = prefs.callProposalMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => update('callProposalMode', mode as CallProposalMode)}
                    className={`flex flex-col items-start gap-1 p-3 rounded-md border text-left transition-colors ${
                      active
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border/40 hover:border-border bg-transparent text-muted-foreground'
                    }`}
                  >
                    <span className="text-sm font-medium text-foreground">{meta.label}</span>
                    <span className="text-xs">{meta.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Bloque 3 — URL del recurso (solo modos calendar/form) */}
          {prefs.callProposalMode !== 'human_handoff' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="calendarUrl" className="text-xs flex items-center gap-1.5">
                  <LinkIcon className="size-3" />
                  {prefs.callProposalMode === 'calendar' ? 'URL de tu calendario' : 'URL de tu formulario'}
                </Label>
                <Input
                  id="calendarUrl"
                  type="url"
                  value={calendarUrlRaw}
                  onChange={(e) => setCalendarUrlRaw(e.target.value)}
                  placeholder={
                    prefs.callProposalMode === 'calendar'
                      ? 'https://cal.com/tu-slug  o  https://calendly.com/tu-slug'
                      : 'https://forms.google.com/...  o  https://typeform.com/...'
                  }
                  className={!calendarUrlValid && calendarUrlRaw !== '' ? 'border-destructive' : ''}
                  maxLength={200}
                />
                {!calendarUrlValid && calendarUrlRaw !== '' ? (
                  <p className="text-xs text-destructive">
                    URL inválida. Debe empezar por <code>https://</code> y ser una URL real.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    El setter compartirá EXACTAMENTE este enlace al cerrar.
                    {calendarUrlRaw === '' &&
                      (prefs.callProposalMode === 'form'
                        ? ' En modo formulario es obligatorio para que tenga sentido.'
                        : ' Si vacío, dirá "te paso mi agenda" sin link (peor experiencia para el lead).')}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="calendarClosing" className="text-xs">
                  Frase de cierre antes del enlace (opcional)
                </Label>
                <textarea
                  id="calendarClosing"
                  value={calendarClosingRaw}
                  onChange={(e) => setCalendarClosingRaw(e.target.value)}
                  placeholder={
                    prefs.callProposalMode === 'calendar'
                      ? 'ej: Vamos a verlo en una llamada de 15 min, te paso mi agenda 👇'
                      : 'ej: Para cerrar, déjame tus datos en este formulario 👇'
                  }
                  rows={2}
                  maxLength={200}
                  className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                />
                <div className="flex items-center justify-between text-xs">
                  <p className="text-muted-foreground">
                    Vacío = el setter decide.
                  </p>
                  <span className={`tabular-nums ${calendarClosingRaw.length > 180 ? 'text-amber-400' : 'text-muted-foreground'}`}>
                    {calendarClosingRaw.length}/200
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Bloque 4 — Nota explicativa cuando modo handoff */}
          {prefs.callProposalMode === 'human_handoff' && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
              <p className="font-medium text-amber-200 mb-1">Modo derivación humana</p>
              <p className="text-xs text-muted-foreground">
                El setter cualificará al lead y, en lugar de proponer llamada o enviar enlace, marcará
                la conversación como handoff. La IA pausará tras ese turno y tú atenderás manualmente.
                Recibirás email si tienes el evento <strong>Handoff a humano</strong> activado abajo.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* CARD 5 — Notificaciones email (Sprint Gamma 2.5) */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="size-4" />
            Notificaciones por email
          </CardTitle>
          <CardDescription>
            Elige qué eventos del motor te llegan por email a{' '}
            <code className="font-mono text-xs">{finalPrefs.trainerEmail ?? '(sin email configurado)'}</code>.
            {finalPrefs.trainerEmail == null && (
              <span className="block mt-1 text-amber-400">
                ⚠ Configura tu email en &quot;Datos de contacto&quot; arriba para activar las notificaciones.
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {NOTIFICATION_EVENT_TYPES.map((eventType) => {
            const meta = NOTIFICATION_EVENT_LABELS[eventType];
            const checked = prefs.notificationSubscriptions.includes(eventType);
            const disabled = finalPrefs.trainerEmail == null;
            return (
              <div
                key={eventType}
                className={`flex items-start justify-between gap-3 rounded-md border border-border/40 p-3 ${
                  disabled ? 'opacity-50' : ''
                }`}
              >
                <div className="flex flex-col gap-0.5 min-w-0">
                  <Label htmlFor={`notif-${eventType}`} className="text-sm font-medium">
                    {meta.label}
                  </Label>
                  <p className="text-xs text-muted-foreground">{meta.desc}</p>
                </div>
                <Switch
                  id={`notif-${eventType}`}
                  checked={checked}
                  disabled={disabled}
                  onCheckedChange={(v) => {
                    const current = new Set<NotificationEventType>(prefs.notificationSubscriptions);
                    if (v) current.add(eventType);
                    else current.delete(eventType);
                    update(
                      'notificationSubscriptions',
                      NOTIFICATION_EVENT_TYPES.filter((t) => current.has(t)),
                    );
                  }}
                />
              </div>
            );
          })}
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
