/**
 * Shell HTML compartido para TODOS los emails de Fyzon Setters.
 *
 * Hito 11 — branding light professional consistente entre panel + motor.
 * Inspiración: estética Stripe / Linear / Vercel emails.
 *
 * Paleta:
 *  - Body bg: #f6f9fc
 *  - Card: #ffffff con borde #e5e7eb
 *  - Texto principal: #0f172a (h1), #374151 (body), #6b7280 (disclaimer), #9ca3af (footer)
 *  - Acento: #10b981 (verde Fyzon) — CTA + links
 *
 * Logo CDN canónico (definido en CLAUDE.md del usuario):
 *  https://assets.cdn.filesafe.space/FOxJtkxqNKJjGSuYMEk0/media/69f056920d66f2a665d2592c.png
 *
 * Convenciones del API:
 *  - El caller pasa `body` ya escapado/HTML válido. El shell NO escapa el body.
 *  - Variables provenientes de input externo deben pasarse por `escapeHtml()`.
 *  - `preheader` es texto plano (preview en el inbox), no HTML.
 *  - El subject del email NO va en el shell — lo controla el sender (Resend API o Supabase).
 */

export const FYZON_LOGO_URL =
  'https://assets.cdn.filesafe.space/FOxJtkxqNKJjGSuYMEk0/media/69f056920d66f2a665d2592c.png';

export type EmailAudience = 'admin' | 'trainer' | 'lead';
export type EmailVariant = 'reset' | 'invite' | 'notification' | 'generic';

export interface EmailShellOptions {
  /** Quién recibe — afecta texto del footer. */
  audience: EmailAudience;
  /** Categoría — informativo, no afecta color (sí afecta default badge label). */
  variant: EmailVariant;
  /** Preheader (preview en bandeja de entrada, antes de abrir el email). Texto plano. */
  preheader?: string;
  /** Badge opcional sobre el título (ej. "Acceso interno Fyzon"). */
  badge?: string;
  /** Título principal (h1). Se renderiza como texto, escapa si viene de input externo. */
  title: string;
  /** HTML del cuerpo principal. El caller es responsable de escapar variables. */
  body: string;
  /** Botón CTA opcional. */
  cta?: { url: string; label: string };
  /** Mostrar URL copy-paste debajo del CTA (default true si hay cta). */
  showCopyUrl?: boolean;
  /** Disclaimer al final del card (texto secundario antes del footer). */
  disclaimer?: string;
  /** Override del footer text. Default según `audience`. */
  footerText?: string;
  /** Si está, añade un link "Gestionar notificaciones" en el footer. */
  manageNotificationsUrl?: string;
}

/**
 * Escapa string para inserción segura dentro de un atributo HTML o texto.
 * Cubre los 5 caracteres habituales (& < > " ').
 */
export function escapeHtml(s: unknown): string {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Default footer text según audience. */
function defaultFooterText(audience: EmailAudience): string {
  switch (audience) {
    case 'admin':
      return 'Recibes este email como administrador interno de Fyzon Setters.';
    case 'trainer':
      return 'Recibes este email como cliente de Fyzon Setters.';
    case 'lead':
      return 'Te ha contactado un setter automatizado de Fyzon Setters.';
  }
}

/** Renderiza el HTML completo (doctype + body + table layout) de un email. */
export function renderEmailShell(opts: EmailShellOptions): string {
  const titleSafe = escapeHtml(opts.title);
  const badgeSafe = opts.badge ? escapeHtml(opts.badge) : null;
  const preheaderSafe = opts.preheader ? escapeHtml(opts.preheader) : null;
  const disclaimerSafe = opts.disclaimer ? escapeHtml(opts.disclaimer) : null;
  const footerSafe = escapeHtml(opts.footerText ?? defaultFooterText(opts.audience));
  const showCopyUrl = opts.cta != null && (opts.showCopyUrl ?? true);
  const ctaUrlSafe = opts.cta ? escapeHtml(opts.cta.url) : null;
  const ctaLabelSafe = opts.cta ? escapeHtml(opts.cta.label) : null;
  const manageUrlSafe = opts.manageNotificationsUrl
    ? escapeHtml(opts.manageNotificationsUrl)
    : null;

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <title>${titleSafe}</title>
    <style>
      /* Reset minimal para clientes legacy */
      body, table, td, p, a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
      table, td { mso-table-lspace:0; mso-table-rspace:0; }
      img { -ms-interpolation-mode:bicubic; border:0; outline:none; text-decoration:none; }
      @media (max-width: 600px) {
        .fy-card { padding:24px 20px !important; }
        .fy-title { font-size:20px !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background-color:#f6f9fc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937;">
    ${preheaderSafe ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#f6f9fc;">${preheaderSafe}</div>` : ''}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f6f9fc;">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.04);">
            <tr>
              <td align="center" style="padding:36px 32px 8px 32px;">
                <img src="${FYZON_LOGO_URL}" alt="Fyzon" width="110" style="display:block;height:auto;" />
              </td>
            </tr>
            ${badgeSafe ? `<tr>
              <td align="center" style="padding:0 32px 4px 32px;">
                <span style="display:inline-block;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#10b981;background:#ecfdf5;border:1px solid #a7f3d0;padding:4px 10px;border-radius:999px;font-weight:600;">${badgeSafe}</span>
              </td>
            </tr>` : ''}
            <tr>
              <td class="fy-card" style="padding:24px 40px 8px 40px;">
                <h1 class="fy-title" style="margin:0 0 16px 0;color:#0f172a;font-size:22px;font-weight:600;line-height:1.3;letter-spacing:-0.01em;">${titleSafe}</h1>
                <div style="color:#374151;font-size:15px;line-height:1.65;">
                  ${opts.body}
                </div>
                ${opts.cta ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 24px 0;">
                  <tr>
                    <td align="center" style="background-color:#10b981;border-radius:8px;box-shadow:0 1px 2px rgba(16,185,129,0.25);">
                      <a href="${ctaUrlSafe}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:13px 28px;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;letter-spacing:0.01em;">${ctaLabelSafe}</a>
                    </td>
                  </tr>
                </table>` : ''}
                ${showCopyUrl && opts.cta ? `<p style="margin:0 0 6px 0;color:#6b7280;font-size:13px;line-height:1.5;">Si el botón no funciona, copia esta URL en tu navegador:</p>
                <p style="margin:0 0 24px 0;word-break:break-all;">
                  <a href="${ctaUrlSafe}" style="color:#10b981;text-decoration:underline;font-size:13px;">${ctaUrlSafe}</a>
                </p>` : ''}
                ${disclaimerSafe ? `<hr style="border:0;border-top:1px solid #e5e7eb;margin:0 0 20px 0;" />
                <p style="margin:0 0 8px 0;color:#6b7280;font-size:12px;line-height:1.55;">${disclaimerSafe}</p>` : ''}
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:24px 32px 32px 32px;border-top:1px solid #f1f5f9;">
                <p style="margin:0 0 4px 0;color:#6b7280;font-size:12px;line-height:1.5;font-weight:500;">Fyzon · Setters IA para entrenadores</p>
                <p style="margin:0;color:#9ca3af;font-size:11px;line-height:1.5;">${footerSafe}</p>
                ${manageUrlSafe ? `<p style="margin:8px 0 0 0;font-size:11px;"><a href="${manageUrlSafe}" style="color:#9ca3af;text-decoration:underline;">Gestionar mis notificaciones</a></p>` : ''}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/** Genera versión text/plain del email para clientes que no renderizan HTML. */
export function renderEmailPlainText(opts: {
  title: string;
  bodyText: string;
  cta?: { url: string; label: string };
  disclaimer?: string;
}): string {
  const parts: string[] = [];
  parts.push(opts.title);
  parts.push('='.repeat(Math.min(opts.title.length, 60)));
  parts.push('');
  parts.push(opts.bodyText);
  if (opts.cta) {
    parts.push('');
    parts.push(`${opts.cta.label}: ${opts.cta.url}`);
  }
  if (opts.disclaimer) {
    parts.push('');
    parts.push('---');
    parts.push(opts.disclaimer);
  }
  parts.push('');
  parts.push('Fyzon · Setters IA para entrenadores');
  return parts.join('\n');
}
