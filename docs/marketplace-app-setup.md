# GHL Marketplace App — Setup multi-tenant

> Cómo conectar una GHL Marketplace App al motor Setters IA. Una URL única para todos los trainers; el motor identifica al trainer por `locationId` del payload.

## Arquitectura

```
[Sub-cuenta GHL trainer A]  ─┐
[Sub-cuenta GHL trainer B]  ─┤   Todos instalan la misma App Fyzon vía OAuth
[Sub-cuenta GHL trainer C]  ─┤
                             │
                             ▼
              ┌────────────────────────────────────┐
              │  App Fyzon Setters IA (Marketplace) │
              │  Webhook URL fijo:                  │
              │  POST https://setter.fyzon.es/      │
              │       integrations/webhook/oauth    │
              └────────────────────────────────────┘
                             │
                             ▼   Body lleva payload.locationId
                ┌─────────────────────────────┐
                │     Motor Setters IA        │
                │  Resuelve tenant_id por:    │
                │  integration_accounts.      │
                │   connection_config.        │
                │     locationId = X          │
                │     auth_type  = 'oauth'    │
                └─────────────────────────────┘
```

**Implementado por**:
- `apps/motor-agente/src/routes/webhook-ghl.ts:240-383` (route handler).
- `apps/motor-agente/src/services/lead-ingest.ts:resolveTenantByOauthLocation` (resolución del tenant por locationId).

## Endpoint del motor

| Atributo | Valor |
|---|---|
| Método | `POST` |
| URL | `https://setter.fyzon.es/integrations/webhook/oauth` |
| Headers obligatorios | `Content-Type: application/json` |
| Headers de firma (uno de los dos) | `x-wh-signature` (RSA) o `x-ghl-signature` (HMAC `t=<unix>,s=<hex>`) |
| Auth | Firma marketplace (`verifyMarketplaceWebhook`) según `GHL_WEBHOOK_VERIFY_MODE` |

**Body esperado** (schema GHL estándar — ver `packages/channel-adapters/src/ghl/parser.ts`):

```jsonc
{
  "type": "InboundMessage",        // | "OutboundMessage"
  "locationId": "FOxJtkxqNKJjGSuYMEk0",
  "contactId": "abc123",
  "messageId": "msg_456",
  "messageType": "IG",             // SMS|CALL|Email|IG|FB
  "body": "Hola, ¿qué tal?",
  "timestamp": "2026-05-11T14:23:00Z",
  "customData": { /* opcional */ }
}
```

## Respuestas del motor

| Status | Cuándo | Body |
|---|---|---|
| `200 ack:true, ignored:true, reason:"unknown_location"` | `locationId` no corresponde a ninguna sub-cuenta registrada en el motor | No revela info de tenants — GHL deja de reintentar |
| `200 ack:true, deduped:true` | Mismo `messageId` (o `contactId:timestamp`) procesado en últimos 60s | Idempotencia |
| `200 ack:true, type:"InboundMessage", tenant_id, conversationId, leadId, ...` | Webhook procesado correctamente | Datos para debug |
| `200 ack:true, type:"OutboundMessage", tenant_id, classification, conversation_id, paused` | Outbound clasificado | `classification` ∈ `'bienvenida'\|'lm'\|'inbound'\|'manual_human'\|'self_echo'\|'no_conversation_skip'` |
| `400 invalid payload` | Payload no pasa el schema Zod | `issues` con detalles |
| `401 invalid signature` | Firma incorrecta y `GHL_WEBHOOK_VERIFY_MODE=enforce` | reason |

## Setup en GHL Developer Portal

### Como Iván (administrador del SaaS Setters IA)

1. **Crear App** en https://marketplace.gohighlevel.com/ → Developer → "Create App"
   - Tipo: **Private** (5 instalaciones max) o **Public** (sin límite, comisión 0% hasta dic-2026).
   - Nombre: `Fyzon Setters` (o variante).
2. **OAuth config**:
   - Redirect URI: `https://setter.fyzon.es/integrations/oauth/callback` (ya implementado en `oauth-ghl.ts`).
   - Scopes: `contacts.write contacts.readonly conversations.readonly conversations.write conversations/message.readonly conversations/message.write locations.readonly`.
3. **Webhook config**:
   - URL: `https://setter.fyzon.es/integrations/webhook/oauth`.
   - Eventos a suscribir: `InboundMessage`, `OutboundMessage` (los nombres exactos dependen de GHL — puede ser `ConversationMessageCreate` o similar).
4. **Recoger credenciales** del Developer Portal:
   - `GHL_OAUTH_CLIENT_ID`
   - `GHL_OAUTH_CLIENT_SECRET`
   - `GHL_OAUTH_VERSION_ID`
   - (Opcional) `GHL_OAUTH_SHARED_SECRET` para HMAC del webhook
   - `GHL_WEBHOOK_PUBLIC_KEY_PEM` (RSA public key universal de GHL — está en docs).
5. **Añadir a Vercel** (panel) y **`.env` del VPS Contabo** (motor) las vars.
6. **Reiniciar motor** en VPS: `docker compose up -d --build motor`.

### Como trainer (instalar la app)

1. Recibe link del onboarding wizard del panel Fyzon: `https://setter.fyzon.es/integrations/oauth/install?tenant_token=<tu-token>`.
2. Click → redirige a GHL chooselocation → trainer selecciona la sub-cuenta donde instalar.
3. Aprueba scopes → GHL redirige de vuelta al `/integrations/oauth/callback` con `code` + `locationId`.
4. Motor:
   - Intercambia `code` por `access_token` + `refresh_token`.
   - Crea/actualiza row en `integration_accounts` con:
     - `tenant_id = <tenant del trainer>`
     - `provider = 'ghl'`
     - `is_active = true`
     - `credentials_encrypted = { apiToken, refreshToken }` (AES-256-GCM)
     - `connection_config = { auth_type: 'oauth', locationId: <X>, companyId: <Y>, userType: 'Location', scope: '...', expiresAt: <ISO>, installedAt: <ISO> }`
5. A partir de ese momento, **todos los DMs IG (inbound + outbound) de esa sub-cuenta llegan al motor** vía `/integrations/webhook/oauth`.

## Coexistencia con workflow custom legacy

El motor soporta **dos paths para GHL en paralelo** sin conflicto:

| Path | URL | Auth | Identificación tenant | Estado |
|---|---|---|---|---|
| **Workflow custom** | `/integrations/webhook/:tenant_token` | `tenant_token` en path + firma | Token único por tenant en `tenant_tokens.purpose='ghl_webhook'` | Legacy (Hito 9) — sigue para Iván Sandbox |
| **Marketplace App OAuth** | `/integrations/webhook/oauth` | Firma marketplace HMAC/RSA | `payload.locationId` + `connection_config.auth_type='oauth'` | Productivo — para todos los trainers nuevos |

`resolveTenantByOauthLocation` **filtra explícitamente** por `auth_type='oauth'`, así que un trainer en Workflow custom (sin `auth_type` en su connection_config) **no se confunde** con tráfico oauth — son universos separados.

Tests que cubren esa separación: `apps/motor-agente/test/resolve-tenant-oauth-location.test.ts`.

## Verificación tras setup

Cuando un trainer instale por primera vez:

```sql
-- Confirmar que el callback OAuth creó la row correctamente
SELECT
  ia.tenant_id,
  t.slug AS tenant_slug,
  ia.provider,
  ia.is_active,
  ia.connection_config->>'auth_type' AS auth_type,
  ia.connection_config->>'locationId' AS location_id,
  ia.connection_config->>'expiresAt' AS expires_at,
  ia.last_webhook_at
FROM public.integration_accounts ia
JOIN public.tenants t ON t.id = ia.tenant_id
WHERE ia.provider = 'ghl'
  AND ia.connection_config->>'auth_type' = 'oauth'
ORDER BY ia.tenant_id;
```

Después de un primer mensaje real, `last_webhook_at` debe poblarse y la conv aparecer en panel.

## Variables de entorno requeridas

Ver `.env.example` líneas 94-120. Bloque mínimo en `.env.local` (panel) y `.env` (motor VPS):

```bash
GHL_OAUTH_CLIENT_ID=<del developer portal>
GHL_OAUTH_CLIENT_SECRET=<del developer portal>
GHL_OAUTH_VERSION_ID=<del developer portal — header "Version" para GHL API>
GHL_OAUTH_SHARED_SECRET=<para HMAC de webhooks, opcional según config app>
GHL_WEBHOOK_PUBLIC_KEY_PEM=-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----
GHL_OAUTH_REDIRECT_URI=https://setter.fyzon.es/integrations/oauth/callback
GHL_OAUTH_SCOPES="contacts.write contacts.readonly conversations.readonly conversations.write conversations/message.readonly conversations/message.write locations.readonly"
GHL_API_BASE=https://services.leadconnectorhq.com
GHL_MARKETPLACE_BASE=https://marketplace.gohighlevel.com
GHL_WEBHOOK_VERIFY_MODE=warn  # disabled|warn|enforce — pasar a enforce tras 48h en warn observando
```

## Pasar `VERIFY_MODE` a enforce

Tras 48h en `warn` con webhooks reales llegando sin warnings de firma:

```bash
# En .env del VPS
GHL_WEBHOOK_VERIFY_MODE=enforce
# Reiniciar
docker compose up -d motor
```

A partir de ahí, cualquier webhook sin firma válida → `401`.
