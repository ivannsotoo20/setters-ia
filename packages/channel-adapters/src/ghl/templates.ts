/**
 * GHL Templates adapter — envía templates WhatsApp aprobados por Meta a través
 * de la API GHL v2.0.
 *
 * Sprint Iota.5 PR-C — IMPLEMENTACIÓN EXPERIMENTAL.
 *
 * **Validación empírica pendiente en smoke F (Bloque F del sprint Iota.5).**
 *
 * La documentación pública de GHL para `POST /conversations/messages` no
 * documenta explícitamente el envío de templates Meta. Las pruebas iniciales
 * sugieren que el endpoint acepta:
 *   - `type: 'WhatsApp'`
 *   - `templateId: <messageTemplateId GHL>`  (NO el `name` Meta sino el ID interno)
 *   - `templateParams: [<valores ordenados>]`
 *
 * Si el smoke valida que NO funciona (HTTP 4xx), bloqueamos GHL+templates en
 * la UI con badge "no disponible" — el trainer deberá usar YCloud para
 * plantillas o enviar la bienvenida manualmente desde GHL panel.
 */

const GHL_API_BASE = 'https://services.leadconnectorhq.com';

export class GhlTemplatesError extends Error {
  readonly status: number;
  readonly snippet: string;

  constructor(message: string, status: number, snippet: string) {
    super(message);
    this.name = 'GhlTemplatesError';
    this.status = status;
    this.snippet = snippet;
  }
}

export interface GhlSendTemplateInput {
  /** PIT v2.0 con scope `conversations/message.write`. */
  apiToken: string;
  /** ContactId GHL del lead (no el wamid; el panel debe upsert el contact primero). */
  contactId: string;
  /** Template ID interno GHL (NO el name Meta). El trainer lo encuentra en GHL → WhatsApp templates. */
  templateId: string;
  /** Parámetros ordenados que rellenan `{{1}}`, `{{2}}`, etc. del cuerpo del template. */
  templateParams: string[];
  /** Override URL base (tests). Default services.leadconnectorhq.com */
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface GhlSendTemplateResult {
  providerMessageId: string;
  conversationId: string;
}

export async function ghlSendTemplate(
  input: GhlSendTemplateInput,
): Promise<GhlSendTemplateResult> {
  if (!input.apiToken) throw new Error('ghlSendTemplate: apiToken requerido');
  if (!input.contactId) throw new Error('ghlSendTemplate: contactId requerido');
  if (!input.templateId) throw new Error('ghlSendTemplate: templateId requerido');

  const baseUrl = input.baseUrl ?? GHL_API_BASE;
  const fetchImpl = input.fetchImpl ?? fetch;

  const body = {
    type: 'WhatsApp',
    contactId: input.contactId,
    templateId: input.templateId,
    templateParams: input.templateParams,
  };

  const res = await fetchImpl(`${baseUrl}/conversations/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.apiToken}`,
      Version: '2021-07-28',
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new GhlTemplatesError(
      `GHL sendTemplate HTTP ${res.status}`,
      res.status,
      text.slice(0, 400),
    );
  }
  let parsed: { messageId?: string; conversationId?: string } = {};
  try {
    parsed = JSON.parse(text) as typeof parsed;
  } catch {
    // Ignorar; usaremos fallback.
  }
  return {
    providerMessageId: parsed.messageId ?? `ghl-tpl-${Date.now()}`,
    conversationId: parsed.conversationId ?? '',
  };
}
