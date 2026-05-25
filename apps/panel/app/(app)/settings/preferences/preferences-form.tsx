'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, Save, RotateCcw, Mail, Phone, User, Bell, CalendarClock, Link as LinkIcon, Smile, Plus, Trash2, HandHeart, ChevronDown, CheckCircle2, Ban, MessageSquare, AlertTriangle, Tag, Users } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CollapsibleCard } from '@/components/ui/collapsible-card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { EnforcementBadge } from '@/components/ui/enforcement-badge';
import { saveTrainerPreferences } from '@/lib/actions/prompts';
import {
  type TrainerPreferences,
  type NotificationEventType,
  type CallProposalMode,
  type EmojiCustomization,
  type HandoffMode,
  type HandoffCustomTemplate,
  type AddressingMode,
  type AiMessagesPerTurnMax,
  type UseLeadNameMode,
  type LeadNameMaxMentions,
  type TargetClientGender,
  type GenderVerificationStyle,
  NOTIFICATION_EVENT_TYPES,
  NOTIFICATION_EVENT_LABELS,
  CALL_PROPOSAL_MODES,
  CALL_PROPOSAL_MODE_LABELS,
  HANDOFF_MODES,
  HANDOFF_MODE_LABELS,
  HANDOFF_CUSTOM_TEMPLATES,
  HANDOFF_CUSTOM_TEMPLATE_LABELS,
  ADDRESSING_MODES,
  ADDRESSING_MODE_LABELS,
  AI_MESSAGES_PER_TURN_MAX_VALUES,
  AI_MESSAGES_PER_TURN_MAX_LABELS,
  USE_LEAD_NAME_MODES,
  USE_LEAD_NAME_MODE_LABELS,
  LEAD_NAME_MAX_MENTIONS_LABELS,
  TARGET_CLIENT_GENDERS,
  TARGET_CLIENT_GENDER_LABELS,
  GENDER_VERIFICATION_STYLES,
  GENDER_VERIFICATION_STYLE_LABELS,
  MAX_FORBIDDEN_PHRASES,
  MAX_FORBIDDEN_PHRASE_CHARS,
  DEFAULT_TRAINER_PREFERENCES,
  isValidEmail,
  normalizePhoneE164,
  sanitizeForbiddenPhrase,
} from '@/lib/trainer-prefs-serializer';

interface Props {
  tenantId: number;
  initial: TrainerPreferences;
}

const EMOJI_FREQ_LABELS = [
  { value: 1, label: 'Cada mensaje', desc: 'Frecuencia alta — el setter usa ~1 emoji por mensaje. Más expresivo, más emocional.' },
  { value: 2, label: 'Cada 2 mensajes', desc: 'Frecuencia media — equilibrado. Recomendado para la mayoría de nichos.' },
  { value: 3, label: 'Cada 3 mensajes', desc: 'Frecuencia baja — el setter usa pocos emojis. Más sobrio, profesional.' },
];

const EMOJI_MAX_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

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

// Hito 12.1 (2026-05-20): `MESSAGE_LENGTH_LABELS` y `TONE_LABELS` eliminados.
// Longitud y tono se gestionan desde core_v5_base + coach_v5, no como
// preferencias del trainer. El card "Estilo y registro" ahora solo aloja los
// controles estrictos (max msgs + tratamiento).

export function PreferencesForm({ tenantId, initial }: Props) {
  const router = useRouter();
  const [prefs, setPrefs] = useState<TrainerPreferences>(initial);
  const [emailRaw, setEmailRaw] = useState(initial.trainerEmail ?? '');
  const [phoneRaw, setPhoneRaw] = useState(initial.trainerPhone ?? '');
  const [nameRaw, setNameRaw] = useState(initial.trainerName ?? '');
  const [calendarUrlRaw, setCalendarUrlRaw] = useState(initial.closingResourceUrl ?? '');
  const [calendarClosingRaw, setCalendarClosingRaw] = useState(initial.calendarClosingMessage ?? '');
  const [handoffCustomMsgRaw, setHandoffCustomMsgRaw] = useState(initial.handoffCustomMessage ?? '');
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
    setHandoffCustomMsgRaw(initial.handoffCustomMessage ?? '');
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
    handoffCustomMessage: handoffCustomMsgRaw.trim() === '' ? null : handoffCustomMsgRaw.trim().slice(0, 250),
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
    setHandoffCustomMsgRaw('');
  }

  /** Revierte el form al snapshot guardado en server (cancela los cambios sin tocar lo persistido). */
  function handleDiscardChanges() {
    setPrefs(initial);
    setEmailRaw(initial.trainerEmail ?? '');
    setPhoneRaw(initial.trainerPhone ?? '');
    setNameRaw(initial.trainerName ?? '');
    setCalendarUrlRaw(initial.closingResourceUrl ?? '');
    setCalendarClosingRaw(initial.calendarClosingMessage ?? '');
    setHandoffCustomMsgRaw(initial.handoffCustomMessage ?? '');
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
      {/* CARD 1 — Estilo y registro (Hito 12.1: solo controles ESTRICTOS).
          Longitud y tono se gestionan desde core_v5_base + coach_v5 — no
          viven aquí como preferencias del trainer. */}
      <CollapsibleCard
        title="Estilo y registro"
        description="Número máximo de mensajes por turno y tratamiento al lead. Ambos con cumplimiento estricto validado por el motor."
        icon={<MessageSquare className="size-4" />}
        defaultOpen
        fullWidth
      >
        <CardContent className="flex flex-col gap-7">
          {/* Hito 12.1 — Slider máximo de mensajes por turno (ESTRICTO) */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Label className="text-sm">Máximo de mensajes por turno</Label>
                <EnforcementBadge level="strict" />
              </div>
              <Badge variant="outline" className="font-mono text-xs">
                {AI_MESSAGES_PER_TURN_MAX_LABELS[prefs.aiMessagesPerTurnMax].label}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Cuántas burbujas consecutivas como máximo manda el setter en un mismo turno. El número
              real es variable (puede ser 1, 2 o 3 según el momento) — este slider marca el techo.
              El motor lo enforcea a nivel código: instruye al modelo, limita la longitud generada,
              y el splitter respeta el cap.
            </p>
            <Slider
              value={[prefs.aiMessagesPerTurnMax]}
              min={1}
              max={4}
              step={1}
              onValueChange={(v) => {
                const n = v[0];
                if (n != null && n >= 1 && n <= 4) {
                  update('aiMessagesPerTurnMax', n as AiMessagesPerTurnMax);
                }
              }}
            />
            <div className="flex items-center justify-between text-[10px] text-muted-foreground tabular-nums">
              <span>1 msg</span>
              <span>2 msg</span>
              <span>3 msg</span>
              <span>4 msg</span>
            </div>
            <p className="text-xs text-muted-foreground italic">
              {AI_MESSAGES_PER_TURN_MAX_LABELS[prefs.aiMessagesPerTurnMax].hint}
            </p>
            {AI_MESSAGES_PER_TURN_MAX_LABELS[prefs.aiMessagesPerTurnMax].warning && (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-700 dark:text-amber-300">
                <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
                <span>{AI_MESSAGES_PER_TURN_MAX_LABELS[prefs.aiMessagesPerTurnMax].warning}</span>
              </div>
            )}
          </div>

          <div className="border-t border-border/40" />

          {/* Hito 12.1 — Tratamiento al lead (ESTRICTO) */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Label className="text-sm">Tratamiento al lead</Label>
              <EnforcementBadge level="strict" />
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Cómo se dirige el setter al lead. "Espejo del lead" es la opción más natural en nichos
              hispanos: el setter detecta cómo le habla el lead (tú o usted) y le devuelve en el mismo
              registro. Los modos fijos (tutear / tratar de usted) los enforcea el motor en cada
              mensaje — el modelo no puede saltárselos.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {ADDRESSING_MODES.map((mode) => {
                const meta = ADDRESSING_MODE_LABELS[mode];
                const active = prefs.addressingMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => update('addressingMode', mode as AddressingMode)}
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
        </CardContent>
      </CollapsibleCard>

      {/* CARD VOCABULARIO PROHIBIDO (Hito 12.1) — full width, ESTRICTO */}
      <CollapsibleCard
        title="Vocabulario prohibido"
        description="Lista de palabras o frases que el setter NUNCA dirá al lead. El motor valida cada mensaje antes de enviar y obliga al modelo a reescribir si las detecta. Útil para muletillas, expresiones que no encajan con tu marca, o términos sensibles del sector."
        icon={<Ban className="size-4" />}
        fullWidth
      >
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Label className="text-sm">Lista de bloqueo</Label>
            <EnforcementBadge level="strict" />
            <Badge variant="outline" className="ml-auto font-mono text-xs">
              {prefs.forbiddenPhrases.length}/{MAX_FORBIDDEN_PHRASES}
            </Badge>
          </div>
          <ForbiddenPhrasesList
            items={prefs.forbiddenPhrases}
            onChange={(next) => update('forbiddenPhrases', next)}
          />
        </CardContent>
      </CollapsibleCard>

      {/* CARD EMOTICONOS (Sprint Gamma 2.5b/E) — full width */}
      <CollapsibleCard
        title="Emoticonos"
        description="Decide si el setter usa emojis, con qué frecuencia, cuántos por conversación y qué emojis concretos. Si no configuras nada, el setter usa los del Coach con criterio normal."
        icon={<Smile className="size-4" />}
        fullWidth
      >
        <CardContent className="flex flex-col gap-6">
          {/* Toggle on/off */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <Label htmlFor="emojisToggle" className="text-sm">
                ¿Quieres que el setter use emojis?
              </Label>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Apaga esto si tu nicho es <strong className="text-foreground/80">muy formal</strong>{' '}
                (legal, B2B premium, médico) o si simplemente prefieres texto plano. Cuando está
                apagado, el setter NO usa NINGÚN emoji aunque el Coach los sugiera.
              </p>
            </div>
            <Switch
              id="emojisToggle"
              checked={prefs.emojisEnabled}
              onCheckedChange={(v) => update('emojisEnabled', v)}
            />
          </div>

          {prefs.emojisEnabled && (
            <div className="flex flex-col gap-6 p-4 rounded-md border border-border/40 bg-muted/20">
              {/* Frecuencia */}
              <div className="flex flex-col gap-2">
                <Label className="text-sm">Frecuencia: ¿cada cuántos mensajes?</Label>
                <p className="text-xs text-muted-foreground">
                  El setter NO usará emojis en cada mensaje a menos que elijas frecuencia alta. Más
                  emojis no siempre es mejor — depende de tu marca.
                </p>
                <div className="flex items-center gap-2 mt-1">
                  {EMOJI_FREQ_LABELS.map((f) => (
                    <Button
                      key={f.value}
                      type="button"
                      size="sm"
                      variant={prefs.emojiFrequencyPerMessages === f.value ? 'default' : 'outline'}
                      onClick={() =>
                        update('emojiFrequencyPerMessages', f.value as 1 | 2 | 3)
                      }
                      className="flex-1"
                    >
                      {f.label}
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground italic">
                  {
                    EMOJI_FREQ_LABELS.find((f) => f.value === prefs.emojiFrequencyPerMessages)!
                      .desc
                  }
                </p>
              </div>

              {/* Máximo por conversación */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-sm">Tope máximo por conversación</Label>
                  <Badge variant="outline" className="font-mono text-xs">
                    {prefs.emojiMaxPerConversation} emoji
                    {prefs.emojiMaxPerConversation === 1 ? '' : 's'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Aunque la conversación se alargue, el setter no superará este número. Recomendado:
                  3-5 para nichos normales, 1-2 si quieres que sea muy sobrio.
                </p>
                <Slider
                  value={[prefs.emojiMaxPerConversation]}
                  min={1}
                  max={8}
                  step={1}
                  onValueChange={(v) => {
                    const n = v[0];
                    if (n != null && n >= 1 && n <= 8) {
                      update(
                        'emojiMaxPerConversation',
                        n as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8,
                      );
                    }
                  }}
                />
                <div className="flex items-center justify-between text-[10px] text-muted-foreground tabular-nums">
                  <span>1</span>
                  <span>2</span>
                  <span>3</span>
                  <span>4</span>
                  <span>5</span>
                  <span>6</span>
                  <span>7</span>
                  <span>8</span>
                </div>
              </div>

              {/* Whitelist personalizada */}
              <CustomEmojiList
                items={prefs.customEmojis}
                onChange={(next) => update('customEmojis', next)}
              />
            </div>
          )}
        </CardContent>
      </CollapsibleCard>

      {/* CARD NOMBRE DEL LEAD (Hito 12.2) — full width, best effort */}
      <CollapsibleCard
        title="Nombre del lead"
        description="Decide cómo el setter usa el nombre del lead que viene de GHL, ManyChat o YCloud. Útil para evitar que el setter llame al lead con un handle de usuario tipo 'andrea12345' cuando los datos reales no aportan un nombre humano."
        icon={<Tag className="size-4" />}
        fullWidth
      >
        <CardContent className="flex flex-col gap-6">
          {/* Modo de uso del nombre */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Label className="text-sm">Modo de uso</Label>
              <EnforcementBadge level="best_effort" />
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              El setter recibe el nombre del lead desde los datos de contacto del canal (GHL contact,
              perfil de WhatsApp, handle de Instagram). En modo automático, si esos datos no aportan
              un nombre humano legible (ej: <code className="font-mono text-foreground/80">user2381</code>,{' '}
              <code className="font-mono text-foreground/80">andrea12345</code>), el setter NO inventa
              un nombre y trata al lead de forma neutra.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {USE_LEAD_NAME_MODES.map((mode) => {
                const meta = USE_LEAD_NAME_MODE_LABELS[mode];
                const active = prefs.useLeadNameMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => update('useLeadNameMode', mode as UseLeadNameMode)}
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

          {/* Slider tope de menciones — oculto si modo 'never' */}
          {prefs.useLeadNameMode !== 'never' && (
            <div className="flex flex-col gap-3 p-4 rounded-md border border-border/40 bg-muted/20">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-sm">Tope de menciones por conversación</Label>
                <Badge variant="outline" className="font-mono text-xs">
                  {prefs.leadNameMaxMentions === 0
                    ? '0 (sin nombre)'
                    : `${prefs.leadNameMaxMentions} ${prefs.leadNameMaxMentions === 1 ? 'mención' : 'menciones'}`}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Cuántas veces como máximo el setter usa el nombre del lead en toda la conversación.
                La personalización funciona <strong className="text-foreground/80">por contraste</strong>:
                si el setter repite el nombre cada turno, suena forzado y robótico. 2 menciones
                (saludo + un momento clave) es lo recomendado.
              </p>
              <Slider
                value={[prefs.leadNameMaxMentions]}
                min={0}
                max={5}
                step={1}
                onValueChange={(v) => {
                  const n = v[0];
                  if (n != null && n >= 0 && n <= 5) {
                    update('leadNameMaxMentions', n as LeadNameMaxMentions);
                  }
                }}
              />
              <div className="flex items-center justify-between text-[10px] text-muted-foreground tabular-nums">
                <span>0</span>
                <span>1</span>
                <span>2</span>
                <span>3</span>
                <span>4</span>
                <span>5</span>
              </div>
              <p className="text-xs text-muted-foreground italic">
                {LEAD_NAME_MAX_MENTIONS_LABELS[prefs.leadNameMaxMentions].hint}
              </p>
            </div>
          )}
        </CardContent>
      </CollapsibleCard>

      {/* CARD PUBLICO OBJETIVO (Hito 12.2) — full width, best effort */}
      <CollapsibleCard
        title="Público objetivo"
        description="Si trabajas SOLO con un género (típico en programas dirigidos: fitness masculino, salud femenina), el setter introduce una pregunta de verificación en cuanto detecta que el lead que escribe parece del género opuesto. Útil para no perder tiempo con leads que escriben por su pareja, familiar o cercano."
        icon={<Users className="size-4" />}
        fullWidth
      >
        <CardContent className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Label className="text-sm">Género objetivo de tus clientes</Label>
              <EnforcementBadge level="best_effort" />
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Si eliges &quot;Mixto&quot;, el setter no aplica ningún filtro — atiende a quien escriba sin
              preguntar por terceros. Si eliges un género específico y detectamos que el lead parece
              del opuesto, el setter pregunta en F1 (tras el primer intercambio) si es para sí mismo
              o para un cercano. <strong className="text-foreground/80">No descarta — solo confirma.</strong>
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {TARGET_CLIENT_GENDERS.map((g) => {
                const meta = TARGET_CLIENT_GENDER_LABELS[g];
                const active = prefs.targetClientGender === g;
                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() => update('targetClientGender', g as TargetClientGender)}
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

          {/* Sub-panel estilo verificación — solo si target != mixed */}
          {prefs.targetClientGender !== 'mixed' && (
            <div className="flex flex-col gap-3 p-4 rounded-md border border-border/40 bg-muted/20">
              <Label className="text-sm">Estilo de la pregunta de verificación</Label>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Cómo formula el setter la pregunta cuando detecta un posible mismatch de género entre
                el lead y tu público objetivo. La pregunta se hace en F1 (después del primer
                intercambio, no en el saludo) para no romper la empatía inicial.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {GENDER_VERIFICATION_STYLES.map((style) => {
                  const meta = GENDER_VERIFICATION_STYLE_LABELS[style];
                  const active = prefs.genderVerificationStyle === style;
                  return (
                    <button
                      key={style}
                      type="button"
                      onClick={() =>
                        update('genderVerificationStyle', style as GenderVerificationStyle)
                      }
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
              <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2">
                <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
                <span>
                  La detección de género es heurística (basada en el nombre del lead) y puede fallar
                  en nombres ambiguos (Sam, Alex, Jordan) o cuando el contacto no aporta nombre real.
                  El setter solo introduce la pregunta cuando detecta una señal clara — si no la hay,
                  sigue el flujo normal.
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </CollapsibleCard>

      {/* CARD 2 — Datos de contacto (Sprint Gamma 2.1) */}
      <CollapsibleCard
        title="Datos de contacto"
        description="Información tuya que el setter puede usar en handoff y para alertarte por email. Todos los campos son opcionales."
        icon={<User className="size-4" />}
      >
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
              <p className="text-xs text-success">
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
      </CollapsibleCard>

      {/* CARD HANDOFF (Sprint Gamma 2.6b) — full width */}
      <CollapsibleCard
        title="Comportamiento en handoff"
        description="Qué hace el setter cuando el lead pide hablar con humano, detecta que es bot, o aparece una situación delicada (Causa B). Distinto del cierre cualificado de la sección de abajo — esto cubre las salidas REACTIVAS del flujo."
        icon={<HandHeart className="size-4" />}
        fullWidth
      >
        <CardContent className="flex flex-col gap-6">
          {/* Toggle Card-level */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <Label htmlFor="handoffPersonalizationToggle" className="text-sm">
                ¿Quieres personalizar qué hace el setter en handoff?
              </Label>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Por defecto (apagado), el setter comparte tu teléfono si está configurado en
                Datos de contacto, o usa una frase genérica si no. Esto cubre el 80% de los casos.
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed mt-1">
                Activa esta opción <strong className="text-foreground/80">solo si quieres
                control específico</strong>: no compartir tu teléfono nunca, escribir tu propia
                frase de despedida, o usar una plantilla preset.
              </p>
            </div>
            <Switch
              id="handoffPersonalizationToggle"
              checked={prefs.handoffPersonalizationEnabled}
              onCheckedChange={(v) => update('handoffPersonalizationEnabled', v)}
            />
          </div>

          {prefs.handoffPersonalizationEnabled && (
            <div className="flex flex-col gap-6 p-4 rounded-md border border-border/40 bg-muted/20">
              {/* Selector de modo (3 opciones) */}
              <div className="flex flex-col gap-3">
                <Label className="text-sm">Modo de handoff</Label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  {HANDOFF_MODES.map((mode) => {
                    const meta = HANDOFF_MODE_LABELS[mode];
                    const active = prefs.handoffMode === mode;
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => update('handoffMode', mode as HandoffMode)}
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

              {/* Branch share_phone */}
              {prefs.handoffMode === 'share_phone' && (
                <div className="rounded-md border border-border/40 p-3 bg-background/40">
                  {finalPrefs.trainerPhone ? (
                    <p className="text-xs text-muted-foreground">
                      Preview: el setter dirá al lead{' '}
                      <em className="not-italic text-foreground/80">
                        &quot;puedes escribirles directamente al{' '}
                        <code className="font-mono">{finalPrefs.trainerPhone}</code>&quot;
                      </em>
                      , una sola vez por conversación.
                    </p>
                  ) : (
                    <p className="text-xs text-warning">
                      ⚠ Tienes este modo activo pero NO has configurado tu teléfono en
                      &quot;Datos de contacto&quot; arriba. El setter degradará automáticamente a
                      modo silencioso (no compartirá nada). Configura un teléfono o cambia de modo.
                    </p>
                  )}
                </div>
              )}

              {/* Branch silent */}
              {prefs.handoffMode === 'silent' && (
                <div className="rounded-md border border-border/40 p-3 bg-background/40">
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    El setter cerrará la conversación con frase tipo{' '}
                    <em className="not-italic text-foreground/80">
                      &quot;el equipo te contactará en breve, no es necesario que hagas nada
                      más&quot;
                    </em>
                    , sin entregar canal alguno. Tú recibirás email cuando ocurra (asegúrate de
                    tener <strong>Handoff a humano</strong> activado abajo en{' '}
                    <strong>Notificaciones por email</strong>) y atenderás manualmente.
                  </p>
                </div>
              )}

              {/* Branch custom_message */}
              {prefs.handoffMode === 'custom_message' && (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-3">
                    <Label className="text-sm">Plantilla del mensaje</Label>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      {HANDOFF_CUSTOM_TEMPLATES.map((tpl) => {
                        const meta = HANDOFF_CUSTOM_TEMPLATE_LABELS[tpl];
                        const active = prefs.handoffCustomTemplate === tpl;
                        return (
                          <button
                            key={tpl}
                            type="button"
                            onClick={() =>
                              update('handoffCustomTemplate', tpl as HandoffCustomTemplate)
                            }
                            className={`flex flex-col items-start gap-1 p-3 rounded-md border text-left transition-colors ${
                              active
                                ? 'border-primary bg-primary/10 text-foreground'
                                : 'border-border/40 hover:border-border bg-transparent text-muted-foreground'
                            }`}
                          >
                            <span className="text-sm font-medium text-foreground">
                              {meta.label}
                            </span>
                            <span className="text-xs">{meta.desc}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Preview o textarea según template */}
                  {prefs.handoffCustomTemplate !== 'free' &&
                    HANDOFF_CUSTOM_TEMPLATE_LABELS[prefs.handoffCustomTemplate].preview && (
                      <div className="rounded-md border border-border/40 p-3 bg-background/40">
                        <p className="text-xs text-muted-foreground mb-1">Preview:</p>
                        <p className="text-sm italic text-foreground/80">
                          &quot;{HANDOFF_CUSTOM_TEMPLATE_LABELS[prefs.handoffCustomTemplate].preview}&quot;
                        </p>
                      </div>
                    )}

                  {prefs.handoffCustomTemplate === 'free' && (
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="handoffCustomMsg" className="text-xs">
                        Tu frase de cierre personalizada
                      </Label>
                      <textarea
                        id="handoffCustomMsg"
                        value={handoffCustomMsgRaw}
                        onChange={(e) => setHandoffCustomMsgRaw(e.target.value.slice(0, 250))}
                        placeholder="ej: Cierro la conversación. Te escribe alguien del equipo en menos de 24h por el mismo canal 🙏"
                        rows={2}
                        maxLength={250}
                        className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                      />
                      <div className="flex items-center justify-between text-xs">
                        <p className="text-muted-foreground">
                          El setter dirá esta frase casi literalmente. NO añadirá canales, números
                          ni links que no menciones tú.
                        </p>
                        <span
                          className={`tabular-nums ${handoffCustomMsgRaw.length > 220 ? 'text-warning' : 'text-muted-foreground'}`}
                        >
                          {handoffCustomMsgRaw.length}/250
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </CollapsibleCard>

      {/* CARD 3 — Instrucciones libres movido a componente separado (custom-instructions-list.tsx) */}

      {/* CARD 4 — Cualificación + propuesta de llamada (Sprint 2.5b/B + 2.5b/C) */}
      <CollapsibleCard
        title="Cualificación + propuesta de llamada"
        description="Cómo cualifica el setter y cómo cierra la conversación (calendario, formulario o derivación humana)."
        icon={<CalendarClock className="size-4" />}
        fullWidth
      >
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
                  <span className={`tabular-nums ${calendarClosingRaw.length > 180 ? 'text-warning' : 'text-muted-foreground'}`}>
                    {calendarClosingRaw.length}/200
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Bloque 4 — Nota explicativa cuando modo handoff */}
          {prefs.callProposalMode === 'human_handoff' && (
            <div className="rounded-md border border-warning/30 bg-warning/5 p-4 text-sm">
              <p className="font-medium text-warning/90 mb-1">Modo derivación humana</p>
              <p className="text-xs text-muted-foreground">
                El setter cualificará al lead y, en lugar de proponer llamada o enviar enlace, marcará
                la conversación como handoff. La IA pausará tras ese turno y tú atenderás manualmente.
                Recibirás email si tienes el evento <strong>Handoff a humano</strong> activado abajo.
              </p>
            </div>
          )}
        </CardContent>
      </CollapsibleCard>

      {/* CARD 5 — Notificaciones email (Sprint Gamma 2.5) */}
      <CollapsibleCard
        title="Notificaciones por email"
        description={
          <>
            Elige qué eventos del motor te llegan por email a{' '}
            <code className="font-mono text-xs">{finalPrefs.trainerEmail ?? '(sin email configurado)'}</code>.
            {finalPrefs.trainerEmail == null && (
              <span className="block mt-1 text-warning">
                ⚠ Configura tu email en &quot;Datos de contacto&quot; arriba para activar las notificaciones.
              </span>
            )}
          </>
        }
        icon={<Bell className="size-4" />}
        fullWidth
      >
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
      </CollapsibleCard>

      {/*
        Footer adaptativo:
          - isDirty=true  → barra sticky bottom con CTA prominente "Guardar cambios"
            + "Descartar" (revierte al snapshot guardado). El sticky evita que el
            usuario tenga que scrollear al final tras editar.
          - isDirty=false + custom  → línea discreta confirmando que las prefs
            están activas, con link ghost "Volver a defectos".
          - isDirty=false + isAllDefault  → nada (panel sin ruido cuando todo
            está en valores por defecto).
      */}
      {isDirty ? (
        <div className="lg:col-span-2 sticky bottom-4 z-20">
          <div className="rounded-xl border border-primary/40 bg-card/95 backdrop-blur-md shadow-2xl shadow-primary/20 p-4 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                <Save className="size-4" />
              </span>
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-semibold text-foreground">
                  Tienes cambios sin guardar
                </span>
                <span className="text-xs text-muted-foreground">
                  El setter aplicará tu nueva configuración en el próximo turno tras guardar.
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleDiscardChanges}
                disabled={saving}
              >
                Descartar
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
                    Guardar cambios
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      ) : !isAllDefault ? (
        <div className="lg:col-span-2 flex items-center justify-between gap-3 px-1 py-2 text-xs flex-wrap">
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <CheckCircle2 className="size-3.5 text-success" />
            Tus preferencias están activas. El setter las aplica en cada conversación.
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleResetDefaults}
            disabled={saving}
            className="text-muted-foreground hover:text-destructive"
          >
            <RotateCcw className="size-3.5" />
            Volver a defectos
          </Button>
        </div>
      ) : null}
    </div>
  );
}

// =============================================================================
// CustomEmojiList — sub-componente de la sección Emoticonos (Sprint 2.5b/E)
// =============================================================================

interface CustomEmojiListProps {
  items: EmojiCustomization[];
  onChange: (next: EmojiCustomization[]) => void;
}

function CustomEmojiList({ items, onChange }: CustomEmojiListProps) {
  const [newEmoji, setNewEmoji] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const MAX = 8;

  function add() {
    const e = newEmoji.trim();
    const d = newDesc.trim();
    if (!e || !d) return;
    if (items.length >= MAX) return;
    if (items.some((it) => it.emoji === e)) return; // dedup
    onChange([...items, { emoji: e, whenToUse: d }]);
    setNewEmoji('');
    setNewDesc('');
  }

  function remove(idx: number) {
    onChange(items.filter((_, i) => i !== idx));
  }

  function updateItem(idx: number, patch: Partial<EmojiCustomization>) {
    onChange(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Label className="text-sm">Lista personalizada de emojis (opcional)</Label>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Si dejas la lista vacía, el setter usa los emojis del Coach con criterio normal. Si añades
          tus propios emojis, el setter usará <strong className="text-foreground/80">SOLO esos</strong>{' '}
          y nunca otros — para que el lead reciba siempre tu marca visual. Máximo {MAX} emojis.
          Describe cuándo usar cada uno (ej: &quot;cuando el lead celebre algo&quot;, &quot;al
          proponer la llamada&quot;).
        </p>
      </div>

      {items.length > 0 && (
        <div className="flex flex-col gap-2">
          {items.map((it, idx) => (
            <div
              key={idx}
              className="flex items-start gap-2 p-2 rounded-md border border-border/40 bg-background/40"
            >
              <Input
                value={it.emoji}
                onChange={(e) => updateItem(idx, { emoji: e.target.value })}
                maxLength={8}
                className="w-16 text-center text-lg shrink-0"
                aria-label={`Emoji ${idx + 1}`}
              />
              <Input
                value={it.whenToUse}
                onChange={(e) => updateItem(idx, { whenToUse: e.target.value.slice(0, 100) })}
                maxLength={100}
                placeholder="ej: cuando el lead celebre algo"
                className="flex-1"
                aria-label={`Descripción emoji ${idx + 1}`}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => remove(idx)}
                className="shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                aria-label={`Eliminar emoji ${idx + 1}`}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {items.length < MAX ? (
        <div className="flex items-start gap-2 p-2 rounded-md border border-dashed border-border/60">
          <Input
            value={newEmoji}
            onChange={(e) => setNewEmoji(e.target.value)}
            maxLength={8}
            placeholder="✨"
            className="w-16 text-center text-lg shrink-0"
            aria-label="Nuevo emoji"
          />
          <Input
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value.slice(0, 100))}
            maxLength={100}
            placeholder="Cuándo usarlo (ej: cuando el lead celebre algo)"
            className="flex-1"
            aria-label="Descripción nuevo emoji"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={add}
            disabled={!newEmoji.trim() || !newDesc.trim()}
            className="shrink-0"
          >
            <Plus className="size-4" />
            Añadir
          </Button>
        </div>
      ) : (
        <p className="text-xs text-warning">
          Has llegado al máximo de {MAX} emojis. Elimina alguno para añadir otro.
        </p>
      )}

      <p className="text-[11px] text-muted-foreground">
        {items.length}/{MAX} emojis configurados
      </p>
    </div>
  );
}

// =============================================================================
// ForbiddenPhrasesList — sub-componente del card "Vocabulario prohibido" (Hito 12.1)
// =============================================================================

interface ForbiddenPhrasesListProps {
  items: string[];
  onChange: (next: string[]) => void;
}

function ForbiddenPhrasesList({ items, onChange }: ForbiddenPhrasesListProps) {
  const [draft, setDraft] = useState('');
  const trimmedDraft = draft.trim().toLowerCase();
  const isDuplicate = trimmedDraft !== '' && items.includes(trimmedDraft);
  const canAdd =
    trimmedDraft !== '' &&
    trimmedDraft.length <= MAX_FORBIDDEN_PHRASE_CHARS &&
    !isDuplicate &&
    items.length < MAX_FORBIDDEN_PHRASES;

  function add() {
    if (!canAdd) return;
    const sanitized = sanitizeForbiddenPhrase(trimmedDraft);
    if (sanitized == null) return;
    if (items.includes(sanitized)) return;
    onChange([...items, sanitized]);
    setDraft('');
  }

  function remove(idx: number) {
    onChange(items.filter((_, i) => i !== idx));
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground leading-relaxed">
        Cada entrada es 1 palabra o frase corta (máx {MAX_FORBIDDEN_PHRASE_CHARS} chars). El motor
        compara con coincidencia exacta de palabra (insensible a mayúsculas), no fuzzy. Ejemplos
        útiles: muletillas a evitar ("genial", "perfecto", "súper"), tratamientos no deseados
        ("amigo", "colega"), términos sensibles del sector. Máximo {MAX_FORBIDDEN_PHRASES} entradas.
      </p>

      {items.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {items.map((phrase, idx) => (
            <span
              key={`${phrase}-${idx}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-destructive/30 bg-destructive/5 px-2.5 py-1 text-xs text-destructive"
            >
              <span className="font-mono">"{phrase}"</span>
              <button
                type="button"
                onClick={() => remove(idx)}
                aria-label={`Eliminar "${phrase}"`}
                className="hover:bg-destructive/15 rounded-full p-0.5 transition-colors"
              >
                <Trash2 className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {items.length < MAX_FORBIDDEN_PHRASES ? (
        <div className="flex items-start gap-2 p-2 rounded-md border border-dashed border-border/60">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, MAX_FORBIDDEN_PHRASE_CHARS))}
            maxLength={MAX_FORBIDDEN_PHRASE_CHARS}
            placeholder='ej: "genial" o "qué tal andas"'
            className={`flex-1 ${isDuplicate ? 'border-destructive' : ''}`}
            aria-label="Nueva palabra o frase prohibida"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={add}
            disabled={!canAdd}
            className="shrink-0"
          >
            <Plus className="size-4" />
            Añadir
          </Button>
        </div>
      ) : (
        <p className="text-xs text-warning">
          Has llegado al máximo de {MAX_FORBIDDEN_PHRASES} entradas. Elimina alguna para añadir otra.
        </p>
      )}

      {isDuplicate && (
        <p className="text-[11px] text-destructive">
          Esta frase ya está en la lista (la comparación es insensible a mayúsculas).
        </p>
      )}
    </div>
  );
}
