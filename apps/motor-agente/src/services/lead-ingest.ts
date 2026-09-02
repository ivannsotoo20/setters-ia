import type { SupabaseClient } from '@supabase/supabase-js';
import type { InboundMessage } from '@fyzon/channel-adapters';
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

interface InsertInboundMessageParams {
  supabase: SupabaseClient;
  tenantId: number;
  conversationId: number;
  message: InboundMessage;
}

export async function insertInboundMessage({
  supabase,
  tenantId,
  conversationId,
  message,
}: InsertInboundMessageParams): Promise<{ messageId: number }> {
  const contentType = mapMediaTypeToContentType(message.mediaType);

  // Un audio o una imagen sin pie llegan con text='' desde el parser de YCloud.
  // Se guarda NULL, no '': el enriquecedor multimodal busca `content IS NULL`
  // para transcribir/describir, y con '' pasaba de largo sin dejar rastro
  // (2026-09-03: 12 audios de WhatsApp del tenant 7 sin transcribir).
  const content = typeof message.text === 'string' && message.text.trim().length > 0 ? message.text : null;

  const { data, error } = await supabase
    .from('conversation_messages')
    .insert({
      tenant_id: tenantId,
      conversation_id: conversationId,
      source: 'lead',
      content_type: contentType,
      content,
      media_url: message.mediaUrl ?? null,
      sent_at: new Date(message.timestampMs).toISOString(),
    })
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(`insertInboundMessage failed: ${error?.message}`);
  }

  // Actualiza last_message_at de la conversacion (best-effort).
  await supabase
    .from('conversations')
    .update({ last_message_at: new Date(message.timestampMs).toISOString() })
    .eq('id', conversationId);

  return { messageId: Number(data.id) };
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
