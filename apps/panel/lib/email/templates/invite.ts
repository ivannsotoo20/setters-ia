/**
 * Template HTML del email de invitación (Hito 10 + Hito 11 polish).
 *
 * Usa el shell común `_shell.ts` para mantener branding consistente con el
 * resto de emails de Fyzon Setters (paleta light professional).
 *
 * Disparado por `inviteUserAction` + `resendInviteEmailAction` (vía Resend).
 */

import {
  renderEmailShell,
  escapeHtml,
  type EmailAudience,
} from './_shell';

export interface InviteEmailVars {
  /** Nombre sugerido durante invite (puede ser vacío). */
  fullNameHint: string;
  /** "Fyzon Setters Agency" si es invite admin, nombre del tenant si es trainer. */
  contextLabel: string;
  /** owner | admin | viewer | "Admin Fyzon" */
  roleLabel: string;
  /** URL completa con token, ej. https://panel.fyzon.es/accept-invite?token=xxx */
  acceptUrl: string;
  /** Fecha legible de expiración, ej. "domingo 18 de mayo de 2026". */
  expiresAtLabel: string;
  /**
   * Audience del email — afecta footer + badge.
   *  - 'admin': invitación a agency admin Fyzon → badge "Acceso interno Fyzon".
   *  - 'trainer': invitación a owner/colaborador de un tenant.
   */
  audience: Extract<EmailAudience, 'admin' | 'trainer'>;
}

export function renderInviteEmailSubject(vars: InviteEmailVars): string {
  if (vars.audience === 'admin') {
    return `Activa tu acceso admin a Fyzon Setters`;
  }
  return `Invitación a ${vars.contextLabel} — Fyzon Setters`;
}

export function renderInviteEmailHtml(vars: InviteEmailVars): string {
  const isAdmin = vars.audience === 'admin';
  const greeting = vars.fullNameHint
    ? `Hola ${escapeHtml(vars.fullNameHint)},`
    : 'Hola,';
  const contextSafe = escapeHtml(vars.contextLabel);
  const roleSafe = escapeHtml(vars.roleLabel);
  const expiresSafe = escapeHtml(vars.expiresAtLabel);

  const introLine = isAdmin
    ? `Has sido invitado a unirte al equipo interno de <strong style="color:#0f172a;">Fyzon Setters</strong> como <strong style="color:#10b981;">${roleSafe}</strong>.`
    : `Has sido invitado a unirte a <strong style="color:#0f172a;">${contextSafe}</strong> como <strong style="color:#10b981;">${roleSafe}</strong>.`;

  const body = `<p style="margin:0 0 14px 0;color:#374151;font-size:15px;line-height:1.65;">${greeting}</p>
<p style="margin:0 0 14px 0;color:#374151;font-size:15px;line-height:1.65;">${introLine}</p>
<p style="margin:0;color:#374151;font-size:15px;line-height:1.65;">Para activar tu cuenta, define tu contraseña con el botón de abajo. El enlace es de un solo uso y caduca el <strong style="color:#0f172a;">${expiresSafe}</strong>.</p>`;

  return renderEmailShell({
    audience: vars.audience,
    variant: 'invite',
    preheader: isAdmin
      ? 'Activa tu cuenta admin interna de Fyzon Setters.'
      : `Activa tu cuenta y empieza a trabajar con tu setter IA en ${vars.contextLabel}.`,
    badge: isAdmin ? 'Acceso interno Fyzon' : 'Activación de cuenta',
    title: isAdmin ? 'Te invitan al equipo Fyzon' : 'Te invitan a Fyzon Setters',
    body,
    cta: {
      url: vars.acceptUrl,
      label: isAdmin ? 'Activar mi cuenta admin' : 'Activar mi cuenta',
    },
    disclaimer:
      'Si no esperabas esta invitación, ignora este email. El enlace caducará automáticamente.',
  });
}
