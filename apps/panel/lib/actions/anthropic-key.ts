'use server';

import { revalidatePath } from 'next/cache';
import { getEffectiveTenant } from '@/lib/effective-tenant';
import { getServiceRoleClient } from '@/lib/supabase/service-role';
import { encryptJson } from '@/lib/crypto';

/**
 * Clave propia de Anthropic por entrenador (BYOK opcional).
 *
 * Por qué existe: el 2026-08-24 el saldo de la clave de la plataforma se agotó y
 * dejó sin setter a TODOS los entrenadores a la vez. Con clave propia, quedarse
 * sin crédito solo afecta a quien lo gastó, y cada uno ve su factura.
 *
 * Es OPCIONAL: sin clave se usa la de la plataforma. Obligar a abrir cuenta en
 * Anthropic y meter tarjeta antes de poder empezar es fricción que mata altas.
 */

export type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

export interface AnthropicKeyState {
  /** true si el entrenador tiene su propia clave guardada. */
  hasOwnKey: boolean;
  /** Últimos caracteres, para que reconozca cuál puso. Nunca la clave entera. */
  hint: string | null;
}

export async function getAnthropicKeyState(): Promise<ActionResult<AnthropicKeyState>> {
  const effective = await getEffectiveTenant();
  if (!effective) return { ok: false, error: 'unauthenticated' };

  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from('tenant_configs')
    .select('anthropic_api_key_encrypted, anthropic_api_key_hint')
    .eq('tenant_id', effective.tenantId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };

  const raw = (data as { anthropic_api_key_encrypted?: unknown } | null)
    ?.anthropic_api_key_encrypted;
  const hasOwnKey =
    !!raw && typeof raw === 'object' && typeof (raw as { blob?: unknown }).blob === 'string';

  return {
    ok: true,
    data: {
      hasOwnKey,
      hint: (data as { anthropic_api_key_hint?: string | null } | null)?.anthropic_api_key_hint ?? null,
    },
  };
}

/**
 * Guarda la clave del entrenador. La VALIDA contra Anthropic antes de escribir:
 * una clave mal copiada que solo falla cuando escribe una lead es un incidente
 * silencioso; aquí se ve al instante.
 */
export async function setAnthropicKey(apiKey: string): Promise<ActionResult> {
  const effective = await getEffectiveTenant();
  if (!effective) return { ok: false, error: 'unauthenticated' };
  if (!effective.isAgencyAdmin && effective.role !== 'owner') {
    return { ok: false, error: 'Solo el propietario de la cuenta puede cambiar esto.' };
  }

  const key = apiKey.trim();
  if (!key) return { ok: false, error: 'Pega tu clave antes de guardar.' };
  if (!key.startsWith('sk-ant-')) {
    return {
      ok: false,
      error: 'Eso no parece una clave de Anthropic: todas empiezan por "sk-ant-".',
    };
  }

  // Validación real contra Anthropic. Se pide 1 token al modelo más barato: es
  // la llamada más pequeña posible que distingue "clave válida" de "clave
  // válida pero sin saldo", y ese matiz importa.
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ok' }],
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as
        | { error?: { type?: string; message?: string } }
        | null;
      const type = body?.error?.type ?? '';
      const message = body?.error?.message ?? `error ${res.status}`;

      if (res.status === 401 || type === 'authentication_error') {
        return { ok: false, error: 'Anthropic rechaza esa clave. Revisa que la copiaste entera.' };
      }
      if (message.toLowerCase().includes('credit balance')) {
        // La clave es buena; lo que falta es saldo. Se rechaza igual, porque
        // guardarla dejaría al setter mudo sin que nadie sepa por qué.
        return {
          ok: false,
          error:
            'La clave es correcta pero la cuenta no tiene saldo. Añade crédito en Anthropic y vuelve a guardarla.',
        };
      }
      return { ok: false, error: `Anthropic devolvió: ${message}` };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `No se ha podido comprobar la clave con Anthropic: ${msg}` };
  }

  const supabase = getServiceRoleClient();
  const { error } = await supabase
    .from('tenant_configs')
    .update({
      anthropic_api_key_encrypted: { blob: encryptJson(key) },
      anthropic_api_key_hint: key.slice(-4),
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', effective.tenantId);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/settings/integrations');
  return { ok: true };
}

/** Quita la clave del entrenador: vuelve a consumir de la de la plataforma. */
export async function clearAnthropicKey(): Promise<ActionResult> {
  const effective = await getEffectiveTenant();
  if (!effective) return { ok: false, error: 'unauthenticated' };
  if (!effective.isAgencyAdmin && effective.role !== 'owner') {
    return { ok: false, error: 'Solo el propietario de la cuenta puede cambiar esto.' };
  }

  const supabase = getServiceRoleClient();
  const { error } = await supabase
    .from('tenant_configs')
    .update({
      anthropic_api_key_encrypted: null,
      anthropic_api_key_hint: null,
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', effective.tenantId);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/settings/integrations');
  return { ok: true };
}
