/**
 * Parser de webhooks GHL — soporta DOS formatos distintos:
 *
 * 1. **Workflow Webhook action** (lo que GHL envía cuando configuras un step
 *    "Webhook" dentro de un Workflow custom). Este es el formato real que GHL
 *    envía al motor cuando el trainer configura sus automations en panel.
 *    Body típico:
 *      { contact_id, location: { id }, message: { type: <int>, body },
 *        first_name, last_name, customData, ... }
 *    Direction se infiere del trigger del Workflow:
 *      - 'Customer Replied' → inbound
 *      - 'Outbound Message' → outbound
 *
 * 2. **Marketplace App webhook** (formato API público para apps registradas en
 *    Marketplace, con firma RSA `x-wh-signature`). Body:
 *      { type: 'InboundMessage'|'OutboundMessage', locationId, contactId,
 *        body, messageType: 'IG'|'FB Messenger'|..., direction, ... }
 *
 * El parser detecta cuál es y lo normaliza al mismo `GhlWebhookPayload` interno.
 */

import { z } from 'zod';
import type {
  GhlParsedInbound,
  GhlParsedOutbound,
  GhlWebhookMessageType,
  GhlWebhookPayload,
  GhlWebhookType,
} from './types.js';

/** Caracter ZERO WIDTH SPACE que el motor IA apendea a cada salida. */
export const ZWSP = '​';

export class GhlParseError extends Error {
  readonly issues?: unknown;
  constructor(message: string, issues?: unknown) {
    super(message);
    this.name = 'GhlParseError';
    this.issues = issues;
  }
}

// ---------------------------------------------------------------------------
// Schema 1 — Marketplace App webhook (con firma RSA)
// ---------------------------------------------------------------------------

const marketplaceSchema = z.object({
  type: z.enum(['InboundMessage', 'OutboundMessage']),
  locationId: z.string().min(1),
  contactId: z.string().min(1),
  conversationId: z.string().optional(),
  body: z.string(),
  messageType: z.enum(['IG', 'FB Messenger', 'WhatsApp', 'SMS', 'Email', 'Custom']),
  direction: z.enum(['inbound', 'outbound']),
  messageId: z.string().optional(),
  timestamp: z.string().optional(),
  attachments: z.array(z.string()).optional(),
});

// ---------------------------------------------------------------------------
// Schema 2 — Workflow Webhook action (formato interno GHL Workflows)
// ---------------------------------------------------------------------------

const workflowMessageSchema = z.object({
  type: z.union([z.number(), z.string()]).optional(),
  body: z.string().optional(),
});

const workflowLocationSchema = z.object({
  id: z.string().min(1),
});

const workflowContactInnerSchema = z
  .object({
    attributionSource: z
      .object({ medium: z.string().optional() })
      .partial()
      .optional(),
    lastAttributionSource: z
      .object({ medium: z.string().optional() })
      .partial()
      .optional(),
  })
  .partial();

const workflowSchema = z.object({
  contact_id: z.string().min(1),
  location: workflowLocationSchema,
  message: workflowMessageSchema.optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  full_name: z.string().optional(),
  contact: workflowContactInnerSchema.optional(),
  customData: z.record(z.unknown()).optional(),
  /** Iván puede pasar 'direction' como customData {direction: 'outbound'} para
   *  diferenciar inbound vs outbound desde el Workflow. */
  direction: z.enum(['inbound', 'outbound']).optional(),
  /** Y opcionalmente conversation_source para clasificar (bienvenida/lm/inbound). */
  conversation_source: z.string().optional(),
  /** Replica del flow legacy n8n: el Workflow webhook step puede pasar
   *  `lead`, `message`, `conversation_source` como customData keys top-level
   *  cuando el trainer arma una automation que ya clasifica el mensaje (ej.
   *  workflow "Si keyword=clase → bienvenida, llama webhook con conv_source").
   *  Si vienen, sustituyen a contact_id / message.body / lo que corresponda. */
  lead: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Mapping GHL message.type integer → messageType string
// (verified from GHL Marketplace docs + flow legacy n8n pinData)
// ---------------------------------------------------------------------------

const MESSAGE_TYPE_INT_TO_STRING: Record<number, GhlWebhookMessageType> = {
  1: 'SMS',
  2: 'Email',
  5: 'FB Messenger',
  7: 'WhatsApp',
  18: 'IG',
};

function resolveMessageType(
  raw: number | string | undefined,
  attributionMedium: string | undefined,
): GhlWebhookMessageType {
  if (typeof raw === 'string') {
    // Si ya viene como string, validar contra enum
    if (
      raw === 'IG' ||
      raw === 'FB Messenger' ||
      raw === 'WhatsApp' ||
      raw === 'SMS' ||
      raw === 'Email' ||
      raw === 'Custom'
    ) {
      return raw;
    }
  }
  if (typeof raw === 'number' && MESSAGE_TYPE_INT_TO_STRING[raw]) {
    return MESSAGE_TYPE_INT_TO_STRING[raw]!;
  }
  // Fallback: usar attribution medium del contacto (instagram/facebook/whatsapp)
  if (attributionMedium) {
    const m = attributionMedium.toLowerCase();
    if (m === 'instagram') return 'IG';
    if (m === 'facebook') return 'FB Messenger';
    if (m === 'whatsapp') return 'WhatsApp';
    if (m === 'sms') return 'SMS';
    if (m === 'email') return 'Email';
  }
  // Último recurso: IG (default razonable porque es el primary channel del setup)
  return 'IG';
}

// ---------------------------------------------------------------------------
// Top-level parser: detecta formato y normaliza
// ---------------------------------------------------------------------------

export function parseGhlWebhookPayload(payload: unknown): GhlWebhookPayload {
  if (!payload || typeof payload !== 'object') {
    throw new GhlParseError('GHL webhook payload no es un objeto JSON');
  }
  const obj = payload as Record<string, unknown>;

  // Detectar formato Marketplace por presencia de `type: InboundMessage|OutboundMessage`
  if (obj.type === 'InboundMessage' || obj.type === 'OutboundMessage') {
    const result = marketplaceSchema.safeParse(payload);
    if (!result.success) {
      throw new GhlParseError(
        `GHL Marketplace webhook payload inválido: ${result.error.issues
          .map((i) => i.path.join('.') + ' ' + i.message)
          .join('; ')}`,
        result.error.issues,
      );
    }
    return result.data as GhlWebhookPayload;
  }

  // Detectar formato Workflow por presencia de `contact_id` (snake_case) +
  // `location.id` o `location_id`.
  if ('contact_id' in obj && (obj.location || obj.location_id)) {
    const result = workflowSchema.safeParse(payload);
    if (!result.success) {
      throw new GhlParseError(
        `GHL Workflow webhook payload inválido: ${result.error.issues
          .map((i) => i.path.join('.') + ' ' + i.message)
          .join('; ')}`,
        result.error.issues,
      );
    }
    return normalizeWorkflowToInternal(result.data);
  }

  // Ningún formato reconocido
  throw new GhlParseError(
    'GHL webhook payload no coincide con ningún formato conocido (Marketplace o Workflow)',
    { receivedKeys: Object.keys(obj) },
  );
}

function normalizeWorkflowToInternal(
  data: z.infer<typeof workflowSchema>,
): GhlWebhookPayload {
  const attributionMedium =
    data.contact?.attributionSource?.medium ??
    data.contact?.lastAttributionSource?.medium;
  const cd = (data.customData ?? {}) as Record<string, unknown>;

  // Direction puede venir top-level o en customData
  const directionRaw =
    data.direction ??
    (typeof cd.direction === 'string' ? (cd.direction as string) : undefined);
  const direction: 'inbound' | 'outbound' =
    directionRaw === 'outbound' ? 'outbound' : 'inbound';
  const type: GhlWebhookType = direction === 'outbound' ? 'OutboundMessage' : 'InboundMessage';

  // contactId puede venir como customData.lead (flow legacy) o lead top-level
  const contactId =
    (typeof cd.lead === 'string' && cd.lead.length > 0 && (cd.lead as string)) ||
    (typeof data.lead === 'string' && data.lead.length > 0 && data.lead) ||
    data.contact_id;

  // Body: customData.message > top-level message.body > ''
  const body =
    (typeof cd.message === 'string' && (cd.message as string)) ||
    data.message?.body ||
    '';

  // conversation_source: customData first, top-level second
  const conversationSource = pickConversationSource(
    typeof cd.conversation_source === 'string' ? (cd.conversation_source as string) : undefined,
    data.conversation_source,
  );

  // messageType: customData puede pasarlo como string ('IG' / 'FB Messenger' / etc)
  const cdMessageType =
    typeof cd.messageType === 'string' ? (cd.messageType as string) : undefined;
  const messageType = resolveMessageType(
    cdMessageType ?? data.message?.type,
    attributionMedium,
  );

  return {
    type,
    locationId: data.location.id,
    contactId,
    body,
    messageType,
    direction,
    ...(conversationSource ? { conversationSource } : {}),
    // Workflow webhook no expone conversationId / messageId / timestamp en body estándar
  };
}

function pickConversationSource(
  ...candidates: Array<string | undefined>
): GhlWebhookPayload['conversationSource'] | undefined {
  for (const c of candidates) {
    if (typeof c !== 'string') continue;
    const v = c.trim().toLowerCase();
    if (v === 'bienvenida' || v === 'lm' || v === 'inbound' || v === 'manual') {
      return v;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Parsers específicos (mantener API anterior)
// ---------------------------------------------------------------------------

export function parseGhlInboundMessage(
  payload: GhlWebhookPayload,
  tenantId: number,
  rawPayload?: unknown,
): GhlParsedInbound {
  if (payload.type !== 'InboundMessage') {
    throw new GhlParseError(
      `parseGhlInboundMessage: type es '${payload.type}', esperado 'InboundMessage'`,
    );
  }
  const contactInfo = extractContactInfoFromRaw(rawPayload);
  return {
    tenantId,
    ghlLocationId: payload.locationId,
    ghlContactId: payload.contactId,
    ghlConversationId: payload.conversationId ?? null,
    channel: mapMessageTypeToChannel(payload.messageType),
    message: payload.body,
    attachments: payload.attachments ?? [],
    ghlMessageId: payload.messageId ?? null,
    timestamp: payload.timestamp ?? null,
    contactInfo: contactInfo ?? undefined,
    ...(payload.conversationSource ? { conversationSource: payload.conversationSource } : {}),
  };
}

export function parseGhlOutboundMessage(
  payload: GhlWebhookPayload,
  tenantId: number,
): GhlParsedOutbound {
  if (payload.type !== 'OutboundMessage') {
    throw new GhlParseError(
      `parseGhlOutboundMessage: type es '${payload.type}', esperado 'OutboundMessage'`,
    );
  }
  return {
    tenantId,
    ghlLocationId: payload.locationId,
    ghlContactId: payload.contactId,
    ghlConversationId: payload.conversationId ?? null,
    channel: mapMessageTypeToChannel(payload.messageType),
    message: payload.body,
    isAiSelfEcho: containsZwsp(payload.body),
    ghlMessageId: payload.messageId ?? null,
    timestamp: payload.timestamp ?? null,
  };
}

export function containsZwsp(text: string): boolean {
  return typeof text === 'string' && text.includes(ZWSP);
}

function mapMessageTypeToChannel(
  messageType: GhlWebhookPayload['messageType'],
): GhlParsedInbound['channel'] {
  switch (messageType) {
    case 'IG':
      return 'instagram';
    case 'FB Messenger':
      return 'facebook';
    case 'WhatsApp':
      return 'whatsapp';
    case 'Email':
      return 'email';
    case 'SMS':
      return 'sms';
    case 'Custom':
      return 'whatsapp';
  }
}

/** Extrae first_name/last_name/full_name del raw payload Workflow (si existe). */
function extractContactInfoFromRaw(
  raw: unknown,
): { firstName?: string | null; lastName?: string | null; fullName?: string | null } | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const firstName = typeof obj.first_name === 'string' ? obj.first_name : null;
  const lastName = typeof obj.last_name === 'string' ? obj.last_name : null;
  const fullName = typeof obj.full_name === 'string' ? obj.full_name : null;
  if (!firstName && !lastName && !fullName) return null;
  return { firstName, lastName, fullName };
}
