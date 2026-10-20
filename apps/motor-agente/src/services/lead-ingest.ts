import type { SupabaseClient } from '@supabase/supabase-js';
import type { InboundMessage } from '@fyzon/channel-adapters';
import { logger } from '../lib/logger.js';
import { inferTimezoneFromPhone } from '../lib/phone-to-timezone.js';

export interface ResolveTenantResult {
  tenantId: number;
  tokenId: number;
}

/**
 * Resuelve un tenant_token a su tenant_id.
 *
 * @param expectedPurpose Si se pasa, filtra por `tenant_tokens.purpose = expectedPurpose`.
 *   Si se omite, acepta cualquier purpose (útil cuando se introducen nuevos providers).
 *   Cada ruta webhook debería pasar el suyo: `'manychat_webhook'`, `'ycloud_webhook'`, etc.
 */
export async function resolveTenantByToken(
  supabase: SupabaseClient,
  token: string,
  expectedPurpose?: string,
): Promise<ResolveTenantResult | null> {
  let query = supabase
    .from('tenant_tokens')
    .select('id, tenant_id, is_active, purpose, revoked_at')
    .eq('token', token)
    .eq('is_active', true)
    .is('revoked_at', null);

  if (expectedPurpose) {
    query = query.eq('purpose', expectedPurpose);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw new Error(`resolveTenantByToken failed: ${error.message}`);
  }
  if (!data) return null;

  return { tenantId: Number(data.tenant_id), tokenId: Number(data.id) };
}

/**
 * Resuelve el tenant_id a partir del `locationId` de un payload de la App
 * Marketplace GHL (OAuth). Usado por `POST /integrations/webhook/oauth`, donde
 * el webhook común a todas las sub-cuentas instaladas viene SIN token en path
 * — el routing se hace exclusivamente por `connection_config.locationId`
 * en la tabla `integration_accounts`.
 *
 * Filtra por:
 *  - provider = 'ghl'
 *  - is_active = true
 *  - connection_config.auth_type ∈ {'oauth', 'pit'}
 *  - connection_config.locationId = <input>
 *
 * 2026-08-09 — Antes exigía `auth_type === 'oauth'` a secas, y eso dejaba fuera
 * a los tenants conectados con un **PIT** (`auth_type='pit'`), que es lo que crea
 * el formulario BYOK del panel. Síntoma: la app del Marketplace les mandaba los
 * webhooks, no casaban con ningún tenant y se descartaban. Instagram entraba
 * mudo, sin un solo error en los logs.
 *
 * NO se arregla poniéndole `auth_type='oauth'` a una cuenta con PIT: `outbound-sender`
 * interpreta 'oauth' como "refresca el token" e intentaría refrescar unos tokens
 * que no existen en cada envío.
 *
 * Tampoco vale ignorar el `auth_type` por completo. Las filas SIN `auth_type` son
 * las del path legacy de Workflow custom (Hito 9), que reciben sus webhooks por
 * `/integrations/webhook/:tenant_token`. Como cada ruta deduplica con su propio
 * prefijo en Redis, capturarlas aquí además haría que el mismo mensaje se
 * procesara dos veces. Por eso el filtro es una lista blanca explícita.
 *
 * Devuelve `null` si no hay match (caller debería ack 200 ignored para no
 * romper retries del provider ni revelar info de tenants).
 */
const MARKETPLACE_AUTH_TYPES = new Set(['oauth', 'pit']);
export async function resolveTenantByOauthLocation(
  supabase: SupabaseClient,
  locationId: string,
): Promise<number | null> {
  if (!locationId) return null;
  const { data, error } = await supabase
    .from('integration_accounts')
    .select('tenant_id, connection_config')
    .eq('provider', 'ghl')
    .eq('is_active', true);
  if (error || !data) return null;
  for (const row of data) {
    const cc = (row.connection_config ?? {}) as {
      auth_type?: string;
      locationId?: string;
    };
    if (
      cc.auth_type &&
      MARKETPLACE_AUTH_TYPES.has(cc.auth_type) &&
      cc.locationId === locationId
    ) {
      return Number(row.tenant_id);
    }
  }
  return null;
}

interface GetOrCreateChannelParams {
  supabase: SupabaseClient;
  tenantId: number;
  channelType: 'whatsapp' | 'instagram' | 'facebook';
  /**
   * 'ycloud' está disponible tras aplicar `schema/v1/migrations/005-ycloud-provider-enum.sql`.
   * Los tipos DB generados se actualizan tras `pnpm db:generate-types`.
   */
  viaProvider: 'manychat' | 'meta_cloud' | 'ghl' | 'ycloud' | 'other';
}

export async function getOrCreateChannel({
  supabase,
  tenantId,
  channelType,
  viaProvider,
}: GetOrCreateChannelParams): Promise<{ channelId: number }> {
  const channelTypeEnum = mapChannelType(channelType);

  const { data: existing, error: selectError } = await supabase
    .from('channels')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('channel_type', channelTypeEnum)
    .eq('via_provider', viaProvider)
    .maybeSingle();

  if (selectError) {
    throw new Error(`getOrCreateChannel select failed: ${selectError.message}`);
  }
  if (existing) return { channelId: Number(existing.id) };

  const { data: inserted, error: insertError } = await supabase
    .from('channels')
    .insert({
      tenant_id: tenantId,
      channel_type: channelTypeEnum,
      via_provider: viaProvider,
      is_active: true,
      label: `${channelType} via ${viaProvider}`,
    })
    .select('id')
    .single();

  if (insertError || !inserted) {
    throw new Error(`getOrCreateChannel insert failed: ${insertError?.message}`);
  }
  return { channelId: Number(inserted.id) };
}

function mapChannelType(
  ch: 'whatsapp' | 'instagram' | 'facebook',
): 'whatsapp' | 'instagram_dm' | 'facebook_messenger' {
  switch (ch) {
    case 'whatsapp':
      return 'whatsapp';
    case 'instagram':
      return 'instagram_dm';
    case 'facebook':
      return 'facebook_messenger';
  }
}

interface UpsertLeadParams {
  supabase: SupabaseClient;
  tenantId: number;
  channelId: number;
  externalId: string;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  email?: string | null;
  username?: string | null;
}

export async function upsertLead({
  supabase,
  tenantId,
  channelId,
  externalId,
  firstName,
  lastName,
  phone,
  email,
  username,
}: UpsertLeadParams): Promise<{ leadId: number; created: boolean }> {
  const { data: existing, error: selectError } = await supabase
    .from('leads')
    .select('id, timezone')
    .eq('tenant_id', tenantId)
    .eq('channel_id', channelId)
    .eq('external_id', externalId)
    .maybeSingle();

  if (selectError) {
    throw new Error(`upsertLead select failed: ${selectError.message}`);
  }

  // Hito 11 — Inferir timezone IANA del lead a partir del prefijo telefónico.
  // Solo se calcula si phone llega y solo se persiste si la BD aún no tiene
  // valor (NO pisamos un timezone que pudo set otro turno / edición manual).
  const inferredTz = phone != null ? inferTimezoneFromPhone(phone) : null;

  if (existing) {
    // Actualizamos campos opcionales si llegan (sin pisar con null campos ya poblados).
    const patch: Record<string, unknown> = {};
    if (firstName != null) patch.first_name = firstName;
    if (lastName != null) patch.last_name = lastName;
    if (phone != null) patch.phone = phone;
    if (email != null) patch.email = email;
    if (username != null) patch.username = username;
    if (inferredTz && existing.timezone == null) patch.timezone = inferredTz;

    if (Object.keys(patch).length > 0) {
      const { error: updateError } = await supabase
        .from('leads')
        .update(patch)
        .eq('id', existing.id);
      if (updateError) {
        throw new Error(`upsertLead update failed: ${updateError.message}`);
      }
    }
    return { leadId: Number(existing.id), created: false };
  }

  const { data: inserted, error: insertError } = await supabase
    .from('leads')
    .insert({
      tenant_id: tenantId,
      channel_id: channelId,
      external_id: externalId,
      first_name: firstName ?? null,
      last_name: lastName ?? null,
      phone: phone ?? null,
      email: email ?? null,
      username: username ?? null,
      timezone: inferredTz,
    })
    .select('id')
    .single();

  if (insertError || !inserted) {
    throw new Error(`upsertLead insert failed: ${insertError?.message}`);
  }
  return { leadId: Number(inserted.id), created: true };
}

interface GetOrCreateConversationParams {
  supabase: SupabaseClient;
  tenantId: number;
  leadId: number;
  channelId: number;
}

export async function getOrCreateConversation({
  supabase,
  tenantId,
  leadId,
  channelId,
}: GetOrCreateConversationParams): Promise<{ conversationId: number; created: boolean }> {
  const { data: existing, error: selectError } = await supabase
    .from('conversations')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('lead_id', leadId)
    .eq('channel_id', channelId)
    .not('state', 'eq', 'closed')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (selectError) {
    throw new Error(`getOrCreateConversation select failed: ${selectError.message}`);
  }
  if (existing) return { conversationId: Number(existing.id), created: false };

  const { data: inserted, error: insertError } = await supabase
    .from('conversations')
    .insert({
      tenant_id: tenantId,
      lead_id: leadId,
      channel_id: channelId,
      state: 'active',
      direction: 'inbound',
      phase_number: 1,
      phase_message_count: 0,
    })
    .select('id')
    .single();

  if (insertError || !inserted) {
    throw new Error(`getOrCreateConversation insert failed: ${insertError?.message}`);
  }
  return { conversationId: Number(inserted.id), created: true };
}

// ============================================================================
// 2026-10-20 — Antiduplicado de webhooks en la base de datos (migration 080)
// ============================================================================
//
// Hasta el incidente de Redis (17-20 oct) el antiduplicado vivía solo en Redis,
// con TTL de 60 s. Con Redis caído, o cuando el proveedor reintenta pasado ese
// minuto (YCloud hasta ~5,5 h, GHL hasta +10h54m), cada reintento se guardaba
// otra vez: 774 filas duplicadas en el tenant 7, hasta 20 copias de un mensaje.
//
// Dos líneas, y hacen falta las dos:
//   1. `findMessageByProviderId`: el webhook la consulta justo después del
//      Redis. Si el mensaje ya está, contesta 200 sin tocar lead, conversación
//      ni debounce.
//   2. `insertWebhookMessageRows`: INSERT ... ON CONFLICT DO NOTHING contra el
//      índice único (tenant_id, provider, provider_message_id). Cubre la carrera
//      de dos entregas simultáneas que pasan las dos la consulta.

/** Proveedores que entregan mensajes por webhook con un id estable. */
export type MessageProvider = 'ycloud' | 'ghl' | 'manychat';

const PROVIDER_DEDUP_ON_CONFLICT = 'tenant_id,provider,provider_message_id';

interface DbError {
  code?: string;
  message?: string;
}

/**
 * True si el error dice que la migración 080 no está aplicada: columna que
 * PostgREST no conoce (PGRST204), columna inexistente en Postgres (42703) o
 * ON CONFLICT sin índice único que lo respalde (42P10).
 */
export function isProviderDedupSchemaMissing(error: DbError | null | undefined): boolean {
  if (!error) return false;
  if (error.code === 'PGRST204' || error.code === '42703' || error.code === '42P10') return true;
  const msg = error.message ?? '';
  return /provider/.test(msg) && /column|schema cache|ON CONFLICT/i.test(msg);
}

function withoutProviderColumns(row: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...row };
  delete copy.provider;
  delete copy.provider_message_id;
  return copy;
}

let warnedSchemaMissing = false;
function warnProviderDedupUnavailable(error: DbError): void {
  if (warnedSchemaMissing) return;
  warnedSchemaMissing = true;
  logger.warn(
    { code: error.code, err: error.message },
    'antiduplicado en BD desactivado: falta la migration 080 (conversation_messages.provider_message_id); los mensajes se guardan igual',
  );
}

/**
 * Primera línea: ¿este mensaje del proveedor ya está guardado?
 *
 * Fail-open: si la consulta falla (p. ej. la migración aún no está aplicada)
 * devuelve null y el mensaje sigue su curso.
 */
export async function findMessageByProviderId(
  supabase: SupabaseClient,
  tenantId: number,
  provider: MessageProvider,
  providerMessageId: string | null | undefined,
): Promise<{ messageId: number; conversationId: number } | null> {
  if (!providerMessageId) return null;
  const { data, error } = await supabase
    .from('conversation_messages')
    .select('id, conversation_id')
    .eq('tenant_id', tenantId)
    .eq('provider', provider)
    .eq('provider_message_id', providerMessageId)
    .limit(1)
    .maybeSingle();
  if (error) {
    if (isProviderDedupSchemaMissing(error)) {
      warnProviderDedupUnavailable(error);
    } else {
      logger.warn(
        { tenantId, provider, err: error.message },
        'findMessageByProviderId: consulta fallida; se procesa como nuevo',
      );
    }
    return null;
  }
  if (!data) return null;
  return { messageId: Number(data.id), conversationId: Number(data.conversation_id) };
}

/**
 * Segunda línea: inserta las filas de un mensaje entrante. Si alguna lleva
 * `provider_message_id`, va con ON CONFLICT DO NOTHING y `duplicate: true`
 * significa que todas chocaron (ya estaba). Sin id del proveedor es un INSERT
 * normal. Si la migración 080 no está aplicada, reintenta sin las columnas
 * nuevas: el mensaje se guarda igual, sin antiduplicado. Lanza si el INSERT
 * falla por otra causa.
 */
export async function insertWebhookMessageRows(
  supabase: SupabaseClient,
  rows: Array<Record<string, unknown>>,
): Promise<{ ids: number[]; duplicate: boolean }> {
  let toInsert = rows;
  if (rows.some((r) => r.provider_message_id != null)) {
    const { data, error } = await supabase
      .from('conversation_messages')
      .upsert(rows, { onConflict: PROVIDER_DEDUP_ON_CONFLICT, ignoreDuplicates: true })
      .select('id');
    if (!error) {
      const ids = ((data ?? []) as Array<{ id: number }>).map((r) => Number(r.id));
      return { ids, duplicate: ids.length === 0 };
    }
    if (!isProviderDedupSchemaMissing(error)) {
      throw new Error(`insert conversation_messages failed: ${error.message}`);
    }
    warnProviderDedupUnavailable(error);
    toInsert = rows.map(withoutProviderColumns);
  }
  const { data, error } = await supabase.from('conversation_messages').insert(toInsert).select('id');
  if (error || !data || data.length === 0) {
    throw new Error(`insert conversation_messages failed: ${error?.message}`);
  }
  return { ids: (data as Array<{ id: number }>).map((r) => Number(r.id)), duplicate: false };
}

/** Columnas del antiduplicado para la fila `part` de un mensaje del proveedor. */
export function providerMessageColumns(
  provider: MessageProvider,
  providerMessageId: string | null | undefined,
  part = 0,
): { provider?: MessageProvider; provider_message_id?: string } {
  if (!providerMessageId) return {};
  return {
    provider,
    provider_message_id: part === 0 ? providerMessageId : `${providerMessageId}:${part}`,
  };
}

interface InsertInboundMessageParams {
  supabase: SupabaseClient;
  tenantId: number;
  conversationId: number;
  message: InboundMessage;
  /**
   * Proveedor que entregó el webhook. Con él y `message.providerMessageId` el
   * INSERT es a prueba de reintentos (migration 080).
   */
  provider?: MessageProvider;
}

export async function insertInboundMessage({
  supabase,
  tenantId,
  conversationId,
  message,
  provider,
}: InsertInboundMessageParams): Promise<{ messageId: number | null; duplicate: boolean }> {
  const contentType = mapMediaTypeToContentType(message.mediaType);

  // Un audio o una imagen sin pie llegan con text='' desde el parser de YCloud.
  // Se guarda NULL, no '': el enriquecedor multimodal busca `content IS NULL`
  // para transcribir/describir, y con '' pasaba de largo sin dejar rastro
  // (2026-09-03: 12 audios de WhatsApp del tenant 7 sin transcribir).
  const content = typeof message.text === 'string' && message.text.trim().length > 0 ? message.text : null;

  const row = {
    tenant_id: tenantId,
    conversation_id: conversationId,
    source: 'lead',
    content_type: contentType,
    content,
    media_url: message.mediaUrl ?? null,
    sent_at: new Date(message.timestampMs).toISOString(),
  };

  let messageId: number;
  if (provider && message.providerMessageId) {
    const res = await insertWebhookMessageRows(supabase, [
      { ...row, ...providerMessageColumns(provider, message.providerMessageId) },
    ]);
    // Ya estaba: otra entrega del mismo mensaje ganó la carrera.
    if (res.duplicate) return { messageId: null, duplicate: true };
    messageId = res.ids[0]!;
  } else {
    const { data, error } = await supabase
      .from('conversation_messages')
      .insert(row)
      .select('id')
      .single();

    if (error || !data) {
      throw new Error(`insertInboundMessage failed: ${error?.message}`);
    }
    messageId = Number(data.id);
  }

  // Actualiza last_message_at de la conversacion (best-effort).
  await supabase
    .from('conversations')
    .update({ last_message_at: new Date(message.timestampMs).toISOString() })
    .eq('id', conversationId);

  return { messageId, duplicate: false };
}

function mapMediaTypeToContentType(
  mediaType: InboundMessage['mediaType'],
): 'text' | 'audio' | 'image' | 'video' | 'file' {
  switch (mediaType) {
    case 'audio':
      return 'audio';
    case 'image':
      return 'image';
    case 'video':
      return 'video';
    case 'document':
      return 'file';
    default:
      return 'text';
  }
}

// ============================================================================
// Hito 10 sub-fase 3 — WhatsApp inbound mode helpers
// ============================================================================

export type WaInboundMode = 'form_only' | 'all' | 'keyword';

/**
 * Lee `tenant_configs.wa_inbound_mode`. Default 'all' si la fila no existe o
 * el valor es inesperado (defensivo). El default coincide con el de la migration
 * 035 → backwards-compat para tenants existentes.
 */
export async function loadWaInboundMode(
  supabase: SupabaseClient,
  tenantId: number,
): Promise<WaInboundMode> {
  const { data, error } = await supabase
    .from('tenant_configs')
    .select('wa_inbound_mode')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error || !data) return 'all';
  const v = (data as { wa_inbound_mode?: unknown }).wa_inbound_mode;
  if (v === 'form_only' || v === 'all' || v === 'keyword') return v;
  return 'all';
}

/**
 * Devuelve true si existe alguna conversación NO cerrada del lead identificado
 * por (tenantId, externalId) cuyo `conversation_source` coincide con `source`.
 *
 * Usado por el gate WA inbound para detectar si el lead vino por formulario
 * (`source='bienvenida'` lo deja `sendWelcomeTemplate` cuando dispara la
 * plantilla inicial vía `/automations/lead-form`).
 *
 * Si el lead nunca ha conversado (no hay row en `leads` para este externalId),
 * devuelve false directamente.
 */
export async function hasConversationWithSource(
  supabase: SupabaseClient,
  tenantId: number,
  externalId: string,
  source: 'bienvenida' | 'lm' | 'inbound' | 'manual',
): Promise<boolean> {
  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('external_id', externalId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (leadError || !lead) return false;

  const { data: conv, error: convError } = await supabase
    .from('conversations')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('lead_id', (lead as { id: number }).id)
    .eq('conversation_source', source)
    .not('state', 'eq', 'closed')
    .limit(1)
    .maybeSingle();
  if (convError || !conv) return false;
  return true;
}
