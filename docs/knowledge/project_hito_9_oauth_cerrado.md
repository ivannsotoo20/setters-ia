---
name: Hito 9 OAuth Marketplace — ✅ CERRADO 2026-05-12
description: Smoke E2E Camino 2 (OAuth Marketplace App + routing por locationId) validado end-to-end con outbound desde IG móvil nativa.
type: project
originSessionId: cf17bce5-6a43-4fe9-a3c8-3e07e031cd69
---
✅ **CERRADO 2026-05-12 ~06:50 UTC**

**Validación final**:
- App propia "IG Message Detector 3" v2.0 (Iván desarrolló, aloja en Automatia agency GHL temporal) instalada en sub-cuenta Sandbox `FOxJtkxqNKJjGSuYMEk0`.
- Webhook URL apunta a `https://setter.fyzon.es/integrations/webhook/oauth` (productivo).
- Toggles InboundMessage + OutboundMessage activados.
- Iván desde IG móvil nativa (cuenta business Sandbox) envió DM "Hola! Muy buenas" a contacto externo "Celebraciones Santomera" (`h8flV4xV9uNn0CsYHmRQ`).
- Motor recibió webhook OAuth → resolveTenantByOauthLocation → tenant 3 → classifyByKeywords matchea keyword `bienvenida='Hola! Muy buenas'` → crea lead 10010 + conv 10010 outbound source=bienvenida + INSERT msg 105 system.
- Lead respondió 3 veces (msgs 106-108) → debounce → pipeline_run 25 success 7s → schedule 94 sent en 41s → msg 109 source=ai entregado al lead via GHL API.
- Followups auto-cancelados al detectar respuesta del lead (schedules 90, 91).

**Cambio único requerido**: 1 UPDATE SQL via MCP para añadir `auth_type='oauth'` al `integration_accounts.id=4 connection_config`. NADA en VPS, NADA de SSH, NADA de env vars OAuth.

**Confusión aclarada**: las `GHL_OAUTH_CLIENT_ID/SECRET/VERSION_ID/SHARED_SECRET` del motor solo se usan si el motor inicia el OAuth flow (`/integrations/oauth/install`). Como Iván instala la app DIRECTAMENTE desde el Marketplace GHL, esas vars NO son necesarias — GHL maneja tokens internamente y solo envía webhooks al destino configurado.

**Camino 2 productivo confirmado**:
- Onboarding nuevo trainer = 1 click "Install IG Message Detector 3" en su sub-cuenta GHL.
- Inbound + Outbound (incluso desde IG móvil nativa) llegan al motor automáticamente.
- Routing multi-tenant por `locationId` en payload.

**Pendientes residuales no urgentes**:
- Pasar `GHL_WEBHOOK_VERIFY_MODE=warn → enforce` tras 48h observando. Implica pegar la PEM RSA en `.env.local` del VPS (tarea cuando se resuelva el bloqueo SSH al VPS — `project_hito_9_vps_ssh_lockout` describe el problema).
- Migración Ed25519 antes julio 2026 (tarea ya spawned).
- Re-hospedar la app en Developer Portal de Iván (no Automatia) cuando sea adecuado.

**Pendientes operativos pendientes (no relacionados)**:
- Smoke E2E WhatsApp/YCloud + welcome template (pendiente #1 original antes de este desvío).
- Pegar 5 templates Supabase Auth en Dashboard.
- Healthchecks.io cron in-VPS.
- Migrar tenant Pablo de ManyChat a YCloud + GHL.

**Estado tests/build/deploy**: 750 tests verdes, typecheck verde, sin commits aún (hay working tree con cambios Fase 4.1 GDPR + 4.2 audit + refactor multi-tenant routing + docs).
