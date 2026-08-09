import { ghlRequest } from './api-client.js';
import type {
  GhlContact,
  GhlContactUpsertInput,
  GhlContactUpsertResult,
  GhlCustomField,
} from './types.js';

/**
 * Upsert contact por phone+email+locationId. Crea si no existe, actualiza si sí.
 *
 * Endpoint: POST /contacts/upsert (GHL API v2).
 * Devuelve `{ contact, isNew }`.
 */
export async function upsertContact(
  apiToken: string,
  input: GhlContactUpsertInput,
  fetchImpl?: typeof fetch,
): Promise<GhlContactUpsertResult> {
  if (!input.locationId) throw new Error('upsertContact: locationId requerido');
  if (!input.phone && !input.email) {
    throw new Error('upsertContact: phone o email requerido para identificar contacto');
  }

  const body: Record<string, unknown> = { locationId: input.locationId };
  if (input.phone) body.phone = input.phone;
  if (input.email) body.email = input.email;
  if (input.firstName) body.firstName = input.firstName;
  if (input.lastName) body.lastName = input.lastName;
  if (input.source) body.source = input.source;
  if (input.tags && input.tags.length > 0) body.tags = input.tags;
  if (input.customFields && input.customFields.length > 0) body.customFields = input.customFields;

  const response = await ghlRequest<{
    contact?: GhlContact;
    new?: boolean;
  }>({
    apiToken,
    method: 'POST',
    path: '/contacts/upsert',
    body,
    fetchImpl,
  });

  const contact = response.contact;
  if (!contact || !contact.id) {
    throw new Error('upsertContact: respuesta GHL sin contact.id');
  }

  return {
    contact,
    isNew: Boolean(response.new),
  };
}

/**
 * Carga info de un contacto por ID (read-only).
 *
 * Endpoint: GET /contacts/{id} (GHL API v2).
 * Usado por el router de webhooks para enriquecer un lead nuevo cuando llega
 * un InboundMessage o un OutboundMessage GHL — el payload del webhook trae el
 * `contactId` pero no nombre/teléfono/email del contacto, así que este lookup
 * es necesario antes del upsertLead local.
 */
export async function getContactInfo(
  apiToken: string,
  contactId: string,
  fetchImpl?: typeof fetch,
): Promise<GhlContact | null> {
  if (!contactId) throw new Error('getContactInfo: contactId requerido');

  const response = await ghlRequest<{ contact?: GhlContact }>({
    apiToken,
    method: 'GET',
    path: `/contacts/${encodeURIComponent(contactId)}`,
    fetchImpl,
  });

  return response.contact ?? null;
}

/**
 * Actualiza solo custom fields (merge) sin tocar phone/email/name.
 *
 * Endpoint: PUT /contacts/{id} (GHL API v2). Body parcial.
 */
export async function updateContactCustomFields(
  apiToken: string,
  contactId: string,
  customFields: GhlCustomField[],
  fetchImpl?: typeof fetch,
): Promise<GhlContact> {
  if (!contactId) throw new Error('updateContactCustomFields: contactId requerido');
  if (!customFields || customFields.length === 0) {
    throw new Error('updateContactCustomFields: customFields no puede estar vacío');
  }

  const response = await ghlRequest<{ contact?: GhlContact }>({
    apiToken,
    method: 'PUT',
    path: `/contacts/${encodeURIComponent(contactId)}`,
    body: { customFields },
    fetchImpl,
  });

  if (!response.contact || !response.contact.id) {
    throw new Error('updateContactCustomFields: respuesta GHL sin contact.id');
  }

  return response.contact;
}

/**
 * Actualiza campos básicos de un contacto existente por ID (no upsert).
 *
 * Endpoint: PUT /contacts/{id} (GHL API v2). Body parcial — solo se envían
 * los campos que el caller pasa. Útil para enriquecer un contacto IG/FB
 * existente con email + nombre que el lead da por chat, sin riesgo de crear
 * contactos duplicados (cosa que upsertContact sí podría hacer si phone/email
 * no matchea con ningún contacto existente).
 *
 * Hito 10.6.1 — usado por bookAppointmentFromSlot para sincronizar email/name
 * capturados durante la conversación antes de createAppointment, para que GHL
 * pueda enviar el email de confirmación de cita al lead.
 */
export async function updateContact(
  apiToken: string,
  contactId: string,
  input: {
    email?: string;
    phone?: string;
    firstName?: string;
    lastName?: string;
  },
  fetchImpl?: typeof fetch,
): Promise<GhlContact> {
  if (!contactId) throw new Error('updateContact: contactId requerido');
  const body: Record<string, unknown> = {};
  if (input.email) body.email = input.email;
  if (input.phone) body.phone = input.phone;
  if (input.firstName) body.firstName = input.firstName;
  if (input.lastName) body.lastName = input.lastName;
  if (Object.keys(body).length === 0) {
    throw new Error('updateContact: al menos un campo (email/phone/firstName/lastName) requerido');
  }

  const response = await ghlRequest<{ contact?: GhlContact }>({
    apiToken,
    method: 'PUT',
    path: `/contacts/${encodeURIComponent(contactId)}`,
    body,
    fetchImpl,
  });

  if (!response.contact || !response.contact.id) {
    throw new Error('updateContact: respuesta GHL sin contact.id');
  }

  return response.contact;
}

/**
 * Añade etiquetas a un contacto YA existente, sin tocar las que ya tenga.
 *
 * Endpoint: POST /contacts/{id}/tags (GHL API v2).
 *
 * ⚠️ NO usar `updateContact` para esto. Ese endpoint es `PUT /contacts/{id}` y
 * GHL trata `tags` como REEMPLAZO del array completo: mandar ["inbound"] borraría
 * cualquier etiqueta que el trainer hubiese puesto a mano en ese contacto. Este
 * endpoint es aditivo y es el único seguro para automatizar etiquetado.
 *
 * Devuelve las etiquetas que GHL confirma tras la operación (puede incluir las
 * que ya tenía). Si `tags` viene vacío, no llama a la API.
 */
export async function addContactTags(
  apiToken: string,
  contactId: string,
  tags: string[],
  fetchImpl?: typeof fetch,
): Promise<{ tags: string[] }> {
  if (!contactId) throw new Error('addContactTags: contactId requerido');
  const clean = tags.map((t) => t.trim()).filter((t) => t.length > 0);
  if (clean.length === 0) return { tags: [] };

  const response = await ghlRequest<{ tags?: string[] }>({
    apiToken,
    method: 'POST',
    path: `/contacts/${encodeURIComponent(contactId)}/tags`,
    body: { tags: clean },
    fetchImpl,
  });

  return { tags: Array.isArray(response.tags) ? response.tags : clean };
}
