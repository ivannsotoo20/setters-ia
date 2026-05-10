'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { encryptJson } from '@/lib/crypto';
import { getEffectiveTenant } from '@/lib/effective-tenant';

/**
 * Server Actions BYOK (Bring Your Own Keys) — el cliente conecta su propio
 * provider (GHL/YCloud/ManyChat/futuro Meta) desde `/settings/integrations`.
 *
 * Flow:
 *   1. Cliente pega credenciales en form.
 *   2. Esta action valida (ping API del provider).
 *   3. Cifra AES-256-GCM con CREDENTIALS_ENCRYPTION_KEY.
 *   4. UPSERT en `integration_accounts` (RLS + service_role).
 *
 * Service role: usamos `createClient` directo con SERVICE_ROLE_KEY porque
 * `integration_accounts.credentials_encrypted` está protegido por RLS y los
 * profiles no tienen permiso INSERT/UPDATE directo. Validamos tenant_id en
 * código (defense in depth).
 */

export type IntegrationProvider = 'ghl' | 'ycloud' | 'manychat' | 'meta_cloud' | 'other';

export interface CreateIntegrationInput {
  provider: IntegrationProvider;
  /** Credenciales según provider — el form envía un objeto plano. */
  credentials: Record<string, string>;
  /** Config no sensible — locationId, business_phone, page_id, etc. */
  connectionConfig: Record<string, string>;
  /** ID del channel asociado. Si no existe se crea con channel_type derivado. */
  channelType: 'whatsapp' | 'instagram_dm' | 'facebook_messenger';
}

export type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

function getServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY missing — required for integrations Server Actions');
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function resolveCallerTenant(
  options?: { requireOwner?: boolean },
): Promise<{ tenantId: number } | { error: string } | null> {
  const effective = await getEffectiveTenant();
  if (!effective) return null;
  if (options?.requireOwner && !effective.isAgencyAdmin && effective.role !== 'owner') {
    return { error: 'forbidden — solo el owner puede modificar integraciones' };
  }
  return { tenantId: effective.tenantId };
}

function isResolveError(
  v: { tenantId: number } | { error: string },
): v is { error: string } {
  return 'error' in v;
}

// ---------------------------------------------------------------------------
// Validators per-provider — ping API del proveedor con las credenciales
// ---------------------------------------------------------------------------

interface ValidateResult {
  ok: boolean;
  /** Mensaje legible si falló. */
  reason?: string;
  /** Info útil derivada del ping (ej: nombre del location GHL). */
  derived?: Record<string, string>;
}

async function validateCredentials(
  provider: IntegrationProvider,
  credentials: Record<string, string>,
  connectionConfig: Record<string, string>,
): Promise<ValidateResult> {
  if (provider === 'ghl') {
    const apiToken = credentials.apiToken;
    const locationId = connectionConfig.locationId || credentials.locationId;
    if (!apiToken || !locationId) {
      return { ok: false, reason: 'apiToken y locationId son requeridos' };
    }
    try {
      const res = await fetch(`https://services.leadconnectorhq.com/locations/${locationId}`, {
        headers: {
          Authorization: `Bearer ${apiToken}`,
          Version: '2021-07-28',
          Accept: 'application/json',
        },
      });
      if (res.status === 401 || res.status === 403) {
        return { ok: false, reason: `GHL rechazó las credenciales (HTTP ${res.status})` };
      }
      if (!res.ok) {
        return { ok: false, reason: `GHL respondió HTTP ${res.status}` };
      }
      const json = (await res.json().catch(() => null)) as { location?: { name?: string } } | null;
      const locationName = json?.location?.name;
      return {
        ok: true,
        derived: locationName ? { locationName } : undefined,
      };
    } catch (err) {
      return { ok: false, reason: `GHL fetch falló: ${(err as Error).message}` };
    }
  }

  if (provider === 'ycloud') {
    const apiKey = credentials.apiKey;
    if (!apiKey) return { ok: false, reason: 'apiKey requerido' };
    try {
      // Validamos contra /v2/whatsapp/businessAccounts: endpoint protegido
      // por API key que devuelve la lista de WABAs accesibles. Confirmado:
      // - dummy key → 401 INVALID_API_KEY
      // - key válida → 200 con array de WABAs (puede ser vacío si la cuenta
      //   aún no tiene WABA conectada, pero la key es válida).
      // /v2/account NO existe (devuelve 404 con auth válida) — ese era el bug.
      const res = await fetch('https://api.ycloud.com/v2/whatsapp/businessAccounts', {
        headers: { 'X-API-Key': apiKey, Accept: 'application/json' },
      });
      if (res.status === 401 || res.status === 403) {
        return { ok: false, reason: `YCloud rechazó la API key (HTTP ${res.status})` };
      }
      if (!res.ok) {
        return { ok: false, reason: `YCloud respondió HTTP ${res.status} (endpoint inesperado)` };
      }
      // Opcional: extraer wabaId de la primera WABA para guardarlo en derived,
      // útil para sincronización de plantillas posterior.
      const json = (await res.json().catch(() => null)) as
        | { list?: Array<{ id?: string; name?: string }>; data?: Array<{ id?: string; name?: string }> }
        | null;
      const list = json?.list ?? json?.data ?? [];
      const firstWaba = Array.isArray(list) && list.length > 0 ? list[0] : null;
      const derived: Record<string, string> = {};
      if (firstWaba?.id) derived.wabaId = String(firstWaba.id);
      if (firstWaba?.name) derived.wabaName = String(firstWaba.name);
      return {
        ok: true,
        derived: Object.keys(derived).length > 0 ? derived : undefined,
      };
    } catch (err) {
      return { ok: false, reason: `YCloud fetch falló: ${(err as Error).message}` };
    }
  }

  if (provider === 'manychat') {
    const apiKey = credentials.apiKey;
    if (!apiKey) return { ok: false, reason: 'apiKey requerido' };
    try {
      const res = await fetch('https://api.manychat.com/fb/page/getInfo', {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      });
      if (!res.ok) return { ok: false, reason: `ManyChat HTTP ${res.status}` };
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: `ManyChat fetch falló: ${(err as Error).message}` };
    }
  }

  if (provider === 'meta_cloud') {
    // Validación básica — si Iván empieza a usar Meta directa, expandimos esto.
    if (!credentials.accessToken || !connectionConfig.pageId) {
      return { ok: false, reason: 'accessToken y pageId requeridos' };
    }
    return { ok: true };
  }

  return { ok: false, reason: `provider '${provider}' no soporta validación todavía` };
}

// ---------------------------------------------------------------------------
// CRUD actions
// ---------------------------------------------------------------------------

export async function listIntegrations(): Promise<
  ActionResult<
    Array<{
      id: number;
      provider: string;
      channelType: string;
      isActive: boolean;
      connectionConfig: Record<string, unknown>;
      updatedAt: string;
    }>
  >
> {
  const ctx = await resolveCallerTenant();
  if (!ctx) return { ok: false, error: 'unauthenticated' };
  if (isResolveError(ctx)) return { ok: false, error: ctx.error };

  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from('integration_accounts')
    .select('id, provider, is_active, connection_config, updated_at, channels(channel_type)')
    .eq('tenant_id', ctx.tenantId)
    .order('id', { ascending: false });

  if (error) return { ok: false, error: error.message };

  type RawRow = {
    id: number;
    provider: string;
    is_active: boolean;
    connection_config: Record<string, unknown> | null;
    updated_at: string;
    channels:
      | { channel_type: string }
      | { channel_type: string }[]
      | null
      | undefined;
  };

  const rows = (data as RawRow[]).map((r) => {
    const ch = Array.isArray(r.channels) ? r.channels[0] : r.channels;
    return {
      id: r.id,
      provider: r.provider,
      channelType: ch?.channel_type ?? '—',
      isActive: r.is_active,
      connectionConfig: r.connection_config ?? {},
      updatedAt: r.updated_at,
    };
  });

  return { ok: true, data: rows };
}

export async function createOrUpdateIntegration(
  input: CreateIntegrationInput,
): Promise<ActionResult<{ id: number; validated: boolean; derived?: Record<string, string> }>> {
  const ctx = await resolveCallerTenant({ requireOwner: true });
  if (!ctx) return { ok: false, error: 'unauthenticated' };
  if (isResolveError(ctx)) return { ok: false, error: ctx.error };

  // 1. Validar credenciales contra el provider real.
  const validation = await validateCredentials(input.provider, input.credentials, input.connectionConfig);
  if (!validation.ok) {
    return { ok: false, error: `Validación falló: ${validation.reason}` };
  }

  // 1b. Mergear info derivada del ping (ej. wabaId YCloud) al connectionConfig
  //     ANTES del UPSERT — así el sync de plantillas (Sprint Iota.1) encuentra
  //     wabaId sin pedir al trainer que lo pegue a mano.
  //     IMPORTANTE: si el trainer pasó wabaId manualmente en input.connectionConfig,
  //     respetamos su valor (no lo sobreescribimos).
  const mergedConnectionConfig: Record<string, string> = { ...input.connectionConfig };
  if (validation.derived) {
    for (const [key, value] of Object.entries(validation.derived)) {
      if (!mergedConnectionConfig[key] && typeof value === 'string') {
        mergedConnectionConfig[key] = value;
      }
    }
  }

  // 2. Cifrar credenciales.
  let encryptedBlob: string;
  try {
    encryptedBlob = encryptJson(input.credentials);
  } catch (err) {
    return { ok: false, error: `Cifrado falló: ${(err as Error).message}` };
  }

  const supabase = getServiceRoleClient();

  // 3. Resolver/crear channel.
  const { data: existingChannel } = await supabase
    .from('channels')
    .select('id')
    .eq('tenant_id', ctx.tenantId)
    .eq('channel_type', input.channelType)
    .eq('via_provider', input.provider)
    .maybeSingle();

  let channelId: number;
  if (existingChannel) {
    channelId = Number(existingChannel.id);
  } else {
    const { data: insertedChannel, error: chErr } = await supabase
      .from('channels')
      .insert({
        tenant_id: ctx.tenantId,
        channel_type: input.channelType,
        via_provider: input.provider,
        is_active: true,
        label: `${input.channelType} via ${input.provider}`,
      })
      .select('id')
      .single();
    if (chErr || !insertedChannel) {
      return { ok: false, error: `Crear channel falló: ${chErr?.message}` };
    }
    channelId = Number(insertedChannel.id);
  }

  // 4. UPSERT integration_account.
  const { data: existing } = await supabase
    .from('integration_accounts')
    .select('id')
    .eq('tenant_id', ctx.tenantId)
    .eq('provider', input.provider)
    .eq('channel_id', channelId)
    .maybeSingle();

  if (existing) {
    const { error: updErr } = await supabase
      .from('integration_accounts')
      .update({
        credentials_encrypted: { blob: encryptedBlob },
        connection_config: mergedConnectionConfig,
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
    if (updErr) return { ok: false, error: `UPDATE falló: ${updErr.message}` };
    revalidatePath('/settings/integrations');
    return {
      ok: true,
      data: { id: Number(existing.id), validated: true, derived: validation.derived },
    };
  }

  const { data: inserted, error: insErr } = await supabase
    .from('integration_accounts')
    .insert({
      tenant_id: ctx.tenantId,
      channel_id: channelId,
      provider: input.provider,
      is_active: true,
      credentials_encrypted: { blob: encryptedBlob },
      connection_config: input.connectionConfig,
    })
    .select('id')
    .single();

  if (insErr || !inserted) return { ok: false, error: `INSERT falló: ${insErr?.message}` };

  revalidatePath('/settings/integrations');
  return {
    ok: true,
    data: { id: Number(inserted.id), validated: true, derived: validation.derived },
  };
}

export async function toggleIntegrationActive(
  integrationId: number,
  active: boolean,
): Promise<ActionResult> {
  const ctx = await resolveCallerTenant({ requireOwner: true });
  if (!ctx) return { ok: false, error: 'unauthenticated' };
  if (isResolveError(ctx)) return { ok: false, error: ctx.error };

  const supabase = getServiceRoleClient();
  const { error } = await supabase
    .from('integration_accounts')
    .update({ is_active: active, updated_at: new Date().toISOString() })
    .eq('id', integrationId)
    .eq('tenant_id', ctx.tenantId);

  if (error) return { ok: false, error: error.message };
  revalidatePath('/settings/integrations');
  return { ok: true };
}

export async function deleteIntegration(integrationId: number): Promise<ActionResult> {
  const ctx = await resolveCallerTenant({ requireOwner: true });
  if (!ctx) return { ok: false, error: 'unauthenticated' };
  if (isResolveError(ctx)) return { ok: false, error: ctx.error };

  const supabase = getServiceRoleClient();
  const { error } = await supabase
    .from('integration_accounts')
    .delete()
    .eq('id', integrationId)
    .eq('tenant_id', ctx.tenantId);

  if (error) return { ok: false, error: error.message };
  revalidatePath('/settings/integrations');
  return { ok: true };
}
