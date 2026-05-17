'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Circle, ExternalLink, Copy, Check, Loader2, Rocket } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  setWelcomeTemplate,
  ensureLeadFormToken,
  type OnboardingStatus,
} from '@/lib/actions/welcome-template';
import { markOnboardingCompleteAction } from '@/lib/actions/tenants';

interface CandidateTemplate {
  id: number;
  name: string;
  provider: string;
  language: string | null;
  status: string;
}

interface Props {
  status: OnboardingStatus;
  candidateTemplates: CandidateTemplate[];
  panelOrigin: string;
  motorOrigin: string;
}

export function OnboardingWizard({
  status,
  candidateTemplates,
  panelOrigin: _panelOrigin,
  motorOrigin,
}: Props) {
  const router = useRouter();
  const [pendingWelcome, startWelcomeTransition] = useTransition();
  const [pendingToken, startTokenTransition] = useTransition();
  const [pendingComplete, startCompleteTransition] = useTransition();
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(
    status.welcome.welcomeTemplateId,
  );
  const [token, setToken] = useState<string | null>(status.welcome.leadFormToken);
  const [copied, setCopied] = useState(false);

  const onSaveWelcome = () => {
    if (pendingWelcome) return;
    startWelcomeTransition(async () => {
      const res = await setWelcomeTemplate(selectedTemplateId);
      if (!res.ok) {
        toast.error(`Error: ${res.error}`);
        return;
      }
      toast.success('Plantilla bienvenida designada.');
      router.refresh();
    });
  };

  const onGenerateToken = () => {
    if (pendingToken) return;
    startTokenTransition(async () => {
      const res = await ensureLeadFormToken();
      if (!res.ok) {
        toast.error(`Error: ${res.error}`);
        return;
      }
      setToken(res.token);
      toast.success(
        res.created ? 'Token de webhook generado.' : 'Token recuperado.',
      );
      router.refresh();
    });
  };

  const onCopyUrl = async () => {
    if (!token) return;
    const url = `${motorOrigin || '<MOTOR_URL>'}/automations/lead-form/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      toast.success('URL copiada al portapapeles.');
    } catch {
      toast.error('No se pudo copiar al portapapeles.');
    }
  };

  const stepsCompleted = [
    status.ghl.connected,
    status.keywords.hasBienvenida && status.keywords.hasLeadMagnet,
    status.ycloud.connected && status.ycloud.templatesApproved > 0,
    status.welcome.welcomeTemplateId != null && status.welcome.leadFormToken != null,
  ];
  const totalCompleted = stepsCompleted.filter(Boolean).length;
  const allComplete = totalCompleted === stepsCompleted.length;

  const onMarkComplete = () => {
    if (pendingComplete) return;
    startCompleteTransition(async () => {
      const res = await markOnboardingCompleteAction();
      if (!res.ok) {
        toast.error(`No se pudo cerrar el setup: ${res.error}`);
        return;
      }
      if (res.alreadyComplete) {
        toast.info('El setup ya estaba marcado como completo. Te llevamos al panel.');
      } else {
        toast.success('Setup marcado como completo. Ya puedes recibir leads.');
      }
      router.push('/dashboard');
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-md border border-border bg-card p-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">
            Progreso: {totalCompleted}/4 pasos completados
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {totalCompleted === 4
              ? '🎉 Todo listo. Las automatizaciones externas pueden empezar a enviar leads.'
              : 'Completa todos los pasos para activar la captación end-to-end.'}
          </p>
        </div>
        <div className="flex gap-1">
          {stepsCompleted.map((done, i) => (
            <span
              key={i}
              className={cn(
                'size-2 rounded-full',
                done ? 'bg-success' : 'bg-muted-foreground/30',
              )}
            />
          ))}
        </div>
      </div>

      {/* Step 1 — GHL */}
      <StepCard
        index={1}
        title="Conectar GoHighLevel (canales IG / FB)"
        description="GHL es el conector de origen para Instagram y Facebook. Cuando un lead comenta una keyword en un post, GHL lo enruta vía workflow webhook hacia el SaaS."
        completed={status.ghl.connected}
      >
        {status.ghl.connected ? (
          <p className="text-sm text-success mb-3">
            ✓ Conectado{' '}
            {status.ghl.locationId ? (
              <span className="text-muted-foreground font-mono text-xs">
                · location {status.ghl.locationId}
              </span>
            ) : null}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground mb-3">
            Pulsa el botón para iniciar el flujo OAuth Marketplace e instalar la
            app Fyzon en tu sub-cuenta GHL.
          </p>
        )}
        <Button asChild variant={status.ghl.connected ? 'outline' : 'default'} size="sm">
          <a
            href="/api/integrations/oauth-install-redirect"
            target="_blank"
            rel="noopener noreferrer"
            className="gap-1.5"
          >
            <ExternalLink className="size-3.5" />
            {status.ghl.connected ? 'Reconectar GHL' : 'Conectar con GHL'}
          </a>
        </Button>
      </StepCard>

      {/* Step 2 — Keywords */}
      <StepCard
        index={2}
        title="Configurar palabras clave de origen"
        description="El motor clasifica los webhooks GHL por keyword: 'bienvenida' (trainer escribe a lead nuevo), 'lm' (lead pide recurso/info), 'inbound' (lead responde DM espontáneo). Sin keywords, los outbounds manuales del trainer no activan IA."
        completed={status.keywords.hasBienvenida && status.keywords.hasLeadMagnet}
      >
        <div className="text-sm text-muted-foreground mb-3 space-y-1">
          <p>
            Estado actual: <strong className="text-foreground">{status.keywords.count}</strong> keywords activas{' '}
            {status.keywords.hasBienvenida ? '✓ bienvenida' : '✗ falta bienvenida'} ·{' '}
            {status.keywords.hasLeadMagnet ? '✓ lead magnet' : '✗ falta lead magnet'}
          </p>
        </div>
        <div className="rounded-md border border-warning/30 bg-warning/5 p-3 mb-3 text-xs text-muted-foreground space-y-1.5">
          <p>
            <strong className="text-foreground">⚠️ No confundir con &quot;Etiquetas&quot;.</strong>
          </p>
          <p>
            <strong>Keywords</strong> (aquí) = filtros que clasifican el ORIGEN de un mensaje
            que llega de GHL (bienvenida manual / lead magnet / inbound). Activan la IA o la
            pausan. Operan a nivel de webhook al entrar.
          </p>
          <p>
            <strong>Etiquetas</strong> = chips de colores en las conversaciones (Hot Lead,
            Comprado, Perdido…) para organización visual del kanban. NO afectan al routing del
            motor.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/keywords" className="gap-1.5">
            Editar keywords
          </Link>
        </Button>
      </StepCard>

      {/* Step 3 — YCloud */}
      <StepCard
        index={3}
        title="Conectar YCloud + sincronizar plantillas WA"
        description="YCloud es el BSP oficial Meta para WhatsApp. Pega tu API key + business phone, sincroniza las plantillas aprobadas en Meta y prepara el canal para enviar bienvenidas."
        completed={status.ycloud.connected && status.ycloud.templatesApproved > 0}
      >
        <div className="text-sm text-muted-foreground mb-3 space-y-1">
          <p>
            Estado:{' '}
            {status.ycloud.connected ? (
              <span className="text-success">✓ YCloud conectado</span>
            ) : (
              <span>✗ YCloud no conectado</span>
            )}{' '}
            ·{' '}
            <strong className="text-foreground">{status.ycloud.templatesApproved}</strong>{' '}
            plantillas aprobadas (de {status.ycloud.templatesCount} totales)
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button asChild variant="outline" size="sm">
            <Link href="/settings/integrations" className="gap-1.5">
              Configurar YCloud
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/settings/followup-templates" className="gap-1.5">
              Sincronizar plantillas
            </Link>
          </Button>
        </div>
      </StepCard>

      {/* Step 4 — Welcome template + lead-form URL */}
      <StepCard
        index={4}
        title="Designar plantilla bienvenida + URL del webhook"
        description="Selecciona qué plantilla WhatsApp se envía cuando un lead rellena un formulario externo (VSL, Tally, Meta Lead Ads). La URL del webhook se pega en tu automation n8n / GHL Workflow para disparar la bienvenida."
        completed={
          status.welcome.welcomeTemplateId != null && status.welcome.leadFormToken != null
        }
      >
        {/* Selector de plantilla */}
        <div className="space-y-2 mb-4">
          <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Plantilla bienvenida (WhatsApp)
          </label>
          {candidateTemplates.length === 0 ? (
            <p className="text-sm text-warning">
              No hay plantillas WhatsApp aprobadas. Completa el paso 3 primero.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              <select
                value={selectedTemplateId ?? ''}
                onChange={(e) =>
                  setSelectedTemplateId(
                    e.target.value === '' ? null : Number(e.target.value),
                  )
                }
                className="w-full rounded-md border border-border bg-background text-sm px-2 py-1.5"
              >
                <option value="">— Sin designar —</option>
                {candidateTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} · {t.provider} · {t.language ?? 'sin idioma'} ·{' '}
                    {t.status}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                onClick={onSaveWelcome}
                disabled={pendingWelcome}
                className="self-start gap-1.5"
              >
                {pendingWelcome ? <Loader2 className="size-3 animate-spin" /> : null}
                Guardar plantilla bienvenida
              </Button>
              {status.welcome.welcomeTemplateName ? (
                <p className="text-xs text-success">
                  ✓ Actualmente: <strong>{status.welcome.welcomeTemplateName}</strong>
                </p>
              ) : null}
            </div>
          )}
        </div>

        {/* URL del webhook */}
        <div className="space-y-2 pt-3 border-t border-border">
          <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            URL del webhook /automations/lead-form
          </label>
          {!motorOrigin ? (
            <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-warning/90 space-y-1.5">
              <p className="font-medium">⚠️ Falta configurar la URL del motor.</p>
              <p>
                Añade esta línea al fichero <code>.env.local</code> del panel
                (en la raíz del proyecto Fyzon Setters) y reinicia{' '}
                <code>pnpm --filter @fyzon/panel dev</code>:
              </p>
              <pre className="bg-black/30 p-2 rounded text-[11px] overflow-x-auto">
                NEXT_PUBLIC_MOTOR_ORIGIN=https://tu-motor.fyzon.es
              </pre>
              <p>
                En dev local: <code>NEXT_PUBLIC_MOTOR_ORIGIN=http://localhost:3001</code>.
                En producción: la URL pública del motor (ej.{' '}
                <code>https://setter.fyzon.es</code>). Sin esta var, el panel no
                puede componer la URL completa del webhook que pegas en GHL/n8n.
              </p>
            </div>
          ) : null}

          {token && motorOrigin ? (
            <div className="flex flex-col gap-1.5">
              <div className="flex gap-1.5 items-center">
                <code className="flex-1 text-xs bg-muted px-2 py-1.5 rounded border border-border break-all">
                  {motorOrigin}/automations/lead-form/{token}
                </code>
                <Button size="sm" variant="outline" onClick={onCopyUrl} className="gap-1">
                  {copied ? (
                    <Check className="size-3.5 text-success" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Pega esta URL en tu automation n8n / GHL Workflow / Tally / Meta
                Lead Ads. Body JSON esperado:{' '}
                <code className="text-foreground">
                  {'{ "phone": "+34600...", "first_name": "..." }'}
                </code>
              </p>
            </div>
          ) : null}

          {token && !motorOrigin ? (
            <p className="text-xs text-muted-foreground">
              Token webhook generado: <code>{token}</code>. La URL completa
              estará disponible cuando configures la env var del motor (ver
              recuadro de arriba).
            </p>
          ) : null}

          {!token && motorOrigin ? (
            <Button
              size="sm"
              onClick={onGenerateToken}
              disabled={pendingToken}
              className="gap-1.5"
            >
              {pendingToken ? <Loader2 className="size-3 animate-spin" /> : null}
              Generar token de webhook
            </Button>
          ) : null}

          {!token && !motorOrigin ? (
            <Button
              size="sm"
              onClick={onGenerateToken}
              disabled={pendingToken}
              variant="outline"
              className="gap-1.5"
            >
              {pendingToken ? <Loader2 className="size-3 animate-spin" /> : null}
              Generar token (la URL completa requerirá configurar la env)
            </Button>
          ) : null}
        </div>
      </StepCard>

      {/* CTA final — solo visible cuando los 4 steps están en verde. */}
      <Card
        className={cn(
          'transition-colors',
          allComplete
            ? 'border-success/40 bg-success/5'
            : 'border-dashed border-border bg-muted/20 opacity-70',
        )}
      >
        <CardContent className="p-4 flex items-center gap-3 flex-wrap">
          <Rocket
            className={cn(
              'size-5 shrink-0',
              allComplete ? 'text-success' : 'text-muted-foreground',
            )}
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">
              {allComplete
                ? 'Setup completo. Marca como terminado para activar tu panel.'
                : `Completa los ${stepsCompleted.length - totalCompleted} pasos restantes para poder cerrar el setup.`}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {allComplete
                ? 'Al hacer click, se marca tenants.onboarded_at y desaparecen los banners de configuración.'
                : 'No vas a recibir leads automáticamente hasta entonces.'}
            </p>
          </div>
          <Button
            type="button"
            onClick={onMarkComplete}
            disabled={!allComplete || pendingComplete}
            className="gap-1.5"
          >
            {pendingComplete ? <Loader2 className="size-3.5 animate-spin" /> : null}
            Marcar setup como completo
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function StepCard({
  index,
  title,
  description,
  completed,
  children,
}: {
  index: number;
  title: string;
  description: string;
  completed: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-start gap-3 space-y-0">
        {completed ? (
          <CheckCircle2 className="size-5 text-success shrink-0 mt-0.5" />
        ) : (
          <Circle className="size-5 text-muted-foreground shrink-0 mt-0.5" />
        )}
        <div className="flex-1">
          <CardTitle className="text-base flex items-center gap-2">
            <span className="text-xs text-muted-foreground tabular-nums">
              Paso {index}
            </span>
            <span>{title}</span>
          </CardTitle>
          <CardDescription className="mt-1.5 text-sm leading-relaxed">
            {description}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="pt-0">{children}</CardContent>
    </Card>
  );
}
