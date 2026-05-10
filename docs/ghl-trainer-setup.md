# Configuración de automations GHL para Fyzon Setters IA

> Hito 9 — Guía operativa para el trainer (o el equipo Fyzon configurando una sub-cuenta cliente)

GHL actúa como **conector de origen** del SaaS Setters IA. El trainer NO usa GHL para gestionar conversaciones, contactos o pipeline (eso vive 100% en el SaaS). GHL solo enruta los leads que entran por Instagram y Facebook hacia el motor Fyzon, que activa la IA en la sub-cuenta correcta.

Este documento describe las **4 automations GHL** que el trainer debe configurar en su sub-cuenta para que Fyzon detecte cada tipo de evento.

---

## Pre-requisitos

1. ✅ El trainer ha completado el paso 1 del onboarding (`/onboarding/integrations` → "Conectar con GHL"). Esto instala la app Fyzon en la sub-cuenta GHL via OAuth Marketplace.
2. ✅ El trainer ha registrado sus palabras clave en `/keywords`. Mínimo:
   - 1 keyword tipo `bienvenida` (la frase con la que el trainer suele saludar a leads nuevos en IG/FB).
   - 1 keyword tipo `lm` (palabra que usa para el lead magnet, ej. "CLASE", "INFO", "GUIA").
3. ✅ El trainer tiene la URL del webhook Fyzon a mano (la muestra el panel: copiar desde `/onboarding/integrations` paso 4 o desde `/settings/integrations`).

URL del webhook GHL: `https://<motor-fyzon>/integrations/webhook/<tenant_token>`

---

## Automation 1 — Lead magnet (lead comenta keyword en post IG/FB)

**Caso de uso**: el trainer publica un post con CTA "Comenta CLASE para recibir mi clase gratis". Cuando un lead comenta, GHL captura el comentario, crea/actualiza el contacto y lo envía al motor Fyzon como `InboundMessage` con `customData.conversation_source = 'lm'`. El motor activa la IA en F1 y empieza la conversación.

### Configuración GHL

1. **Workflows → Create new workflow**.
2. **Trigger**: `Instagram User Comments On Post` (o `Facebook User Comments On Post`).
3. **Filter**: `Comment Body Contains` → tu palabra (ej. `CLASE`).
4. **Action 1** (opcional): `Add Tag` → tag "Lead Magnet IG" para tracking interno GHL.
5. **Action 2**: `Webhook` → URL del webhook Fyzon.
   - **Method**: `POST`
   - **Body** (JSON):
     ```json
     {
       "type": "InboundMessage",
       "locationId": "{{location.id}}",
       "contactId": "{{contact.id}}",
       "messageId": "{{message.id}}",
       "messageType": "IG",
       "body": "{{trigger_message.body}}",
       "timestamp": "{{trigger_message.dateAdded}}",
       "customData": {
         "conversation_source": "lm",
         "first_name": "{{contact.first_name}}",
         "last_name": "{{contact.last_name}}",
         "source_post": "{{trigger_post.id}}"
       }
     }
     ```
6. **Save + Publish**.

Repetir para Facebook con trigger `Facebook User Comments On Post`.

---

## Automation 2 — Bienvenida WhatsApp con plantilla (formularios externos)

**Caso de uso**: el lead rellena un formulario VSL / Meta Lead Ads / Tally con su teléfono. La automation externa (n8n o GHL workflow) envía el lead a Fyzon, que crea el contacto, dispara la plantilla bienvenida WA via YCloud y activa la IA en F1.

**IMPORTANTE**: este flujo NO usa el webhook GHL anterior. Va por un endpoint Fyzon diferente: `POST /automations/lead-form/<tenant_token>`. Ver [`lead-form-webhook.md`](./lead-form-webhook.md) para configuración.

Si tu formulario está en GHL (Form Builder), puedes hacer:

1. **Trigger**: `Form Submitted` → tu formulario.
2. **Action 1**: capturar datos (`{{contact.phone}}`, `{{contact.first_name}}`).
3. **Action 2**: `Webhook` → `POST https://<motor-fyzon>/automations/lead-form/<tenant_token>`.
   - **Body**:
     ```json
     {
       "phone": "{{contact.phone}}",
       "first_name": "{{contact.first_name}}",
       "last_name": "{{contact.last_name}}",
       "email": "{{contact.email}}",
       "source": "ghl_form_vsl"
     }
     ```
   - **Headers** (si has activado verify enforce): `X-Form-Secret: <webhook_secret de la cuenta YCloud>`

---

## Automation 3 — Bienvenida manual del trainer en chat IG/FB

**Caso de uso**: el trainer entra en GHL UI → Conversations → IG/FB y escribe a mano un saludo a un lead nuevo (no responde a un trigger automation). GHL emite un evento `OutboundMessage` que llega al webhook Fyzon. Si el texto **matchea con una keyword tipo 'bienvenida'** del trainer, el motor crea lead+conversación F1 outbound y activa la IA. Si NO matchea, el motor lo registra como mensaje humano y pausa la IA (caso D).

⚠️ **Estricto**: el trainer DEBE empezar sus bienvenidas con un patrón registrado en `/keywords` (tipo bienvenida). Sugerencia: registra 3-5 patrones comunes ("Hola gracias por escribir", "Buenas! Soy", "Hey! Cómo estás", "Hola muchas gracias por", etc.).

### Configuración GHL

Esto NO requiere automation explícita — la app Fyzon (instalada via OAuth) ya recibe los `OutboundMessage` events automáticamente. Solo verifica:

1. **Settings → Integrations → Fyzon Setters** está conectada y activa.
2. **App permissions** incluye `conversations/message.readonly` (se solicita automáticamente en el OAuth install).

---

## Automation 4 — Inbound estándar IG/FB (lead responde DM)

**Caso de uso**: el lead responde a una conversación previamente abierta (responde a un mensaje del trainer o del bot). La app Fyzon recibe el `InboundMessage` automáticamente via OAuth webhook subscription.

NO requiere automation explícita. Solo verifica que la app está conectada (paso 1 del onboarding).

Si quieres clasificar el inbound con un `conversation_source` específico (ej. distinguir leads que vienen de un anuncio vs orgánicos), puedes crear un workflow adicional:

1. **Trigger**: `Inbound Message` (IG o FB).
2. **Filter**: `Conversation Source Contains` → ej. `ad_id_xxx`.
3. **Action**: `Webhook` con `customData.conversation_source = 'inbound_anuncio_X'`.

---

## Verificación end-to-end

Tras configurar las 4 automations:

1. Pide a un amigo que **comente la keyword "CLASE"** en uno de tus posts IG → en <30s deberías ver el lead aparecer en `/contacts` y `/conversations` con `conversation_source = 'lm'`.
2. Desde tu **WhatsApp personal**, simula rellenar el formulario externo con tu teléfono → recibirás la plantilla bienvenida WA → al responder, la IA debería contestar.
3. Entra a **GHL → Conversations** y escribe manualmente "Hola gracias por escribir" a un lead nuevo IG → debería aparecer en `/contacts` con `conversation_source = 'bienvenida'` y la IA activa.
4. Pide al amigo que **responda el bot en IG** → la IA debería continuar la conversación.

Si alguno falla:

- Ve a `/settings/integrations/health` y verifica el `last_webhook_at` de la cuenta GHL → si está en 🔴, revisa la URL del webhook step en GHL workflow.
- Revisa `/keywords` y confirma que las keywords registradas matchean (case-insensitive, sin espacios).
- Si la bienvenida WA no llega, verifica que `welcome_template_id` está designado en el paso 4 del onboarding y que la plantilla está aprobada por Meta.

---

## Notas de seguridad

- El **`tenant_token`** en la URL del webhook es la auth principal. Si filtra, un atacante puede mandar leads falsos a tu sub-cuenta. Trátalo como password.
- Los **eventos GHL están firmados con RSA-SHA256** (`X-WH-Signature`). El motor verifica la firma cuando `GHL_WEBHOOK_VERIFY_MODE=enforce`. Activa enforce en producción.
- Si rotas el `tenant_token` (por seguridad), tienes que actualizarlo en TODAS las automations GHL del trainer. El dashboard `/settings/integrations/health` te avisará si una integración deja de recibir webhooks.
