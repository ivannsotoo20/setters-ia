# Hito 9 — Verificación E2E local

> Checklist de verificación que Iván ejecuta manualmente para confirmar que todo el Hito 9 está operativo antes del smoke real con cliente.

---

## Pre-requisitos

```powershell
# 1. Redis corriendo
docker compose up -d redis

# 2. Env vars rellenadas en .env.local del motor (mínimo):
#    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY,
#    REDIS_URL, CREDENTIALS_ENCRYPTION_KEY, INTERNAL_STATS_TOKEN

# 3. Env vars del panel (.env.local):
#    SUPABASE_URL, NEXT_PUBLIC_SUPABASE_URL/ANON_KEY,
#    SUPABASE_SERVICE_ROLE_KEY,
#    MOTOR_INTERNAL_URL=http://localhost:3001,
#    INTERNAL_STATS_TOKEN=<el mismo valor que en motor>,
#    NEXT_PUBLIC_MOTOR_ORIGIN=http://localhost:3001

# 4. Motor + panel arrancando
pnpm --filter @fyzon/motor-agente dev   # terminal 1, :3001
pnpm --filter @fyzon/panel dev          # terminal 2, :3000
```

---

## Paso 0 — Verificación schema (ya ejecutado por Claude)

```sql
-- ✅ Migrations 033/034 aplicadas:
-- tenant_configs.welcome_template_id BIGINT NULL FK followup_templates(id) ON DELETE SET NULL
-- integration_accounts.last_webhook_at TIMESTAMPTZ NULL + idx (tenant_id, last_webhook_at DESC)
```

---

## Paso 1 — Setup tenant fixture (ejecutar via MCP SQL)

```sql
-- 1.1) Tenant Pablo de prueba (si no existe ya)
SELECT id FROM tenants WHERE slug = 'montefit';
-- → asume tenant_id = 2 (ajustar según tu BD)

-- 1.2) Tenant tokens nuevos (purpose='lead_form_webhook')
INSERT INTO tenant_tokens (tenant_id, purpose, is_active)
VALUES (2, 'lead_form_webhook', TRUE)
ON CONFLICT DO NOTHING
RETURNING token, purpose;
-- → guarda el token devuelto. Ej: '8c1f9a...'

-- 1.3) Verifica que ya existe integration_account ycloud para tenant 2
SELECT id, provider, connection_config, webhook_secret
FROM integration_accounts
WHERE tenant_id = 2 AND provider = 'ycloud' AND is_active = TRUE;
-- → si no existe, créalo desde el panel /settings/integrations

-- 1.4) Verifica plantilla bienvenida WhatsApp
SELECT id, name, channel_kind, provider, status, provider_template_id
FROM followup_templates
WHERE tenant_id = 2 AND channel_kind = 'whatsapp'
  AND status = 'approved'
  AND provider IN ('ycloud','meta_cloud');
-- → si no hay, sincroniza desde panel /settings/followup-templates

-- 1.5) Designa welcome_template_id
UPDATE tenant_configs
SET welcome_template_id = <id_plantilla_paso_1.4>,
    updated_at = now()
WHERE tenant_id = 2
RETURNING tenant_id, welcome_template_id;

-- 1.6) Asegura keywords mínimas
INSERT INTO automation_keywords (tenant_id, type, pattern, is_active)
VALUES
  (2, 'bienvenida', 'Hola, gracias por escribir', TRUE),
  (2, 'lm', 'CLASE', TRUE)
ON CONFLICT DO NOTHING;
```

---

## Escenarios E2E (curl + verificación SQL)

### Escenario A — Lead rellena formulario VSL → bienvenida WA + IA activa

```powershell
$tenantToken = "<el token del paso 1.2>"
$webhookSecret = "<integration_accounts.webhook_secret de la cuenta ycloud>"

curl -X POST "http://localhost:3001/automations/lead-form/$tenantToken" `
  -H "Content-Type: application/json" `
  -H "X-Form-Secret: $webhookSecret" `
  -d '{
    "phone": "+34600999001",
    "first_name": "Test E2E A",
    "source": "verificacion_hito_9"
  }'
```

**Esperado**: `200 {ok:true, lead_id, conversation_id, provider_message_id}`.

**Verificación SQL** (vía MCP):

```sql
-- Lead creado + conv F1 outbound bienvenida + IA activa
SELECT
  l.id AS lead_id,
  l.phone,
  c.id AS conv_id,
  c.direction,
  c.conversation_source,
  c.phase_number,
  c.ai_paused_until
FROM leads l
JOIN conversations c ON c.lead_id = l.id
WHERE l.tenant_id = 2 AND l.phone = '+34600999001'
ORDER BY l.created_at DESC LIMIT 1;
-- → direction='outbound', conversation_source='bienvenida', phase=1, ai_paused_until=NULL

-- Mensaje IA insertado
SELECT id, source, content_type, content, sent_at
FROM conversation_messages
WHERE conversation_id = <conv_id_anterior>
ORDER BY id DESC LIMIT 5;
-- → 1 row source='ai' con el body de la plantilla

-- last_webhook_at de la cuenta ycloud actualizado
SELECT id, provider, last_webhook_at
FROM integration_accounts
WHERE tenant_id = 2 AND provider = 'ycloud' AND is_active = TRUE;
-- → last_webhook_at < 1 minuto
```

---

### Escenario B — Reintento mismo phone <60s → deduped

```powershell
# Repetir el curl A inmediatamente después
curl -X POST "http://localhost:3001/automations/lead-form/$tenantToken" `
  -H "Content-Type: application/json" `
  -H "X-Form-Secret: $webhookSecret" `
  -d '{"phone": "+34600999001", "first_name": "Test E2E A"}'
```

**Esperado**: `200 {ok:true, deduped:true}`. NO debe insertarse nuevo mensaje.

**Verificación SQL**:
```sql
-- Mismo conteo de mensajes que en escenario A
SELECT COUNT(*) FROM conversation_messages WHERE conversation_id = <conv_id>;
```

---

### Escenario C — Phone inválido → 400

```powershell
curl -X POST "http://localhost:3001/automations/lead-form/$tenantToken" `
  -H "Content-Type: application/json" `
  -d '{"phone": "abc-no-es-phone"}'
```

**Esperado**: `400 {error: "invalid_phone"}`.

---

### Escenario D — Tenant sin welcome_template_id → 409

```sql
-- Quitar el welcome_template_id temporalmente
UPDATE tenant_configs SET welcome_template_id = NULL WHERE tenant_id = 2;
```

```powershell
curl -X POST "http://localhost:3001/automations/lead-form/$tenantToken" `
  -H "Content-Type: application/json" `
  -d '{"phone": "+34600999002", "first_name": "Test D"}'
```

**Esperado**: `409 {error: "no_welcome_template_configured"}`.

```sql
-- Restaurar
UPDATE tenant_configs SET welcome_template_id = <id_plantilla> WHERE tenant_id = 2;
```

---

### Escenario E — Ping endpoint para wizard

```powershell
curl "http://localhost:3001/automations/lead-form/$tenantToken/ping"
```

**Esperado**: `200 {ok:true, tenant_id:2, purpose:"lead_form_webhook", verify_mode:"warn"}`.

---

### Escenario F — /internal/welcome desde panel (botón "Enviar bienvenida")

```powershell
$internalToken = $env:INTERNAL_STATS_TOKEN  # de tu .env.local

# Crear lead manual primero (si no usas un lead existente)
# ...

curl -X POST "http://localhost:3001/internal/welcome" `
  -H "Authorization: Bearer $internalToken" `
  -H "Content-Type: application/json" `
  -d '{"tenant_id": 2, "lead_id": <lead_id_existente>}'
```

**Esperado**: `200 {ok:true, provider_message_id, conversation_id}`.

Este escenario también se cubre desde el panel: abre `/contacts/<lead_id>`, click "Enviar bienvenida" → toast verde "Bienvenida enviada".

---

## Verificación visual del panel

1. **`/onboarding/integrations`**: el wizard muestra los 4 pasos. Tras configurar todos, el contador llega a `4/4 completados` y el banner verde aparece.
2. **`/settings/integrations/health`**: tabla con todas las cuentas + `last_webhook_at` reciente en 🟢 (tras los curls anteriores).
3. **`/contacts`**: el lead "Test E2E A" aparece con badge F1 + IA activa.
4. **`/contacts/<lead_id>`**: el botón "Enviar bienvenida" es visible si el lead tiene canal WA.
5. **`/conversations?selected=<conv_id>`**: el primer mensaje del bot aparece con el contenido de la plantilla.

---

## Limpieza (opcional)

```sql
-- Borrar leads de prueba
DELETE FROM leads WHERE tenant_id = 2 AND phone IN ('+34600999001','+34600999002');
-- (cascade borra conversations y messages relacionados)
```

---

## Criterios de cierre del Hito 9

| # | Criterio | Estado |
|---|---|---|
| 1 | Migrations 033/034 aplicadas vía MCP. Tipos regenerados. | ✅ |
| 2 | `pnpm typecheck` 9/9 verde. | ✅ |
| 3 | `pnpm -r test` ~922/922 verde (912 base + ~10 nuevos). | ✅ |
| 4 | Endpoint `/automations/lead-form/:tenant_token` responde 200/400/404/409/422 según casos. | ✅ (tests vitest) |
| 5 | `sendWelcomeTemplate` envía template via YCloud + crea conv F1 + activa IA (verificable con SQL). | ✅ (tests vitest) |
| 6 | Botón "Enviar bienvenida" en ficha contacto funciona end-to-end. | ⏳ verificación manual |
| 7 | Wizard onboarding completable en <15 min con tenant nuevo. | ⏳ verificación manual |
| 8 | Dashboard `/settings/integrations/health` muestra estado real por integration_account. | ⏳ verificación manual |
| 9 | Docs `ghl-trainer-setup.md` y `lead-form-webhook.md` revisados por Iván. | ⏳ revisión |
| 10 | `.env.example` con todas las vars GHL + LEAD_FORM_VERIFY_MODE + MOTOR_INTERNAL_URL. | ✅ |
| 11 | Los 5+1 escenarios E2E pasan localmente con curl + MCP SQL. | ⏳ verificación manual |

**Pendientes externos** (no bloquean cierre Hito 9, sí bloquean producción):
- Smoke E2E real con cliente Pablo (D32 — gate cliente, sesión separada).
- Configurar las 4 automations en sub-cuenta GHL real de Pablo.
- Aprobar plantilla WA "bienvenida-pablo-v1" en Meta Business Manager.
- Pasar `*_VERIFY_MODE` a `enforce` en producción tras smoke.
