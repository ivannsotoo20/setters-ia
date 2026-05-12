'use client';

import { useState, useTransition, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Check, AlertTriangle, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  provisionTenantAction,
  checkSlugAvailabilityAction,
  checkEmailAvailabilityAction,
  type SlugAvailability,
  type EmailAvailability,
} from '@/lib/actions/tenants';

const TIMEZONES = [
  { value: 'Europe/Madrid', label: 'Europe/Madrid (España)' },
  { value: 'Europe/Lisbon', label: 'Europe/Lisbon (Portugal)' },
  { value: 'Europe/London', label: 'Europe/London (Reino Unido)' },
  { value: 'America/Mexico_City', label: 'America/Mexico_City' },
  { value: 'America/Argentina/Buenos_Aires', label: 'America/Argentina/Buenos_Aires' },
  { value: 'America/Bogota', label: 'America/Bogotá' },
  { value: 'America/Lima', label: 'America/Lima' },
  { value: 'America/Santiago', label: 'America/Santiago' },
  { value: 'America/Caracas', label: 'America/Caracas' },
  { value: 'UTC', label: 'UTC' },
];

/** Slug helper (sincronizado con `apps/panel/lib/actions/tenants.ts:slugifyInternal`). */
function slugifyClient(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function formatExpiresLabel(date: Date): string {
  try {
    return date.toLocaleString('es-ES', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'Europe/Madrid',
    });
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

export function CreateTenantForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [trainerFullName, setTrainerFullName] = useState('');
  const [trainerEmail, setTrainerEmail] = useState('');
  const [tenantName, setTenantName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [timezone, setTimezone] = useState('Europe/Madrid');
  const [internalNotes, setInternalNotes] = useState('');

  const [slugCheck, setSlugCheck] = useState<
    { state: 'idle' } | { state: 'checking' } | SlugAvailability
  >({ state: 'idle' });
  const [emailCheck, setEmailCheck] = useState<
    { state: 'idle' } | { state: 'checking' } | EmailAvailability
  >({ state: 'idle' });

  const [highlightField, setHighlightField] = useState<string | null>(null);

  // Refs para focus en errores.
  const nameRef = useRef<HTMLInputElement>(null);
  const slugRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const fullNameRef = useRef<HTMLInputElement>(null);

  // Auto-fill slug desde tenantName si no se ha editado manualmente.
  const onTenantNameBlur = () => {
    if (!slugManuallyEdited && tenantName.trim().length >= 2) {
      const suggested = slugifyClient(tenantName);
      if (suggested.length >= 3) {
        setSlug(suggested);
        runSlugCheck(suggested);
      }
    }
  };

  // Debounced slug check.
  const runSlugCheck = useCallback((value: string) => {
    setSlugCheck({ state: 'checking' });
    void checkSlugAvailabilityAction(value).then(setSlugCheck);
  }, []);

  useEffect(() => {
    if (slug.length === 0) {
      setSlugCheck({ state: 'idle' });
      return;
    }
    const handle = setTimeout(() => runSlugCheck(slug), 400);
    return () => clearTimeout(handle);
  }, [slug, runSlugCheck]);

  // Debounced email check.
  useEffect(() => {
    if (trainerEmail.length === 0) {
      setEmailCheck({ state: 'idle' });
      return;
    }
    const handle = setTimeout(() => {
      setEmailCheck({ state: 'checking' });
      void checkEmailAvailabilityAction(trainerEmail).then(setEmailCheck);
    }, 350);
    return () => clearTimeout(handle);
  }, [trainerEmail]);

  // ¿Puede enviar?
  const slugOk = slugCheck.state === 'available';
  const emailOk = emailCheck.state === 'ok';
  const requiredFilled =
    trainerFullName.trim().length >= 2 &&
    trainerEmail.trim().length > 0 &&
    tenantName.trim().length >= 2 &&
    slug.length >= 3;
  const canSubmit = !pending && requiredFilled && slugOk && emailOk;

  const focusField = (field: string) => {
    setHighlightField(field);
    setTimeout(() => setHighlightField(null), 3000);
    if (field === 'name') nameRef.current?.focus();
    else if (field === 'slug') slugRef.current?.focus();
    else if (field === 'trainerEmail') emailRef.current?.focus();
    else if (field === 'trainerFullName') fullNameRef.current?.focus();
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    startTransition(async () => {
      const res = await provisionTenantAction({
        name: tenantName.trim(),
        slug,
        trainerEmail: trainerEmail.trim().toLowerCase(),
        trainerFullName: trainerFullName.trim(),
        timezone,
        internalNotes: internalNotes.trim() || null,
      });

      if (!res.ok) {
        if (res.field) focusField(res.field);
        toast.error(res.error, { duration: 8000 });
        return;
      }

      if (res.inviteWarning) {
        toast.warning(
          `Sub-cuenta creada, pero el email a ${trainerEmail} falló. Reenvía desde la sección Miembros.`,
          { duration: 9000 },
        );
      } else {
        toast.success(
          `Sub-cuenta creada. Invitación enviada a ${trainerEmail}.`,
          { duration: 8000 },
        );
      }
      router.push(`/admin/tenants/${res.tenantId}?just_created=1`);
    });
  };

  const expiresLabel = formatExpiresLabel(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));

  return (
    <form onSubmit={onSubmit} className="grid grid-cols-12 gap-6">
      {/* Columna izquierda — Form */}
      <div className="col-span-12 lg:col-span-7 flex flex-col gap-4">
        {/* Card Cliente */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cliente (trainer)</CardTitle>
            <CardDescription>
              La persona que recibirá la invitación y será owner del tenant.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4">
            <FieldWrapper
              label="Nombre completo"
              required
              error={
                highlightField === 'trainerFullName'
                  ? 'Indica un nombre completo (mínimo 2 caracteres).'
                  : null
              }
            >
              <Input
                ref={fullNameRef}
                value={trainerFullName}
                onChange={(e) => setTrainerFullName(e.target.value)}
                placeholder="Sergio Pérez García"
                maxLength={80}
                disabled={pending}
                aria-invalid={highlightField === 'trainerFullName' ? 'true' : undefined}
              />
            </FieldWrapper>

            <FieldWrapper
              label="Email del trainer"
              required
              helper="Recibirá un link de activación válido 7 días."
              error={
                emailCheck.state === 'pending_invite'
                  ? `Ya hay una invitación activa para este email en ${emailCheck.tenantName ?? 'otro tenant'} (#${emailCheck.tenantId ?? '?'}). Cancélala antes de reinvitar.`
                  : emailCheck.state === 'profile_exists'
                  ? `Este email ya pertenece a otro tenant (${emailCheck.tenantName ?? '?'}). Quítalo de allá antes.`
                  : emailCheck.state === 'invalid' && trainerEmail.length > 0
                  ? 'Email no válido.'
                  : null
              }
              status={
                emailCheck.state === 'checking' ? (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Loader2 className="size-3 animate-spin" /> Comprobando…
                  </span>
                ) : emailCheck.state === 'ok' ? (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-500">
                    <Check className="size-3" /> Disponible
                  </span>
                ) : null
              }
            >
              <Input
                ref={emailRef}
                type="email"
                value={trainerEmail}
                onChange={(e) => setTrainerEmail(e.target.value)}
                placeholder="sergio@coachingsergio.com"
                maxLength={254}
                disabled={pending}
                aria-invalid={
                  emailCheck.state === 'pending_invite' ||
                  emailCheck.state === 'profile_exists' ||
                  (emailCheck.state === 'invalid' && trainerEmail.length > 0)
                    ? 'true'
                    : undefined
                }
              />
            </FieldWrapper>
          </CardContent>
        </Card>

        {/* Card Sub-cuenta */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sub-cuenta</CardTitle>
            <CardDescription>
              Identidad y configuración base. Editable después en la tab Coach.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <FieldWrapper
              className="col-span-2"
              label="Nombre del negocio"
              required
              helper="Lo que verá el trainer arriba en su panel. Puede llevar tildes y mayúsculas."
              error={highlightField === 'name' ? 'El nombre debe tener al menos 2 caracteres.' : null}
            >
              <Input
                ref={nameRef}
                value={tenantName}
                onChange={(e) => setTenantName(e.target.value)}
                onBlur={onTenantNameBlur}
                placeholder="Coaching Sergio Pérez"
                maxLength={80}
                disabled={pending}
                aria-invalid={highlightField === 'name' ? 'true' : undefined}
              />
            </FieldWrapper>

            <FieldWrapper
              className="col-span-2"
              label="Slug (URL técnica)"
              required
              helper="Solo a-z, 0-9 y guiones. 3-40 chars. No editable después."
              error={
                slugCheck.state === 'taken'
                  ? `Ya en uso. Prueba "${slug}-2".`
                  : slugCheck.state === 'reserved'
                  ? 'Slug reservado. Usa otro.'
                  : slugCheck.state === 'invalid' && slug.length > 0
                  ? 'Solo a-z, 0-9 y guiones. Sin espacios ni tildes.'
                  : null
              }
              status={
                slugCheck.state === 'checking' ? (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Loader2 className="size-3 animate-spin" /> Comprobando…
                  </span>
                ) : slugCheck.state === 'available' ? (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-500">
                    <Check className="size-3" /> Disponible
                  </span>
                ) : null
              }
            >
              <Input
                ref={slugRef}
                value={slug}
                onChange={(e) => {
                  setSlugManuallyEdited(true);
                  setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40));
                }}
                placeholder="coaching-sergio"
                maxLength={40}
                disabled={pending}
                className="font-mono"
                aria-invalid={
                  slugCheck.state === 'taken' ||
                  slugCheck.state === 'reserved' ||
                  (slugCheck.state === 'invalid' && slug.length > 0)
                    ? 'true'
                    : undefined
                }
              />
              {slugCheck.state === 'taken' && slug.length > 0 ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setSlug(`${slug}-2`);
                  }}
                  className="self-start mt-1 gap-1"
                  disabled={pending}
                >
                  <Sparkles className="size-3" /> Usar &quot;{slug}-2&quot;
                </Button>
              ) : null}
            </FieldWrapper>

            <FieldWrapper className="col-span-2 md:col-span-1" label="Zona horaria">
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                disabled={pending}
                className="w-full rounded-md border border-border bg-background text-sm px-2 py-1.5"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </select>
            </FieldWrapper>
          </CardContent>
        </Card>

        {/* Card Notas internas */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notas internas (opcional)</CardTitle>
            <CardDescription>
              Solo visibles para admins Fyzon. Se guardan en{' '}
              <code className="font-mono text-xs">tenants.settings.internal_notes</code>.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={internalNotes}
              onChange={(e) => setInternalNotes(e.target.value)}
              placeholder="Lead de Iván, cerró auditoría 12-may. Vertical fitness. Sin GHL todavía."
              maxLength={2000}
              rows={3}
              disabled={pending}
            />
            <p className="text-xs text-muted-foreground mt-1.5 text-right tabular-nums">
              {internalNotes.length} / 2000
            </p>
          </CardContent>
        </Card>

        {/* Footer botones */}
        <div className="flex justify-end gap-2 flex-wrap">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push('/admin/tenants')}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button type="submit" disabled={!canSubmit} className="gap-1.5">
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {pending ? 'Creando…' : 'Crear sub-cuenta y enviar invitación'}
          </Button>
        </div>
      </div>

      {/* Columna derecha — Preview */}
      <aside className="col-span-12 lg:col-span-5 self-start lg:sticky lg:top-24">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resumen previo</CardTitle>
            <CardDescription>
              Esto es lo que vas a crear con un click. Todo atómico (si algo
              falla, no se queda nada a medias).
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <PreviewBlock title="URL del panel del trainer">
              <div className="flex items-center gap-2 flex-wrap">
                <code className="font-mono text-sm">panel.fyzon.es</code>
                <Badge variant="outline" className="text-xs">
                  todos los tenants comparten host
                </Badge>
              </div>
              {slug ? (
                <p className="text-xs text-muted-foreground mt-1">
                  slug interno: <code className="font-mono">{slug || '—'}</code>
                </p>
              ) : null}
            </PreviewBlock>

            <PreviewBlock title="Recursos que se provisionan">
              <ul className="text-xs space-y-1 text-muted-foreground">
                <li>✓ tenant_configs (timezone <code className="font-mono text-foreground">{timezone}</code>)</li>
                <li>✓ trainer_preferences (estructura por defecto)</li>
                <li>✓ prompt_blocks coach_v3 (placeholder vacío — lo pegas tú después)</li>
                <li>✓ 3 webhook tokens (YCloud, GHL, Lead Form)</li>
                <li>✓ 8 system labels (Hot Lead, Comprado, Activo…) vía trigger</li>
                <li>✓ 7 dashboard widgets KPI vía trigger</li>
                <li>✓ tenant_followup_config (auto, deshabilitado por defecto)</li>
                <li>✓ Invitación owner con token válido 7 días</li>
              </ul>
            </PreviewBlock>

            <PreviewBlock title="Email que se va a mandar">
              <dl className="text-xs space-y-1 text-muted-foreground">
                <DL label="From">Fyzon Setters &lt;alertas@fyzon.es&gt;</DL>
                <DL label="To">{trainerEmail || '—'}</DL>
                <DL label="Subject">Activa tu acceso a Fyzon Setters</DL>
                <DL label="CTA">Activar mi cuenta → /accept-invite?token=…</DL>
                <DL label="Caduca">{expiresLabel}</DL>
              </dl>
            </PreviewBlock>

            <div
              className={cn(
                'rounded-md border p-3 text-xs',
                'border-amber-500/40 bg-amber-500/5 text-amber-200',
              )}
            >
              <p className="font-medium text-foreground flex items-center gap-1.5">
                <AlertTriangle className="size-3.5" />
                Después de crear, recuerda
              </p>
              <ol className="mt-1.5 space-y-0.5 list-decimal list-inside">
                <li>Te llevaremos a la vista de la sub-cuenta.</li>
                <li>Pega el prompt coach v3 inicial (tab Coach).</li>
                <li>El trainer recibe el email y activa su cuenta.</li>
              </ol>
            </div>
          </CardContent>
        </Card>
      </aside>
    </form>
  );
}

// ----- helpers UI ------------------------------------------------------------

function FieldWrapper({
  label,
  helper,
  error,
  status,
  required,
  children,
  className,
}: {
  label: string;
  helper?: string;
  error?: string | null;
  status?: React.ReactNode;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
        {required ? <span className="text-destructive ml-0.5">*</span> : null}
      </Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : helper ? (
        <p className="text-xs text-muted-foreground">{helper}</p>
      ) : null}
      {status ? <div>{status}</div> : null}
    </div>
  );
}

function PreviewBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1.5">
        {title}
      </p>
      {children}
    </div>
  );
}

function DL({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2 items-start">
      <dt className="font-medium text-foreground shrink-0 w-16">{label}:</dt>
      <dd className="flex-1 break-words">{children}</dd>
    </div>
  );
}
