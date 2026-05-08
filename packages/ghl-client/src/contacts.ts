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
