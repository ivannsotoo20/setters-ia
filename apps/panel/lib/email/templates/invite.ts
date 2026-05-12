/**
 * Template HTML del email de invitación.
 *
 * Tres flavors:
 *   - `agency_admin`: invitación a co-admin Fyzon (audience='admin').
 *   - `tenant_member`: colaborador/owner ya existente invitado a tenant
 *     (audience='trainer'). Copy clásico "Has sido invitado a {tenant}".
 *   - `new_tenant_owner`: trainer nuevo cuya sub-cuenta se acaba de crear
 *     desde /admin/tenants/new. Copy más comercial "Tu cuenta está lista".
 *
 * Usa el shell común `_shell.ts` para mantener branding consistente.
 *
 * Si `flavor` no se especifica, se infiere desde `audience` (admin →
 * agency_admin; trainer → tenant_member) para retrocompatibilidad.
 */

import {
  renderEmailShell,
  escapeHtml,
  type EmailAudience,
} from './_shell';

export type InviteFlavor = 'agency_admin' | 'tenant_member' | 'new_tenant_owner';

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
   * Audience del email — afecta footer + branding base del shell.
   *  - 'admin': invitación a agency admin Fyzon → footer interno.
   *  - 'trainer': invitación a owner/colaborador de un tenant.
   */
  audience: Extract<EmailAudience, 'admin' | 'trainer'>;
  /**
   * Sabor del email (subject + body). Opcional — si no se pasa, se infiere desde
   * audience para preservar el comportamiento previo (Hito 10).
   */
  flavor?: InviteFlavor;
}

function resolveFlavor(vars: InviteEmailVars): InviteFlavor {
  if (vars.flavor) return vars.flavor;
  return vars.audience === 'admin' ? 'agency_admin' : 'tenant_member';
}

export function renderInviteEmailSubject(vars: InviteEmailVars): string {
  const flavor = resolveFlavor(vars);
  switch (flavor) {
    case 'agency_admin':
      return 'Activa tu acceso admin a Fyzon Setters';
    case 'new_tenant_owner':
      return 'Activa tu acceso a Fyzon Setters';
    case 'tenant_member':
      return `Invitación a ${vars.contextLabel} — Fyzon Setters`;
  }
}

export function renderInviteEmailHtml(vars: InviteEmailVars): string {
  const flavor = resolveFlavor(vars);
  const greeting = vars.fullNameHint
    ? `Hola ${escapeHtml(vars.fullNameHint)},`
    : 'Hola,';
  const contextSafe = escapeHtml(vars.contextLabel);
  const roleSafe = escapeHtml(vars.roleLabel);
  const expiresSafe = escapeHtml(vars.expiresAtLabel);

  let preheader: string;
  let badge: string;
  let title: string;
  let body: string;
  let ctaLabel: string;

  if (flavor === 'agency_admin') {
    const introLine = `Has sido invitado a unirte al equipo interno de <strong style="color:#0f172a;">Fyzon Setters</strong> como <strong style="color:#10b981;">${roleSafe}</strong>.`;
    preheader = 'Activa tu cuenta admin interna de Fyzon Setters.';
    badge = 'Acceso interno Fyzon';
    title = 'Te invitan al equipo Fyzon';
    ctaLabel = 'Activar mi cuenta admin';
    body = `<p style="margin:0 0 14px 0;color:#374151;font-size:15px;line-height:1.65;">${greeting}</p>
<p style="margin:0 0 14px 0;color:#374151;font-size:15px;line-height:1.65;">${introLine}</p>
<p style="margin:0;color:#374151;font-size:15px;line-height:1.65;">Para activar tu cuenta, define tu contraseña con el botón de abajo. El enlace es de un solo uso y caduca el <strong style="color:#0f172a;">${expiresSafe}</strong>.</p>`;
  } else if (flavor === 'new_tenant_owner') {
    preheader = 'Tu setter IA está casi listo. Solo falta que entres y termines la configuración.';
    badge = 'Acceso a tu cuenta';
    title = 'Tu cuenta de Fyzon Setters está lista';
    ctaLabel = 'Activar mi cuenta';
    body = `<p style="margin:0 0 14px 0;color:#374151;font-size:15px;line-height:1.65;">${greeting}</p>
<p style="margin:0 0 14px 0;color:#374151;font-size:15px;line-height:1.65;">Hemos creado tu sub-cuenta <strong style="color:#0f172a;">${contextSafe}</strong> dentro de Fyzon Setters. A partir de ahora vas a tener tu setter IA dedicado para gestionar los leads que entran por WhatsApp, Instagram y Facebook.</p>
<p style="margin:0 0 14px 0;color:#374151;font-size:15px;line-height:1.65;">Para empezar, define tu contraseña con el botón de abajo. Te llevará a un asistente guiado donde vas a conectar tus canales (GoHighLevel para IG/FB, YCloud para WhatsApp), elegir tu plantilla de bienvenida y revisar tus palabras clave. Tarda unos 10–15 minutos.</p>
<p style="margin:0;color:#374151;font-size:15px;line-height:1.65;">Una vez completado, las conversaciones que entren empezarán a ser respondidas automáticamente por la IA. El enlace caduca el <strong style="color:#0f172a;">${expiresSafe}</strong>.</p>`;
  } else {
    const introLine = `Has sido invitado a unirte a <strong style="color:#0f172a;">${contextSafe}</strong> como <strong style="color:#10b981;">${roleSafe}</strong>.`;
    preheader = `Activa tu cuenta y empieza a trabajar con tu setter IA en ${vars.contextLabel}.`;
    badge = 'Activación de cuenta';
    title = 'Te invitan a Fyzon Setters';
    ctaLabel = 'Activar mi cuenta';
    body = `<p style="margin:0 0 14px 0;color:#374151;font-size:15px;line-height:1.65;">${greeting}</p>
<p style="margin:0 0 14px 0;color:#374151;font-size:15px;line-height:1.65;">${introLine}</p>
<p style="margin:0;color:#374151;font-size:15px;line-height:1.65;">Para activar tu cuenta, define tu contraseña con el botón de abajo. El enlace es de un solo uso y caduca el <strong style="color:#0f172a;">${expiresSafe}</strong>.</p>`;
  }

  return renderEmailShell({
    audience: vars.audience,
    variant: 'invite',
    preheader,
    badge,
    title,
    body,
    cta: {
      url: vars.acceptUrl,
      label: ctaLabel,
    },
    disclaimer:
      flavor === 'new_tenant_owner' && vars.fullNameHint
        ? `Si no esperabas este email o no eres ${escapeHtml(vars.fullNameHint)}, ignóralo y avísanos. El enlace caduca automáticamente.`
        : 'Si no esperabas esta invitación, ignora este email. El enlace caducará automáticamente.',
  });
}
