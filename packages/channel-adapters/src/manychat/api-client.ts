/**
 * Cliente HTTP para la API pública de ManyChat (subset que usa el motor Fyzon).
 *
 * Endpoint principal: POST {base}/fb/sending/sendContent
 * Auth: header `Authorization: Bearer <api_key>` donde api_key tiene formato `page_id:secret`.
 *
 * El cliente está aislado del adapter por canal (WhatsApp, Instagram, Facebook) — los adapters
 * solo aportan el `channel` para enriquecer logs y deciden el `message_tag` por defecto.
 */

export interface ManyChatSendContentParams {
  apiKey: string;
  /** ID del subscriber tal como ManyChat lo emite (`{{Id de contacto}}` en el flow). */
  subscriberId: string;
  /** Texto a enviar (≤1500 chars idealmente). */
  text: string;
  /**
   * `ACCOUNT_UPDATE` por defecto en IG/FB para cubrir la ventana de 24h de Meta.
   * En WA generalmente no aplica. Override si tu config requiere `MESSAGE_TAG` distinto.
   */
  messageTag?: string;
  /** Override de la URL base. Default `https://api.manychat.com`. */
  baseUrl?: string;
  /** Override de fetch (para tests). */
  fetchImpl?: typeof fetch;
}

export interface ManyChatSendContentResult {
  /** ID que ManyChat asigna al mensaje enviado. */
  providerMessageId: string;
  /** Status devuelto por ManyChat ("success" típicamente). */
  status: string;
  /** Body crudo (debug). */
  raw: unknown;
}

export class ManyChatApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = 'ManyChatApiError';
    this.status = status;
    this.body = body;
  }
}

const DEFAULT_BASE_URL = 'https://api.manychat.com';

export async function manyChatSendContent(
  params: ManyChatSendContentParams,
): Promise<ManyChatSendContentResult> {
  const {
    apiKey,
    subscriberId,
    text,
    messageTag = 'ACCOUNT_UPDATE',
    baseUrl = DEFAULT_BASE_URL,
    fetchImpl = fetch,
  } = params;

  if (!apiKey) throw new Error('manyChatSendContent: apiKey requerida');
  if (!subscriberId) throw new Error('manyChatSendContent: subscriberId requerido');
  if (!text || text.trim().length === 0) throw new Error('manyChatSendContent: text vacío');

  const url = `${baseUrl.replace(/\/$/, '')}/fb/sending/sendContent`;
  const body = {
    subscriber_id: subscriberId,
    data: {
      version: 'v2',
      content: {
        messages: [{ type: 'text', text }],
      },
    },
    message_tag: messageTag,
  };

  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(body),
  });

  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    throw new ManyChatApiError(
      `ManyChat sendContent failed: HTTP ${response.status}`,
      response.status,
      parsed,
    );
  }

  const obj = (parsed ?? {}) as Record<string, unknown>;
  const status = typeof obj.status === 'string' ? obj.status : 'unknown';
  const data = (obj.data ?? {}) as Record<string, unknown>;
  // ManyChat devuelve message_id distinto en cada canal — buscamos varias propiedades comunes.
  const providerMessageId =
    (typeof data.message_id === 'string' && data.message_id) ||
    (typeof data.id === 'string' && data.id) ||
    (typeof obj.message_id === 'string' && obj.message_id) ||
    `manychat-${Date.now()}`;

  return { providerMessageId, status, raw: parsed };
}
