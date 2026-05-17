import { env } from '../config/env.js';
import { renderEmailShell, escapeHtml } from './email-shell.js';

/**
 * Templates HTML para notificaciones email al trainer.
 *
 * Hito 11 (2026-05-11): refactor para usar el shell común `email-shell.ts`,
 * alineado visualmente con los emails del panel (Reset Password, Invite, etc.).
 * Mismo logo Fyzon CDN, mismo footer, misma paleta light professional.
 *
 * Cada template recibe `{tenantName, payload}` y devuelve `{subject, html}`.
 * El payload es el JSONB de notification_events.payload, con campos esperados
 * según el event_type.
 */

// Sprint 2.5b/A: `error_motor` removido del set público.
export type NotificationEventType =
  | 'handoff'
  | 'qualified'
  | 'appointment_booked'
  | 'descalified'
  | 'paused_by_rule';

export interface RenderedEmail {
  subject: string;
  html: string;
}

export interface RenderArgs {
  tenantName: string;
  /** Contenido de notification_events.payload (estructura variable por event_type). */
  payload: Record<string, unknown>;
  /** Nombre del trainer para saludo personalizado en el email. */
  trainerName?: string | null;
}

const esc = escapeHtml;

function panelUrl(path: string): string {
  const base = env.PANEL_PUBLIC_URL.replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Bloque "field" reutilizable: `Label: value` con tipografía secundaria. */
function field(label: string, value: unknown): string {
  if (value == null || value === '') return '';
  return `<p style="margin:6px 0;font-size:14px;color:#374151;">
      <span style="color:#6b7280;">${esc(label)}:</span>
      <strong style="margin-left:6px;color:#0f172a;">${esc(value)}</strong>
    </p>`;
}

/** Greeting block: "Hola Iván," — vacío si no hay trainerName. */
function greeting(trainerName?: string | null): string {
  if (!trainerName) return '';
  return `<p style="margin:0 0 14px 0;color:#374151;font-size:15px;line-height:1.65;">Hola ${esc(trainerName)},</p>`;
}

/** Tag pequeña arriba del título con el nombre del tenant. */
function tenantContext(tenantName: string, eventLabel: string): string {
  return `Aviso del setter · ${eventLabel} · ${tenantName}`;
}

// =============================================================================
// Templates por event_type
// =============================================================================

function renderHandoff(args: RenderArgs): RenderedEmail {
  const p = args.payload;
  const conversationId = p.conversation_id as number | undefined;
  const leadName = (p.lead_first_name as string | undefined) ?? 'Lead sin nombre';
  const handoffCause = (p.handoff_cause as string | undefined) ?? '(no especificada)';
  const lastMessage = (p.last_message_excerpt as string | undefined) ?? '';

  const subject = `Handoff a humano · ${leadName}`;
  const body = `${greeting(args.trainerName)}<p style="margin:0 0 14px 0;color:#374151;font-size:15px;line-height:1.65;">La IA ha pasado la conversación con <strong style="color:#0f172a;">${esc(leadName)}</strong> a ti.</p>
${field('Causa del handoff', handoffCause)}
${lastMessage ? `<div style="margin:14px 0;padding:14px;background:#f8fafc;border-left:3px solid #10b981;border-radius:4px;font-size:14px;color:#374151;font-style:italic;line-height:1.5;">"${esc(lastMessage)}"</div>` : ''}`;

  return {
    subject,
    html: renderEmailShell({
      audience: 'trainer',
      variant: 'notification',
      preheader: `${leadName} necesita tu atención — handoff de la IA.`,
      badge: tenantContext(args.tenantName, 'Handoff'),
      title: `Handoff: ${leadName}`,
      body,
      cta: conversationId
        ? { url: panelUrl(`/conversations/${conversationId}`), label: 'Ver conversación' }
        : undefined,
      showCopyUrl: false,
      manageNotificationsUrl: panelUrl('/settings/preferences'),
    }),
  };
}

function renderQualified(args: RenderArgs): RenderedEmail {
  const p = args.payload;
  const conversationId = p.conversation_id as number | undefined;
  const leadName = (p.lead_first_name as string | undefined) ?? 'Lead sin nombre';
  const phone = p.lead_phone as string | undefined;
  const phase = p.conversation_phase as number | undefined;

  const subject = `Lead cualificado · ${leadName}`;
  const body = `${greeting(args.trainerName)}<p style="margin:0 0 14px 0;color:#374151;font-size:15px;line-height:1.65;"><strong style="color:#0f172a;">${esc(leadName)}</strong> acaba de cualificar como lead caliente.</p>
${field('Teléfono', phone)}
${field('Fase alcanzada', phase != null ? `F${phase}` : '')}`;

  return {
    subject,
    html: renderEmailShell({
      audience: 'trainer',
      variant: 'notification',
      preheader: `${leadName} ha cualificado — revisa la conversación.`,
      badge: tenantContext(args.tenantName, 'Lead cualificado'),
      title: `Lead cualificado: ${leadName}`,
      body,
      cta: conversationId
        ? { url: panelUrl(`/conversations/${conversationId}`), label: 'Ver conversación' }
        : undefined,
      showCopyUrl: false,
      manageNotificationsUrl: panelUrl('/settings/preferences'),
    }),
  };
}

function renderAppointmentBooked(args: RenderArgs): RenderedEmail {
  const p = args.payload;
  const conversationId = p.conversation_id as number | null | undefined;
  const leadName = (p.lead_first_name as string | undefined) ?? 'Lead sin nombre';
  const appointmentTime = p.appointment_time as string | undefined;
  const calendarName = p.calendar_name as string | undefined;
  const channelKind = p.channel_kind as string | null | undefined;
  const channelHandle = p.channel_handle as string | null | undefined;
  const leadPhone = p.lead_phone as string | null | undefined;
  const contactEmail = p.contact_email as string | null | undefined;
  const isUnmatched = p.unmatched === true;

  const channelLabel = formatChannelLabel(channelKind ?? undefined, channelHandle ?? undefined);
  const formattedTime = formatAppointmentTime(appointmentTime);
  const channelSuffix = channelKind ? ` · ${labelForKind(channelKind)}` : '';

  const subject = isUnmatched
    ? `Cita agendada (sin matchear) · revisar`
    : `Cita agendada · ${leadName}${channelSuffix}`;

  const intro = isUnmatched
    ? `Alguien ha agendado en tu calendario pero <strong style="color:#0f172a;">no hemos podido matchearlo a ningún lead de tu pipeline</strong>. Revisa los datos:`
    : `<strong style="color:#0f172a;">${esc(leadName)}</strong> ha agendado una llamada contigo.`;

  const body = `${greeting(args.trainerName)}<p style="margin:0 0 14px 0;color:#374151;font-size:15px;line-height:1.65;">${intro}</p>
${field('Cuándo', formattedTime)}
${field('Calendario', calendarName)}
${channelLabel ? field('Canal', channelLabel) : ''}
${isUnmatched && leadPhone ? field('Teléfono GHL', leadPhone) : ''}
${isUnmatched && contactEmail ? field('Email GHL', contactEmail) : ''}`;

  const ctaUrl = conversationId
    ? panelUrl(`/conversations/${conversationId}`)
    : panelUrl('/calendars');
  const ctaLabel = conversationId ? 'Ver conversación' : 'Ver en Calendarios';

  return {
    subject,
    html: renderEmailShell({
      audience: 'trainer',
      variant: 'notification',
      preheader: isUnmatched
        ? `Booking huérfano — revisa quién agendó.`
        : `${leadName} agendó una cita${channelKind ? ` desde ${labelForKind(channelKind)}` : ''}.`,
      badge: tenantContext(args.tenantName, isUnmatched ? 'Booking sin matchear' : 'Cita agendada'),
      title: isUnmatched ? 'Cita agendada (sin matchear)' : `Cita agendada con ${leadName}`,
      body,
      cta: { url: ctaUrl, label: ctaLabel },
      showCopyUrl: false,
      manageNotificationsUrl: panelUrl('/settings/preferences'),
    }),
  };
}

const CHANNEL_LABEL_MAP: Record<string, string> = {
  whatsapp: 'WhatsApp',
  instagram_dm: 'Instagram',
  facebook_messenger: 'Facebook',
};

function labelForKind(kind: string): string {
  return CHANNEL_LABEL_MAP[kind] ?? kind;
}

function formatChannelLabel(kind?: string, handle?: string): string | null {
  if (!kind) return null;
  const k = labelForKind(kind);
  return handle ? `${k} · ${handle}` : k;
}

function formatAppointmentTime(iso?: string): string | undefined {
  if (!iso) return undefined;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return new Intl.DateTimeFormat('es-ES', {
      timeZone: 'Europe/Madrid',
      dateStyle: 'full',
      timeStyle: 'short',
    }).format(d);
  } catch {
    return iso;
  }
}

function renderDescalified(args: RenderArgs): RenderedEmail {
  const p = args.payload;
  const conversationId = p.conversation_id as number | undefined;
  const leadName = (p.lead_first_name as string | undefined) ?? 'Lead sin nombre';
  const cause = p.descalification_cause as string | undefined;

  const subject = `Lead descalificado · ${leadName}`;
  const body = `${greeting(args.trainerName)}<p style="margin:0 0 14px 0;color:#374151;font-size:15px;line-height:1.65;">La IA ha descalificado a <strong style="color:#0f172a;">${esc(leadName)}</strong> con un cierre cálido.</p>
${field('Causa', cause)}`;

  return {
    subject,
    html: renderEmailShell({
      audience: 'trainer',
      variant: 'notification',
      preheader: `${leadName} no califica — cierre cálido.`,
      badge: tenantContext(args.tenantName, 'Lead descalificado'),
      title: `Lead descalificado: ${leadName}`,
      body,
      cta: conversationId
        ? { url: panelUrl(`/conversations/${conversationId}`), label: 'Ver conversación' }
        : undefined,
      showCopyUrl: false,
      manageNotificationsUrl: panelUrl('/settings/preferences'),
    }),
  };
}

function renderPausedByRule(args: RenderArgs): RenderedEmail {
  const p = args.payload;
  const conversationId = p.conversation_id as number | undefined;
  const leadName = (p.lead_first_name as string | undefined) ?? 'Lead sin nombre';
  const reason = (p.reason as string | undefined) ?? 'mensaje manual del trainer';

  const subject = `IA pausada · ${leadName}`;
  const body = `${greeting(args.trainerName)}<p style="margin:0 0 14px 0;color:#374151;font-size:15px;line-height:1.65;">La IA dejó de responder en la conversación con <strong style="color:#0f172a;">${esc(leadName)}</strong>.</p>
${field('Motivo', reason)}
<p style="margin:14px 0 0 0;font-size:13px;color:#6b7280;line-height:1.55;">Para reactivar, abre la conversación en el panel y pulsa <em>"Reactivar IA"</em>.</p>`;

  return {
    subject,
    html: renderEmailShell({
      audience: 'trainer',
      variant: 'notification',
      preheader: `La IA dejó de responder en la conversación con ${leadName}.`,
      badge: tenantContext(args.tenantName, 'IA pausada'),
      title: `IA pausada: ${leadName}`,
      body,
      cta: conversationId
        ? { url: panelUrl(`/conversations/${conversationId}`), label: 'Ver conversación' }
        : undefined,
      showCopyUrl: false,
      manageNotificationsUrl: panelUrl('/settings/preferences'),
    }),
  };
}

// =============================================================================
// Dispatcher
// =============================================================================

export function renderEmailTemplate(
  eventType: NotificationEventType,
  args: RenderArgs,
): RenderedEmail {
  switch (eventType) {
    case 'handoff':
      return renderHandoff(args);
    case 'qualified':
      return renderQualified(args);
    case 'appointment_booked':
      return renderAppointmentBooked(args);
    case 'descalified':
      return renderDescalified(args);
    case 'paused_by_rule':
      return renderPausedByRule(args);
  }
}
