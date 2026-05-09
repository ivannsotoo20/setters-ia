import { env } from '../config/env.js';

/**
 * Templates HTML para notificaciones email al trainer (Sprint Gamma 2.4).
 *
 * Estilo: minimalista, mobile-friendly, links inline al panel. Cero deps de
 * templating engine — solo template literals con escape básico.
 *
 * Cada template recibe `{tenantName, payload}` y devuelve `{subject, html}`.
 * El payload es el JSONB de notification_events.payload, con campos esperados
 * según el event_type.
 */

export type NotificationEventType =
  | 'handoff'
  | 'qualified'
  | 'appointment_booked'
  | 'descalified'
  | 'paused_by_rule'
  | 'error_motor';

export interface RenderedEmail {
  subject: string;
  html: string;
}

export interface RenderArgs {
  tenantName: string;
  /** Contenido de notification_events.payload (estructura variable por event_type). */
  payload: Record<string, unknown>;
}

/** Escape HTML básico para evitar XSS en datos del payload. */
function esc(value: unknown): string {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function panelUrl(path: string): string {
  const base = env.PANEL_PUBLIC_URL.replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Wrapper común con header + footer del email. */
function wrap(args: { tenantName: string; title: string; bodyHtml: string }): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(args.title)}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px;">
    <div style="background:#fff;border-radius:12px;padding:28px 24px;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
      <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;">
        Fyzon Setters · ${esc(args.tenantName)}
      </div>
      <h1 style="margin:0 0 16px;font-size:20px;font-weight:600;line-height:1.3;color:#0a0a0a;">
        ${esc(args.title)}
      </h1>
      ${args.bodyHtml}
    </div>
    <div style="text-align:center;margin-top:16px;font-size:12px;color:#999;">
      Este email se envía automáticamente desde el setter IA.
      <br>
      Configura qué eventos recibir en
      <a href="${panelUrl('/settings/preferences')}" style="color:#10b981;text-decoration:none;">/settings/preferences</a>.
    </div>
  </div>
</body>
</html>`;
}

function ctaButton(label: string, href: string): string {
  return `<div style="margin:20px 0;">
    <a href="${esc(href)}" style="display:inline-block;background:#10b981;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:600;">
      ${esc(label)}
    </a>
  </div>`;
}

function field(label: string, value: unknown): string {
  if (value == null || value === '') return '';
  return `<div style="margin:8px 0;">
    <span style="color:#666;font-size:13px;">${esc(label)}:</span>
    <strong style="margin-left:6px;font-size:14px;">${esc(value)}</strong>
  </div>`;
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

  const subject = `🤝 Handoff a humano · ${leadName}`;
  const body = `
    <p style="font-size:15px;line-height:1.5;margin:0 0 12px;">
      La IA ha pasado la conversación con <strong>${esc(leadName)}</strong> a ti.
    </p>
    ${field('Causa del handoff', handoffCause)}
    ${lastMessage ? `<div style="margin:12px 0;padding:12px;background:#f5f5f5;border-radius:8px;font-size:13px;color:#444;font-style:italic;">"${esc(lastMessage)}"</div>` : ''}
    ${conversationId ? ctaButton('Ver conversación', panelUrl(`/conversations/${conversationId}`)) : ''}
  `;
  return { subject, html: wrap({ tenantName: args.tenantName, title: subject, bodyHtml: body }) };
}

function renderQualified(args: RenderArgs): RenderedEmail {
  const p = args.payload;
  const conversationId = p.conversation_id as number | undefined;
  const leadName = (p.lead_first_name as string | undefined) ?? 'Lead sin nombre';
  const phone = p.lead_phone as string | undefined;
  const phase = p.conversation_phase as number | undefined;

  const subject = `✅ Lead cualificado · ${leadName}`;
  const body = `
    <p style="font-size:15px;line-height:1.5;margin:0 0 12px;">
      <strong>${esc(leadName)}</strong> acaba de cualificar.
    </p>
    ${field('Teléfono', phone)}
    ${field('Fase', phase != null ? `F${phase}` : '')}
    ${conversationId ? ctaButton('Ver conversación', panelUrl(`/conversations/${conversationId}`)) : ''}
  `;
  return { subject, html: wrap({ tenantName: args.tenantName, title: subject, bodyHtml: body }) };
}

function renderAppointmentBooked(args: RenderArgs): RenderedEmail {
  const p = args.payload;
  const conversationId = p.conversation_id as number | undefined;
  const leadName = (p.lead_first_name as string | undefined) ?? 'Lead sin nombre';
  const appointmentLink = p.appointment_link as string | undefined;
  const appointmentTime = p.appointment_time as string | undefined;

  const subject = `📅 Cita agendada · ${leadName}`;
  const body = `
    <p style="font-size:15px;line-height:1.5;margin:0 0 12px;">
      <strong>${esc(leadName)}</strong> ha agendado una llamada contigo.
    </p>
    ${field('Cuándo', appointmentTime)}
    ${field('Enlace', appointmentLink)}
    ${conversationId ? ctaButton('Ver conversación', panelUrl(`/conversations/${conversationId}`)) : ''}
  `;
  return { subject, html: wrap({ tenantName: args.tenantName, title: subject, bodyHtml: body }) };
}

function renderDescalified(args: RenderArgs): RenderedEmail {
  const p = args.payload;
  const conversationId = p.conversation_id as number | undefined;
  const leadName = (p.lead_first_name as string | undefined) ?? 'Lead sin nombre';
  const cause = p.descalification_cause as string | undefined;

  const subject = `⛔ Lead descalificado · ${leadName}`;
  const body = `
    <p style="font-size:15px;line-height:1.5;margin:0 0 12px;">
      La IA ha descalificado a <strong>${esc(leadName)}</strong> (cierre cálido).
    </p>
    ${field('Causa', cause)}
    ${conversationId ? ctaButton('Ver conversación', panelUrl(`/conversations/${conversationId}`)) : ''}
  `;
  return { subject, html: wrap({ tenantName: args.tenantName, title: subject, bodyHtml: body }) };
}

function renderPausedByRule(args: RenderArgs): RenderedEmail {
  const p = args.payload;
  const conversationId = p.conversation_id as number | undefined;
  const leadName = (p.lead_first_name as string | undefined) ?? 'Lead sin nombre';
  const reason = (p.reason as string | undefined) ?? 'mensaje manual del trainer';

  const subject = `⏸ IA pausada · ${leadName}`;
  const body = `
    <p style="font-size:15px;line-height:1.5;margin:0 0 12px;">
      La IA dejó de responder en la conversación con <strong>${esc(leadName)}</strong>.
    </p>
    ${field('Motivo', reason)}
    <p style="font-size:13px;color:#666;margin:12px 0;">
      Para reactivar, ve al panel y pulsa "Reactivar IA" en la conversación.
    </p>
    ${conversationId ? ctaButton('Ver conversación', panelUrl(`/conversations/${conversationId}`)) : ''}
  `;
  return { subject, html: wrap({ tenantName: args.tenantName, title: subject, bodyHtml: body }) };
}

function renderErrorMotor(args: RenderArgs): RenderedEmail {
  const p = args.payload;
  const conversationId = p.conversation_id as number | undefined;
  const errorMessage = (p.error_message as string | undefined) ?? '(sin detalles)';
  const attempts = p.attempts as number | undefined;

  const subject = `⚠ Error técnico del motor`;
  const body = `
    <p style="font-size:15px;line-height:1.5;margin:0 0 12px;">
      Hubo un fallo técnico procesando una conversación. Es posible que la IA no
      haya respondido al lead.
    </p>
    ${field('Conversación', conversationId)}
    ${field('Intentos', attempts)}
    <div style="margin:12px 0;padding:12px;background:#fef2f2;border-radius:8px;font-size:12px;color:#991b1b;font-family:monospace;">
      ${esc(errorMessage)}
    </div>
    <p style="font-size:13px;color:#666;margin:12px 0;">
      El equipo técnico de Fyzon revisa estos errores. Si se repite, contacta soporte.
    </p>
  `;
  return { subject, html: wrap({ tenantName: args.tenantName, title: subject, bodyHtml: body }) };
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
    case 'error_motor':
      return renderErrorMotor(args);
  }
}
