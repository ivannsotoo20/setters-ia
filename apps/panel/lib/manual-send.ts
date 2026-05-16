import type { SupabaseClient } from '@supabase/supabase-js';
import { decodeCredentialsRow } from './integration-credentials';

/**
 * Envío manual desde el panel (server-only). Replica la lógica de envío del
 * motor pero sin depender del package `@fyzon/channel-adapters` (que tiene
 * imports `.js` que Turbopack no resuelve desde fuentes TS sin un build step).
 *
 * Hace fetch HTTP directo a las APIs públicas de cada provider:
 *   - ManyChat:  POST https://api.manychat.com/fb/sending/sendContent
 *   - YCloud:    POST https://api.ycloud.com/v2/whatsapp/messages/sendDirectly
 *   - GHL:       POST https://services.leadconnectorhq.com/conversations/messages
 *                Apendea ZWSP (​) al mensaje para que cuando el motor
 *                reciba el webhook outbound de GHL (Marketplace), lo
 *                identifique como 'self echo' (ghl-message-router.ts:338)
 *                y NO duplique el insert en BD. El panel ya inserta el
 *                mensaje con source='human' antes de llamar a este helper.
 *
 * Trade-off conocido: si el motor cambia el shape de la request a estos
 * providers (poco probable — son APIs públicas de terceros), hay que
 * actualizar también este archivo. Tests del motor siguen siendo la fuente
 * de verdad sobre el contract.
 */

type SupportedProvider = 'manychat' | 'ycloud' | 'ghl';

interface ChannelInfo {
  channelType: 'whatsapp' | 'instagram' | 'facebook';
  externalUserId: string;
  provider: SupportedProvider;
  apiKey: string;
  businessPhone?: string;
}

export interface ManualSendParams {
  supabase: SupabaseClient;
  conversationId: number;
  text: string;
}

export interface ManualSendResult {
  providerMessageId: string | null;
}

const MANYCHAT_BASE = process.env.MANYCHAT_API_BASE ?? 'https://api.manychat.com';
const YCLOUD_BASE = process.env.YCLOUD_API_BASE ?? 'https://api.ycloud.com';
const GHL_BASE = process.env.GHL_API_BASE ?? 'https://services.leadconnectorhq.com';
const GHL_VERSION = '2021-07-28';
const ZWSP_TAG = '​';

export async function sendManualMessageDirect(
  params: ManualSendParams,
): Promise<ManualSendResult> {
  const { supabase, conversationId, text } = params;
  if (!text.trim()) throw new Error('mensaje vacío');

  const ctx = await loadChannelContext(supabase, conversationId);

  if (ctx.provider === 'manychat') {
    return sendViaManyChat(ctx, text);
  }
  if (ctx.provider === 'ycloud') {
    return sendViaYCloud(ctx, text);
  }
  if (ctx.provider === 'ghl') {
    return sendViaGHL(ctx, text);
  }
  throw new Error(`provider '${ctx.provider}' no soportado en envío manual desde panel`);
}

async function loadChannelContext(
  supabase: SupabaseClient,
  conversationId: number,
): Promise<ChannelInfo> {
  const { data: conv, error: convErr } = await supabase
    .from('conversations')
    .select('id, lead_id, channel_id, tenant_id')
    .eq('id', conversationId)
    .maybeSingle();
  if (convErr) throw new Error(`conversation lookup: ${convErr.message}`);
  if (!conv) throw new Error(`conversation ${conversationId} no encontrado`);

  const { data: channel, error: chErr } = await supabase
    .from('channels')
    .select('id, channel_type')
    .eq('id', Number(conv.channel_id))
    .maybeSingle();
  if (chErr) throw new Error(`channel lookup: ${chErr.message}`);
  if (!channel) throw new Error(`channel ${conv.channel_id} no encontrado`);

  // La relación va de `integration_accounts.channel_id` → `channels.id`
  // (1 channel puede tener N integration_accounts a lo largo del tiempo,
  // pero solo 1 activo por tenant). Filtramos por channel + tenant + active.
  const { data: ia, error: iaErr } = await supabase
    .from('integration_accounts')
    .select('id, provider, credentials, credentials_encrypted, connection_config')
    .eq('channel_id', Number(conv.channel_id))
    .eq('tenant_id', Number(conv.tenant_id))
    .eq('is_active', true)
    .maybeSingle();
  if (iaErr) throw new Error(`integration_account lookup: ${iaErr.message}`);
  if (!ia) {
    throw new Error(
      'sin integration_account activo para este canal — configura las credenciales en /settings/integrations',
    );
  }
  const integrationAccountId = Number(ia.id);

  const credentials = decodeCredentialsRow(ia, integrationAccountId);
  const provider = normalizeProvider(typeof ia.provider === 'string' ? ia.provider : '');
  // GHL guarda el PIT en `credentials.apiToken`. ManyChat/YCloud usan
  // `credentials.api_key`. Mismo mapeo que el motor en outbound-sender.ts.
  // Hito 9 (2026-05-16) — fallback `apiKey` (camelCase) antes de `api_key`
  // (snake_case) para alinear con lo que el panel persiste vía wizard onboarding
  // (lib/actions/integrations.ts). Mismo patrón que motor send-welcome-template.ts.
  const apiKey =
    provider === 'ghl'
      ? typeof credentials.apiToken === 'string'
        ? credentials.apiToken
        : ''
      : typeof credentials.apiKey === 'string' && credentials.apiKey.length > 0
        ? credentials.apiKey
        : typeof credentials.api_key === 'string'
          ? credentials.api_key
          : '';
  if (!apiKey) {
    throw new Error(
      `integration_account ${integrationAccountId} (${provider}) sin token configurado (api_key/apiKey/apiToken)`,
    );
  }

  const connectionConfig = (ia.connection_config ?? {}) as Record<string, unknown>;
  const businessPhone =
    typeof connectionConfig.business_phone === 'string'
      ? connectionConfig.business_phone
      : undefined;

  const channelType = mapChannelTypeFromDb(String(channel.channel_type));

  const { data: lead, error: leadErr } = await supabase
    .from('leads')
    .select('id, external_id')
    .eq('id', Number(conv.lead_id))
    .maybeSingle();
  if (leadErr) throw new Error(`lead lookup: ${leadErr.message}`);
  if (!lead) throw new Error(`lead ${conv.lead_id} no encontrado`);

  return {
    channelType,
    externalUserId: String(lead.external_id),
    provider,
    apiKey,
    businessPhone,
  };
}

function normalizeProvider(value: string): SupportedProvider {
  if (value === 'manychat') return 'manychat';
  if (value === 'ycloud') return 'ycloud';
  if (value === 'ghl') return 'ghl';
  throw new Error(`provider '${value}' no soportado`);
}

function mapChannelTypeFromDb(dbType: string): 'whatsapp' | 'instagram' | 'facebook' {
  if (dbType === 'instagram_dm') return 'instagram';
  if (dbType === 'facebook_messenger') return 'facebook';
  return 'whatsapp';
}

async function sendViaManyChat(ctx: ChannelInfo, text: string): Promise<ManualSendResult> {
  const url = `${MANYCHAT_BASE.replace(/\/$/, '')}/fb/sending/sendContent`;
  const body = {
    subscriber_id: ctx.externalUserId,
    data: {
      version: 'v2',
      content: {
        messages: [{ type: 'text', text }],
      },
    },
    message_tag: ctx.channelType === 'whatsapp' ? 'CUSTOMER_FEEDBACK' : 'ACCOUNT_UPDATE',
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ctx.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    throw new Error(`ManyChat API ${response.status}: ${errBody.slice(0, 200)}`);
  }
  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  const data = (json.data ?? {}) as Record<string, unknown>;
  const providerMessageId =
    (typeof data.message_id === 'string' && data.message_id) ||
    (typeof data.id === 'string' && data.id) ||
    null;
  return { providerMessageId };
}

async function sendViaYCloud(ctx: ChannelInfo, text: string): Promise<ManualSendResult> {
  if (ctx.channelType !== 'whatsapp') {
    throw new Error(`YCloud solo soporta WhatsApp, channel='${ctx.channelType}' no válido`);
  }
  if (!ctx.businessPhone) {
    throw new Error('YCloud adapter requiere business_phone en connection_config');
  }
  const url = `${YCLOUD_BASE.replace(/\/$/, '')}/v2/whatsapp/messages/sendDirectly`;
  const body = {
    from: normalizePhone(ctx.businessPhone),
    to: normalizePhone(ctx.externalUserId),
    type: 'text',
    text: { body: text },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'X-API-Key': ctx.apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    throw new Error(`YCloud API ${response.status}: ${errBody.slice(0, 200)}`);
  }
  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  const providerMessageId =
    (typeof json.id === 'string' && json.id) ||
    (typeof json.wamid === 'string' && json.wamid) ||
    null;
  return { providerMessageId };
}

function normalizePhone(value: string): string {
  return value.startsWith('+') ? value : `+${value}`;
}

async function sendViaGHL(ctx: ChannelInfo, text: string): Promise<ManualSendResult> {
  // Apendear ZWSP es CRÍTICO: el motor recibe el webhook outbound de GHL,
  // detecta el ZWSP y lo trata como 'self_echo' (ghl-message-router.ts:338)
  // — NO duplica insert en BD ni dispara handoff humano por outbound. El
  // panel ya hizo el INSERT con source='human' + ai_paused_until antes de
  // llamar aquí.
  const taggedText = text.includes(ZWSP_TAG) ? text : text + ZWSP_TAG;
  const url = `${GHL_BASE.replace(/\/$/, '')}/conversations/messages`;
  const body = {
    type: mapChannelToGhlType(ctx.channelType),
    contactId: ctx.externalUserId,
    message: taggedText,
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ctx.apiKey}`,
      Version: GHL_VERSION,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    throw new Error(`GHL API ${response.status}: ${errBody.slice(0, 200)}`);
  }
  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  const providerMessageId =
    (typeof json.messageId === 'string' && json.messageId) ||
    (typeof json.id === 'string' && json.id) ||
    null;
  return { providerMessageId };
}

function mapChannelToGhlType(
  channelType: 'whatsapp' | 'instagram' | 'facebook',
): 'WhatsApp' | 'IG' | 'FB Messenger' {
  if (channelType === 'instagram') return 'IG';
  if (channelType === 'facebook') return 'FB Messenger';
  return 'WhatsApp';
}
