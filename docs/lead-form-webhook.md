# Endpoint /automations/lead-form — webhook de bienvenida WA

> Hito 9 sub-fase 3 — Endpoint del motor para disparar bienvenida WhatsApp via YCloud cuando un lead rellena un formulario externo (n8n, GHL, Meta Lead Ads, Tally, Typeform, Zapier...).

---

## Contexto

Cuando un lead deja sus datos (teléfono + nombre) en un formulario VSL, anuncio Meta o landing externa, queremos:

1. Crear el contacto en el SaaS Setters IA.
2. Enviar la plantilla bienvenida WhatsApp (vía YCloud) con su nombre.
3. Activar la IA en F1 outbound para que conteste cuando el lead responda.

El endpoint `POST /automations/lead-form/:tenant_token` hace todo eso en una sola llamada.

---

## Requisitos previos

El trainer debe haber completado los 4 pasos de `/onboarding/integrations`:

- ✅ Step 1: GHL conectado (no es estrictamente necesario para este endpoint, pero sí para otras automations).
- ✅ Step 2: Keywords configuradas (no necesario para este endpoint).
- ✅ Step 3: YCloud conectado + plantillas WhatsApp aprobadas sincronizadas.
- ✅ Step 4: **Plantilla bienvenida designada** (`tenant_configs.welcome_template_id`) + **token del webhook generado** (`tenant_tokens` con `purpose='lead_form_webhook'`).

Sin step 4 completo, el endpoint devuelve `409 no_welcome_template_configured`.

---

## URL del endpoint

```
POST https://<motor-fyzon>/automations/lead-form/<tenant_token>
```

El `<tenant_token>` lo encuentra el trainer en `/onboarding/integrations` step 4 (botón "Generar token de webhook" + copy URL).

---

## Body JSON

```json
{
  "phone": "+34600123456",
  "first_name": "Juan",
  "last_name": "García",
  "email": "juan@example.com",
  "source": "vsl_octubre_pablo",
  "external_id": "form_submission_xyz123"
}
```

| Campo | Requerido | Descripción |
|---|---|---|
| `phone` | ✅ Sí | E.164 (`+34600123456`) o solo dígitos (`34600123456`). El motor normaliza. |
| `first_name` | Recomendado | Nombre del lead. Se usa para personalizar la plantilla si tiene `{{1}}`. |
| `last_name` | Opcional | Apellidos. |
| `email` | Opcional | Email del lead. |
| `source` | Opcional | Origen para tracking (ej. `vsl_pablo_octubre`, `tally_form_x`). Se devuelve en la response y se loggea. |
| `external_id` | Opcional | ID externo del formulario (para dedup futuro). Hoy NO se usa para dedup — el motor dedupea por phone+tenant durante 60s. |

---

## Headers

```
Content-Type: application/json
X-Form-Secret: <webhook_secret>   (opcional según LEAD_FORM_VERIFY_MODE)
```

El `webhook_secret` es el mismo de la cuenta YCloud del tenant (`integration_accounts.webhook_secret`). El trainer puede verlo desde el panel YCloud o pedirlo al admin Fyzon.

Modos:
- `LEAD_FORM_VERIFY_MODE=disabled`: el header se ignora.
- `LEAD_FORM_VERIFY_MODE=warn` (default): si el header llega y no matchea, log warn pero continúa.
- `LEAD_FORM_VERIFY_MODE=enforce`: si el header falta o no matchea → `401`.

Recomendado en producción: `enforce`. En dev/staging: `warn`.

---

## Response

### 200 OK (lead creado + plantilla enviada)

```json
{
  "ok": true,
  "tenant_id": 2,
  "lead_id": 100,
  "conversation_id": 555,
  "provider_message_id": "wamid.HBgL...",
  "lead_created": true,
  "source": "vsl_octubre_pablo"
}
```

### 200 deduped (mismo phone+tenant ya disparado <60s)

```json
{
  "ok": true,
  "deduped": true,
  "tenant_id": 2,
  "phone": "+34600123456"
}
```

No se envía la plantilla de nuevo. Útil para evitar dobles disparos si la automation reintentando.

### 400 invalid_payload

```json
{ "error": "invalid_payload", "issues": { ... } }
```

### 400 invalid_phone

```json
{ "error": "invalid_phone", "message": "phone debe ser E.164 (ej: +34600123456) o solo dígitos (6-15)" }
```

### 401 missing_secret / invalid_secret (solo modo enforce)

```json
{ "error": "missing_secret" }
```

### 404 tenant_token invalid

```json
{ "error": "tenant_token invalid or inactive" }
```

### 409 no_welcome_template_configured

```json
{
  "error": "no_welcome_template_configured",
  "message": "tenant sin welcome_template_id en tenant_configs. Configurar en /settings/followup-templates."
}
```

### 422 send_failed (YCloud upstream falla)

```json
{ "error": "send_failed", "message": "YCloud sendTemplate failed: HTTP 401" }
```

### 422 lead_no_phone / template_not_supported

Errores de validación en runtime.

### 500 internal errors

Si Supabase u otro servicio interno falla.

---

## Ejemplos de configuración

### Ejemplo n8n

1. Workflow trigger: `Webhook` (formulario público) o cualquier nodo upstream que tenga `phone` + `name`.
2. Nodo `HTTP Request`:
   - Method: `POST`
   - URL: `https://motor-fyzon.example.com/automations/lead-form/<tenant_token>`
   - Headers:
     - `Content-Type: application/json`
     - `X-Form-Secret: {{$node.YCloud.webhook_secret}}` (si usas Vault de n8n)
   - Body (JSON):
     ```json
     {
       "phone": "{{$node.Webhook.body.phone}}",
       "first_name": "{{$node.Webhook.body.name}}",
       "source": "n8n_pablo_vsl"
     }
     ```

### Ejemplo Meta Lead Ads (via Zapier o n8n)

1. Trigger Zapier: `New Lead from Facebook Lead Ads`.
2. Zapier Action: `Webhooks by Zapier → POST`.
3. URL + body como en el ejemplo n8n.

### Ejemplo Tally

1. Tally form → settings → Integrations → Webhook.
2. URL: `https://motor-fyzon.example.com/automations/lead-form/<tenant_token>`.
3. Map fields: `phone` → respuesta del campo phone, `first_name` → respuesta nombre.

### Ejemplo cURL (testing manual)

```bash
curl -X POST https://motor-fyzon.example.com/automations/lead-form/<tenant_token> \
  -H "Content-Type: application/json" \
  -H "X-Form-Secret: <webhook_secret>" \
  -d '{
    "phone": "+34600123456",
    "first_name": "Juan",
    "source": "test_manual"
  }'
```

---

## Comportamiento idempotente

- **Dedup Redis 60s**: si el mismo `(tenant_id, phone)` llega 2 veces en menos de 60 segundos, el segundo request devuelve `200 {deduped: true}` sin enviar la plantilla otra vez. Esto cubre reintentos automáticos de Meta Lead Ads.
- **Lead existente**: si el `phone` ya tiene un lead en BD (ej. el trainer lo importó previamente), el motor reutiliza el lead y NO crea uno nuevo. Sí envía la plantilla bienvenida (porque entendemos que el formulario externo es una intención fresca de captación).
- **Si la plantilla falla**: el lead queda creado pero la conversación no se actualiza a F1 ni se activa IA. La response es 502 con detalle. El trainer puede reintentar manualmente desde la ficha del contacto (botón "Enviar bienvenida").

---

## Verificación tras setup

1. En `/settings/integrations/health` deberías ver YCloud en 🟢 (tras el primer envío exitoso).
2. En `/contacts` aparece el lead nuevo con badge F1 + IA activa.
3. En `/conversations` el lead tiene su conversación con 1 mensaje source='ai' (la plantilla bienvenida).
4. En tu sub-cuenta YCloud (panel YCloud) deberías ver la plantilla enviada en el log.

Si algo falla, revisa `/settings/integrations/health` + los logs del motor.
