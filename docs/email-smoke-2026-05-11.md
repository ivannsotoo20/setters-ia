# Smoke E2E emails — Hito 11 (2026-05-11)

Guion para validar que todos los emails de la plataforma llegan branded Fyzon, sin spam, con CTAs funcionales tras el deploy del Hito 11.

## Pre-requisitos

| Cosa | Cómo verificar |
|---|---|
| `RESEND_API_KEY` en Vercel | `vercel env ls` muestra `RESEND_API_KEY` en Production |
| `SUPABASE_SERVICE_ROLE_KEY` en Vercel | `vercel env ls` muestra `SUPABASE_SERVICE_ROLE_KEY` en Production |
| `ADMIN_PUBLIC_URL` + `PANEL_PUBLIC_URL` en Vercel | Apuntan a admin.fyzon.es y panel.fyzon.es |
| Dominio `fyzon.es` verificado en Resend | Dashboard Resend → Domains → fyzon.es: `Verified` |
| SMTP custom Resend en Supabase | Dashboard Supabase → Project Settings → Auth → SMTP Settings: Enable Custom SMTP con `smtp.resend.com:465` |
| Templates Supabase Auth pegados | Iván pega los 5 templates de `docs/supabase-email-templates.md` |

## Emails a validar

### 1. Reset Password (Supabase Auth)

**Path admin**:
1. `https://admin.fyzon.es/forgot-password` → mete `sotobautistaivan@gmail.com`.
2. **Esperado en inbox**:
   - Subject: `Recupera tu contraseña en Fyzon Setters`.
   - From: `Fyzon Setters <alertas@fyzon.es>`.
   - Layout: logo Fyzon centrado, card blanco, botón verde "Cambiar contraseña".
   - URL del botón: `https://admin.fyzon.es/auth/callback?type=recovery&...` (subdomain admin).
   - Llega a bandeja principal (no spam).
3. Click botón → aterriza en `admin.fyzon.es/reset-password` con sesión recovery.
4. Define nuevo password → redirect `admin.fyzon.es/admin/login` (o `/admin/dashboard` si auth-only middleware).

**Path trainer**:
1. (Si tienes un trainer test) `https://panel.fyzon.es/forgot-password`.
2. **Esperado** mismo layout que admin, pero URL del botón apunta a `panel.fyzon.es/auth/callback?type=recovery&...`.

### 2. Invite User Supabase (legacy `inviteMember` Sprint Epsilon)

1. Login admin → `https://admin.fyzon.es/admin/tenants/3` (tu tenant Ivan/Fyzon).
2. Ir a tab "Members" → "Invitar miembro" → email de prueba (alias).
3. **Esperado** email Supabase Auth con template branded:
   - Subject: `Te han invitado a Fyzon Setters`.
   - Layout: logo + badge "Activación de cuenta" + botón "Activar mi cuenta".
   - URL botón apunta a `panel.fyzon.es/auth/callback?next=/dashboard` (post-fix Hito 11).
4. Click → completar contraseña → entra al panel cliente.

### 3. Invite User Resend (Hito 10 `inviteUserAction`)

**Variant admin**:
1. Login admin → `https://admin.fyzon.es/admin/admins` → "Invitar admin".
2. Email de prueba (alias).
3. **Esperado** email Resend con template branded `audience=admin`:
   - Subject: `Activa tu acceso admin a Fyzon Setters`.
   - Badge "Acceso interno Fyzon".
   - URL: `https://admin.fyzon.es/accept-invite?token=...`.

**Variant trainer**:
1. (Aún no hay UI Hito 10 para invitar trainers — solo admins via `/admin/admins`).
2. Cuando se añada, validar mismo flow pero `audience=trainer` con URL `https://panel.fyzon.es/accept-invite?token=...`.

### 4. Reset Password member (admin reseteando trainer)

1. Login admin → `/admin/tenants/3/members` → fila de un trainer → "Resetear contraseña".
2. **Esperado** email Supabase Auth Reset Password (mismo template del paso 1) llega al trainer.

### 5. Notification motor — Handoff (requiere motor desplegado)

1. Inducir un handoff en un tenant de test (ej. Iván envía mensaje al WhatsApp del setter test que dispare handoff causa A).
2. **Esperado** email Resend desde el motor con template branded:
   - Subject: `Handoff a humano · {leadName}`.
   - Layout shell común (logo + badge "Aviso del setter · Handoff · {tenantName}" + botón "Ver conversación").
   - URL botón apunta a `panel.fyzon.es/conversations/{id}`.
   - Footer con link "Gestionar mis notificaciones" → `panel.fyzon.es/settings/preferences`.

### 6. Notification motor — Lead cualificado

Mismo que (5) pero forzando cualificación de un lead test.

### 7. Notification motor — Lead descalificado

Mismo que (5) pero forzando descalificación.

## Checks adicionales

- **Spam check**: en cada email recibido, comprobar que llega a bandeja principal (no Spam ni Promociones). Si va a spam → revisar SPF/Return-Path/DMARC en Cloudflare DNS de fyzon.es.
- **Mobile layout**: abrir 1-2 emails en móvil (Gmail app) → comprobar que el media query @max-width:600px funciona (card padding reducido, título 20px).
- **Subject preview**: cada email muestra el preheader correcto en el preview del inbox (antes de abrir).
- **Botón URL**: en cada email, click derecho sobre el CTA → "Copiar enlace" → verifica que apunta al subdomain correcto.
- **Resend Dashboard**: tras smoke completo, revisar Resend → Emails → últimas filas → todas Delivered, ningún Bounced/Soft bounced/Hard bounced.

## Issues conocidos / aceptados

- **Magic Link template**: branded pero no se dispara hoy (Hito 10 deprecó). Si por alguna razón se activa accidentalmente, el copy ya orienta al usuario al método correcto.
- **Confirm Signup**: idem, signup público desactivado.
- **Change Email**: idem, no hay UI todavía.

## Si algo falla

| Síntoma | Diagnóstico | Fix |
|---|---|---|
| Email no llega ni a spam | Resend rechazó (rate limit o sender no verified) | Resend Dashboard → Emails → buscar timestamp → ver error |
| Email llega a spam | DNS sin SPF/DMARC adecuados | Añadir SPF + DMARC en Cloudflare DNS de fyzon.es |
| Botón apunta a localhost | Env var no propagada al deploy | `vercel env ls` + `vercel --prod` |
| Layout roto en mobile | Media query no se aplica | Verificar en Resend Dashboard preview HTML |
| Variables `{{ .Email }}` literales en el body | Supabase no interpoló | Revisar template en Dashboard — debe ser Go template, no Liquid |

## Resultado final

Cuando los 7 emails llegan branded + en bandeja principal + CTAs funcionales, **Hito 11 cerrado**.

Documentar capturas en este mismo archivo bajo sección `## Screenshots E2E` (opcional pero útil para QA futura).
