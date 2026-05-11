# Supabase Auth — Email Templates branded Fyzon (Hito 11)

Pega los siguientes HTMLs en **Supabase Dashboard → proyecto `ppujrqxiizgfqclbuxet` → Authentication → Email Templates**, tab por tab. Para cada uno:

1. Sustituye **Subject heading** por el indicado.
2. Borra el HTML existente en **Message body**.
3. Pega el HTML de abajo.
4. **Save**.

Las variables `{{ .Email }}`, `{{ .ConfirmationURL }}`, `{{ .SiteURL }}`, `{{ .Token }}` las interpola Supabase en runtime — NO las toques.

Branding light professional. Mismo logo Fyzon CDN canónico que el resto de la app. Paleta `#f6f9fc` body + `#ffffff` card + `#10b981` acento + `#0f172a/#374151` textos.

---

## 1. Reset Password

**Subject heading**:
```
Recupera tu contraseña en Fyzon Setters
```

**Message body**:

```html
<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <title>Recupera tu contraseña — Fyzon Setters</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f6f9fc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937;">
    <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#f6f9fc;">Cambia tu contraseña en un solo paso. El enlace caduca pronto.</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f6f9fc;">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.04);">
            <tr>
              <td align="center" style="padding:36px 32px 8px 32px;">
                <img src="https://assets.cdn.filesafe.space/FOxJtkxqNKJjGSuYMEk0/media/69f056920d66f2a665d2592c.png" alt="Fyzon" width="110" style="display:block;border:0;outline:none;text-decoration:none;height:auto;" />
              </td>
            </tr>
            <tr>
              <td style="padding:24px 40px 8px 40px;">
                <h1 style="margin:0 0 16px 0;color:#0f172a;font-size:22px;font-weight:600;line-height:1.3;letter-spacing:-0.01em;">Recupera tu contraseña</h1>
                <p style="margin:0 0 14px 0;color:#374151;font-size:15px;line-height:1.65;">Hola,</p>
                <p style="margin:0 0 14px 0;color:#374151;font-size:15px;line-height:1.65;">Hemos recibido una solicitud para restablecer la contraseña de la cuenta <strong style="color:#0f172a;">{{ .Email }}</strong> en Fyzon Setters.</p>
                <p style="margin:0 0 24px 0;color:#374151;font-size:15px;line-height:1.65;">Pulsa el botón para definir una nueva. Por seguridad el enlace es de un solo uso y caduca pronto.</p>
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;">
                  <tr>
                    <td align="center" style="background-color:#10b981;border-radius:8px;box-shadow:0 1px 2px rgba(16,185,129,0.25);">
                      <a href="{{ .ConfirmationURL }}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:13px 28px;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;letter-spacing:0.01em;">Cambiar contraseña</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 6px 0;color:#6b7280;font-size:13px;line-height:1.5;">Si el botón no funciona, copia esta URL en tu navegador:</p>
                <p style="margin:0 0 24px 0;word-break:break-all;">
                  <a href="{{ .ConfirmationURL }}" style="color:#10b981;text-decoration:underline;font-size:13px;">{{ .ConfirmationURL }}</a>
                </p>
                <hr style="border:0;border-top:1px solid #e5e7eb;margin:0 0 16px 0;" />
                <p style="margin:0;color:#6b7280;font-size:12px;line-height:1.55;">¿No has solicitado este cambio? Ignora este email — tu contraseña sigue siendo la misma. Si te preocupa la seguridad de tu cuenta, contacta con soporte.</p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:24px 32px 32px 32px;border-top:1px solid #f1f5f9;">
                <p style="margin:0 0 4px 0;color:#6b7280;font-size:12px;line-height:1.5;font-weight:500;">Fyzon · Setters IA para entrenadores</p>
                <p style="margin:0;color:#9ca3af;font-size:11px;line-height:1.5;">Recibes este email porque hay una cuenta Fyzon Setters asociada a {{ .Email }}.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
```

---

## 2. Invite User

Disparado por `inviteMember()` (Sprint Epsilon legacy) cuando un owner invita un colaborador a su tenant vía `auth.admin.inviteUserByEmail()`.

**Subject heading**:
```
Te han invitado a Fyzon Setters
```

**Message body**:

```html
<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <title>Te han invitado a Fyzon Setters</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f6f9fc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937;">
    <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#f6f9fc;">Activa tu cuenta y empieza a trabajar con tu setter IA.</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f6f9fc;">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.04);">
            <tr>
              <td align="center" style="padding:36px 32px 8px 32px;">
                <img src="https://assets.cdn.filesafe.space/FOxJtkxqNKJjGSuYMEk0/media/69f056920d66f2a665d2592c.png" alt="Fyzon" width="110" style="display:block;border:0;outline:none;text-decoration:none;height:auto;" />
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:0 32px 4px 32px;">
                <span style="display:inline-block;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#10b981;background:#ecfdf5;border:1px solid #a7f3d0;padding:4px 10px;border-radius:999px;font-weight:600;">Activación de cuenta</span>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 40px 8px 40px;">
                <h1 style="margin:0 0 16px 0;color:#0f172a;font-size:22px;font-weight:600;line-height:1.3;letter-spacing:-0.01em;">Te invitan a Fyzon Setters</h1>
                <p style="margin:0 0 14px 0;color:#374151;font-size:15px;line-height:1.65;">Hola,</p>
                <p style="margin:0 0 14px 0;color:#374151;font-size:15px;line-height:1.65;">Has sido invitado a unirte al panel de Fyzon Setters con el email <strong style="color:#0f172a;">{{ .Email }}</strong>.</p>
                <p style="margin:0 0 24px 0;color:#374151;font-size:15px;line-height:1.65;">Pulsa el botón para crear tu contraseña y activar tu cuenta. El enlace es de un solo uso.</p>
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;">
                  <tr>
                    <td align="center" style="background-color:#10b981;border-radius:8px;box-shadow:0 1px 2px rgba(16,185,129,0.25);">
                      <a href="{{ .ConfirmationURL }}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:13px 28px;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;letter-spacing:0.01em;">Activar mi cuenta</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 6px 0;color:#6b7280;font-size:13px;line-height:1.5;">Si el botón no funciona, copia esta URL en tu navegador:</p>
                <p style="margin:0 0 24px 0;word-break:break-all;">
                  <a href="{{ .ConfirmationURL }}" style="color:#10b981;text-decoration:underline;font-size:13px;">{{ .ConfirmationURL }}</a>
                </p>
                <hr style="border:0;border-top:1px solid #e5e7eb;margin:0 0 16px 0;" />
                <p style="margin:0;color:#6b7280;font-size:12px;line-height:1.55;">Si no esperabas esta invitación, ignórala — no se creará ninguna cuenta hasta que pulses el botón de activación.</p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:24px 32px 32px 32px;border-top:1px solid #f1f5f9;">
                <p style="margin:0 0 4px 0;color:#6b7280;font-size:12px;line-height:1.5;font-weight:500;">Fyzon · Setters IA para entrenadores</p>
                <p style="margin:0;color:#9ca3af;font-size:11px;line-height:1.5;">Esta invitación caduca automáticamente si no la usas.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
```

---

## 3. Magic Link

Hoy NO se dispara (Hito 10 deprecó magic link en favor de email + password). Mantenemos branded coherente por si en el futuro se reactiva, pero con copy que orienta al usuario al flow correcto si accidentalmente lo recibe.

**Subject heading**:
```
Tu enlace de acceso a Fyzon Setters
```

**Message body**:

```html
<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <title>Acceso a Fyzon Setters</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f6f9fc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f6f9fc;">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.04);">
            <tr>
              <td align="center" style="padding:36px 32px 8px 32px;">
                <img src="https://assets.cdn.filesafe.space/FOxJtkxqNKJjGSuYMEk0/media/69f056920d66f2a665d2592c.png" alt="Fyzon" width="110" style="display:block;border:0;outline:none;text-decoration:none;height:auto;" />
              </td>
            </tr>
            <tr>
              <td style="padding:24px 40px 8px 40px;">
                <h1 style="margin:0 0 16px 0;color:#0f172a;font-size:22px;font-weight:600;line-height:1.3;letter-spacing:-0.01em;">Tu enlace de acceso</h1>
                <p style="margin:0 0 14px 0;color:#374151;font-size:15px;line-height:1.65;">Hemos recibido una solicitud de acceso para <strong style="color:#0f172a;">{{ .Email }}</strong>. Pulsa el botón para iniciar sesión sin contraseña.</p>
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;">
                  <tr>
                    <td align="center" style="background-color:#10b981;border-radius:8px;box-shadow:0 1px 2px rgba(16,185,129,0.25);">
                      <a href="{{ .ConfirmationURL }}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:13px 28px;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;letter-spacing:0.01em;">Acceder a Fyzon Setters</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 6px 0;color:#6b7280;font-size:13px;line-height:1.5;">Si el botón no funciona, copia esta URL en tu navegador:</p>
                <p style="margin:0 0 24px 0;word-break:break-all;">
                  <a href="{{ .ConfirmationURL }}" style="color:#10b981;text-decoration:underline;font-size:13px;">{{ .ConfirmationURL }}</a>
                </p>
                <hr style="border:0;border-top:1px solid #e5e7eb;margin:0 0 16px 0;" />
                <p style="margin:0;color:#6b7280;font-size:12px;line-height:1.55;">Si no has solicitado este acceso, ignora este email. Tu cuenta sigue protegida con tu contraseña habitual — entra en {{ .SiteURL }} cuando quieras.</p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:24px 32px 32px 32px;border-top:1px solid #f1f5f9;">
                <p style="margin:0 0 4px 0;color:#6b7280;font-size:12px;line-height:1.5;font-weight:500;">Fyzon · Setters IA para entrenadores</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
```

---

## 4. Confirm Signup

Hoy NO se dispara (signup público desactivado en Hito 10). El registro es solo por invitación. Mantenemos branded para evitar inconsistencia si accidentalmente se activa.

**Subject heading**:
```
Confirma tu cuenta en Fyzon Setters
```

**Message body**:

```html
<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <title>Confirma tu cuenta en Fyzon Setters</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f6f9fc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f6f9fc;">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.04);">
            <tr>
              <td align="center" style="padding:36px 32px 8px 32px;">
                <img src="https://assets.cdn.filesafe.space/FOxJtkxqNKJjGSuYMEk0/media/69f056920d66f2a665d2592c.png" alt="Fyzon" width="110" style="display:block;border:0;outline:none;text-decoration:none;height:auto;" />
              </td>
            </tr>
            <tr>
              <td style="padding:24px 40px 8px 40px;">
                <h1 style="margin:0 0 16px 0;color:#0f172a;font-size:22px;font-weight:600;line-height:1.3;letter-spacing:-0.01em;">Confirma tu cuenta</h1>
                <p style="margin:0 0 14px 0;color:#374151;font-size:15px;line-height:1.65;">Hola,</p>
                <p style="margin:0 0 14px 0;color:#374151;font-size:15px;line-height:1.65;">Confirma que <strong style="color:#0f172a;">{{ .Email }}</strong> es tu dirección de email para activar tu cuenta en Fyzon Setters.</p>
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;">
                  <tr>
                    <td align="center" style="background-color:#10b981;border-radius:8px;box-shadow:0 1px 2px rgba(16,185,129,0.25);">
                      <a href="{{ .ConfirmationURL }}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:13px 28px;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;letter-spacing:0.01em;">Confirmar email</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 6px 0;color:#6b7280;font-size:13px;line-height:1.5;">Si el botón no funciona, copia esta URL en tu navegador:</p>
                <p style="margin:0 0 24px 0;word-break:break-all;">
                  <a href="{{ .ConfirmationURL }}" style="color:#10b981;text-decoration:underline;font-size:13px;">{{ .ConfirmationURL }}</a>
                </p>
                <hr style="border:0;border-top:1px solid #e5e7eb;margin:0 0 16px 0;" />
                <p style="margin:0;color:#6b7280;font-size:12px;line-height:1.55;">Si no has solicitado esto, ignora el email. El registro en Fyzon Setters es siempre por invitación: si crees que esto es un error, contacta con soporte.</p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:24px 32px 32px 32px;border-top:1px solid #f1f5f9;">
                <p style="margin:0 0 4px 0;color:#6b7280;font-size:12px;line-height:1.5;font-weight:500;">Fyzon · Setters IA para entrenadores</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
```

---

## 5. Change Email Address

Hoy NO se dispara desde el panel (no hay UI de cambio de email todavía). Branded preparado por si en el futuro se añade.

**Subject heading**:
```
Confirma tu nuevo email en Fyzon Setters
```

**Message body**:

```html
<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <title>Confirma tu nuevo email — Fyzon Setters</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f6f9fc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f6f9fc;">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.04);">
            <tr>
              <td align="center" style="padding:36px 32px 8px 32px;">
                <img src="https://assets.cdn.filesafe.space/FOxJtkxqNKJjGSuYMEk0/media/69f056920d66f2a665d2592c.png" alt="Fyzon" width="110" style="display:block;border:0;outline:none;text-decoration:none;height:auto;" />
              </td>
            </tr>
            <tr>
              <td style="padding:24px 40px 8px 40px;">
                <h1 style="margin:0 0 16px 0;color:#0f172a;font-size:22px;font-weight:600;line-height:1.3;letter-spacing:-0.01em;">Confirma tu nuevo email</h1>
                <p style="margin:0 0 14px 0;color:#374151;font-size:15px;line-height:1.65;">Has solicitado cambiar el email de tu cuenta Fyzon Setters a <strong style="color:#0f172a;">{{ .Email }}</strong>.</p>
                <p style="margin:0 0 24px 0;color:#374151;font-size:15px;line-height:1.65;">Pulsa el botón para confirmar este cambio. El antiguo email dejará de estar asociado a tu cuenta.</p>
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;">
                  <tr>
                    <td align="center" style="background-color:#10b981;border-radius:8px;box-shadow:0 1px 2px rgba(16,185,129,0.25);">
                      <a href="{{ .ConfirmationURL }}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:13px 28px;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;letter-spacing:0.01em;">Confirmar nuevo email</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 6px 0;color:#6b7280;font-size:13px;line-height:1.5;">Si el botón no funciona, copia esta URL en tu navegador:</p>
                <p style="margin:0 0 24px 0;word-break:break-all;">
                  <a href="{{ .ConfirmationURL }}" style="color:#10b981;text-decoration:underline;font-size:13px;">{{ .ConfirmationURL }}</a>
                </p>
                <hr style="border:0;border-top:1px solid #e5e7eb;margin:0 0 16px 0;" />
                <p style="margin:0;color:#6b7280;font-size:12px;line-height:1.55;">Si no has solicitado este cambio, ignora el email. Te recomendamos también cambiar tu contraseña por precaución.</p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:24px 32px 32px 32px;border-top:1px solid #f1f5f9;">
                <p style="margin:0 0 4px 0;color:#6b7280;font-size:12px;line-height:1.5;font-weight:500;">Fyzon · Setters IA para entrenadores</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
```

---

## Smoke test rápido

Tras pegar cada template + Save:
1. Botón **"Send test email"** del Dashboard (arriba a la derecha de cada template) → mete tu email → recibe el preview.
2. Comprueba que llega a bandeja principal (no spam), logo correcto, botón verde y link válido.

Si algo se ve mal, **"Reset to default"** vuelve al template antiguo de Supabase sin downtime.
