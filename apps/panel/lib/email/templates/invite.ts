/**
 * Template HTML para email de invitación (Hito 10).
 *
 * Mantiene branding Fyzon: logo CDN + paleta dark + acento verde.
 * Compatible con clientes mail (inline CSS, table-based, sin web fonts custom).
 */

const FYZON_LOGO_URL =
  'https://assets.cdn.filesafe.space/FOxJtkxqNKJjGSuYMEk0/media/69f056920d66f2a665d2592c.png';

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
}

export function renderInviteEmailSubject(vars: InviteEmailVars): string {
  return `Invitación a ${vars.contextLabel} — Fyzon Setters`;
}

export function renderInviteEmailHtml(vars: InviteEmailVars): string {
  const greeting = vars.fullNameHint
    ? `Hola ${escapeHtml(vars.fullNameHint)},`
    : 'Hola,';
  const acceptUrlSafe = escapeHtml(vars.acceptUrl);
  const contextSafe = escapeHtml(vars.contextLabel);
  const roleSafe = escapeHtml(vars.roleLabel);
  const expiresSafe = escapeHtml(vars.expiresAtLabel);

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Invitación a Fyzon Setters</title>
  </head>
  <body style="margin:0;padding:0;background-color:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e5e5e5;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0a0a0a;">
      <tr>
        <td align="center" style="padding:48px 16px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background-color:#141414;border:1px solid #262626;border-radius:12px;overflow:hidden;">
            <tr>
              <td align="center" style="padding:32px 32px 0 32px;">
                <img src="${FYZON_LOGO_URL}" alt="Fyzon" width="120" style="display:block;border:0;outline:none;text-decoration:none;height:auto;" />
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <h1 style="margin:0 0 16px 0;color:#ffffff;font-size:22px;font-weight:600;line-height:1.3;">
                  Te invitan a Fyzon Setters
                </h1>
                <p style="margin:0 0 16px 0;color:#a3a3a3;font-size:15px;line-height:1.6;">
                  ${greeting}
                </p>
                <p style="margin:0 0 16px 0;color:#a3a3a3;font-size:15px;line-height:1.6;">
                  Has sido invitado a unirte a <strong style="color:#ffffff;">${contextSafe}</strong> como <strong style="color:#10b981;">${roleSafe}</strong>.
                </p>
                <p style="margin:0 0 24px 0;color:#a3a3a3;font-size:15px;line-height:1.6;">
                  Para activar tu cuenta, define tu contraseña con el siguiente botón. El enlace es de un solo uso y caduca el <strong style="color:#ffffff;">${expiresSafe}</strong>.
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 24px auto;">
                  <tr>
                    <td align="center" style="background-color:#10b981;border-radius:8px;">
                      <a href="${acceptUrlSafe}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 32px;color:#0a0a0a;text-decoration:none;font-weight:600;font-size:15px;">
                        Activar mi cuenta
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 8px 0;color:#737373;font-size:13px;line-height:1.5;">
                  Si el botón no funciona, copia esta URL en tu navegador:
                </p>
                <p style="margin:0 0 24px 0;word-break:break-all;">
                  <a href="${acceptUrlSafe}" style="color:#10b981;text-decoration:underline;font-size:13px;">${acceptUrlSafe}</a>
                </p>
                <hr style="border:0;border-top:1px solid #262626;margin:24px 0;" />
                <p style="margin:0;color:#737373;font-size:12px;line-height:1.5;">
                  Si no esperabas esta invitación, ignora este email. La invitación caducará automáticamente.
                </p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:16px 32px 32px 32px;color:#525252;font-size:12px;">
                Fyzon · Setters IA para entrenadores
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
